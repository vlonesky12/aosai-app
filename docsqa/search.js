import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const L = Math.min(a.length, b.length);
  for (let i = 0; i < L; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function embedText(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return r.data[0].embedding;
}

export function topKByCosine(qVec, items, k = 6) {
  return items
    .map(it => ({ ...it, score: cosine(qVec, it.embed) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Stronger Q&A with citations, refusal when absent, and context trimming

// ...unchanged imports and helpers...

export async function answerFromContext(q, contexts) {
  const blocks = (contexts || []).map((c, i) => {
    const header = `[#${i + 1}] FILE: ${c.file}${c.page ? ` (p.${c.page})` : ''}`;
    return `${header}\n${c.chunk}`;
  });

  const maxChars = 16000;
  let used = 0;
  const trimmed = [];
  for (const b of blocks) {
    if (used + b.length > maxChars) break;
    trimmed.push(b);
    used += b.length;
  }
  const contextText = trimmed.join('\n\n');

  if (!contextText.trim()) {
    return "Not found in the uploaded documents.";
  }

  const system = `
You are AOSAI (Automated Operations & Structural Analysis Intelligence), a construction document assistant.
Answer ONLY using the provided context blocks. If the answer is not explicitly present in the context, reply exactly:
"Not found in the uploaded documents."

Rules:
- Give a concise answer first.
- Put where exactly you find the data/answer
- Quote exact values (measurements, part numbers) when possible.
- Add 1–3 short bullets titled "Why", citing blocks like [#2], [#3], [#5].
- Do NOT invent data or speculate beyond the context.
`.trim();

  const user = `
Question: ${q}

Context:
${contextText}
`.trim();

  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
    // 🔧 remove temperature entirely OR use temperature: 1
  });

  const text = chat.choices?.[0]?.message?.content?.trim() || "";
  return text || "Not found in the uploaded documents.";
}
