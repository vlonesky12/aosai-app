// docsqa/routes.js
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { extractTextFromFile, chunkText } from "./extractor.js";
import { embedText, topKByCosine, answerFromContext } from "./search.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// single Multer instance with limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 100,                  // up to 100 files per request
  },
});

let VECTORS = [];

/* ===================== /ingest ===================== */
router.post("/ingest", (req, res) => {
  upload.array("files", 100)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "FILE_TOO_LARGE", maxMB: 50 });
        if (err.code === "LIMIT_FILE_COUNT") return res.status(413).json({ error: "TOO_MANY_FILES", maxFiles: 100 });
        return res.status(400).json({ error: "UPLOAD_ERROR", code: err.code });
      }
      return res.status(500).json({ error: String(err.message || err) });
    }

    try {
      const totalBytes = (req.files || []).reduce((s, f) => s + (f.size || 0), 0);
      if (totalBytes > 200 * 1024 * 1024) {
        return res.status(413).json({ error: "TOTAL_UPLOAD_TOO_LARGE", maxMB: 200 });
      }

      VECTORS = [];
      for (const f of req.files || []) {
        const text = await extractTextFromFile(f.buffer, f.originalname);
        if (!text) continue;
        const chunks = chunkText(text);
        for (const ch of chunks) {
          const embed = await embedText(ch);
          VECTORS.push({ file: f.originalname, chunk: ch, embed });
        }
      }
      res.json({ ok: true, files: (req.files || []).length, chunks: VECTORS.length });
    } catch (e) {
      res.status(500).json({ error: e.message || "ingest failed" });
    }
  });
});

/* ======================= /ask ====================== */
router.post("/ask", express.json(), async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Missing question" });
    }
    if (!VECTORS.length) {
      return res.status(400).json({ error: "no documents indexed" });
    }

    const qVec = await embedText(question);
    const top = topKByCosine(qVec, VECTORS, 6);
    const ans = await answerFromContext(question, top);

    return res.json({
      answer: ans,
      citations: top.map((t) => ({ file: t.file, snippet: t.chunk.slice(0, 200) })),
    });
  } catch (e) {
    console.error("ASK error:", e);
    return res.status(500).json({ error: e.message || "ask failed" });
  }
});

/* ==================== /summarize ==================== */
const SYSTEM = `
You are AOSAI — a senior estimator & PM. 
Return STRICT JSON following the schema. Do not include prose outside JSON.
Only include stakeholders that appear in the text and cite their page/section in "source".
If timeline is uncertain, include assumptions and set confidence low.
`;

const SCHEMA_KEYS = [
  "executive_summary",
  "key_objectives",
  "scope",
  "estimated_timeline",
  "tools_and_materials",
  "stakeholders",
  "risks_and_mitigations",
  "open_questions",
  "sources",
];

router.post("/summarize", upload.array("files", 100), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).send("No files uploaded.");

    const texts = [];
    for (const f of files) {
      const text = await extractTextFromFile(f.buffer, f.originalname);
      texts.push({
        name: f.originalname,
        text: (text || "").slice(0, 250_000),
      });
    }

    const corpus = texts.map((t) => `### FILE: ${t.name}\n${t.text}`).join("\n\n");

    const USER = `
From the project documents below, produce a JSON object with keys:
- executive_summary: string (<= 180 words)
- key_objectives: string[]
- scope: { in_scope: string[], out_of_scope: string[] }
- estimated_timeline: {
    overall_duration_days: number,
    milestones: [{ name: string, duration_days: number, dependencies?: string[], assumptions?: string[] }],
    assumptions?: string[],
    confidence: "low" | "medium" | "high"
  }
- tools_and_materials: { materials: [{ name: string, qty?: string, notes?: string }], tools: [{ name: string, notes?: string }] }
- stakeholders: [{ name: string, role?: string, email?: string, phone?: string, source: string }]
- risks_and_mitigations: [{ risk: string, impact: "low"|"med"|"high", mitigation: string }]
- open_questions: string[]
- sources: string[]   // filenames and/or page refs used

Rules:
- Only list stakeholders if they appear in text; include "source" (file/page/section).
- If quantities are ambiguous, leave qty blank and add a note.
- Keep it concise and printable.

DOCUMENTS:
${corpus}
`;

    const cc = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 1,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: USER },
  ],
});
    const content = cc.choices?.[0]?.message?.content || "{}";
    let json;
    try { json = JSON.parse(content); } catch { json = {}; }

    for (const k of SCHEMA_KEYS) {
      if (!(k in json)) json[k] = k === "sources" ? [] : k === "key_objectives" ? [] : null;
    }

    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).send(`summarize failed: ${err.message || err}`);
  }
});

export default router;
