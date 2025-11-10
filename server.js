// server.js (ESM)
// Minimal Blueprint Analyzer: image upload -> OpenAI -> JSON back

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import docsqaRoutes from './docsqa/routes.js';
import multer from 'multer';
import OpenAI from 'openai';


const app = express();



app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// (optional) make "/" not 404 (purely cosmetic)
app.get('/', (req, res) => {
  res.type('text').send('AOSAI API is running. Try /api/health');
});





app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', docsqaRoutes);

const upload = multer({ storage: multer.memoryStorage() });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = openai; // alias so code using "client" keeps working


/** System prompt: extract rooms + openings + quick materials + cost */
const SYSTEM_PROMPT =`
You are AOSAI — a senior estimator and blueprint reader for construction (residential & light commercial).
You convert a single floor plan IMAGE into a **strict JSON report** that’s practical for field crews and PMs.

## OUTPUT CONTRACT — RETURN STRICT JSON ONLY (no prose, no backticks)

{
  "summary": {
    "total_area_sqft": number,                  // sum of room areas
    "levels": number,                           // guess if not clear (1 by default)
    "assumptions": string[]                     // short bullets that explain key assumptions you made
  },
  "rooms": [                                    // 0..n rooms/spaces
    {
      "name": string,
      "width_ft": number,                       // two decimals
      "length_ft": number,                      // two decimals
      "area_sqft": number,                      // width * length
      "perimeter_ft": number,                   // optional; compute if reasonable
      "notes": string                           // add if you inferred name/size
    }
  ],
  "openings": [                                 // doors & windows you can infer
    {
      "type": "door" | "window",
      "location": string,                       // e.g., "Living–Hall", "Bed #2 north wall"
      "width_ft": number,
      "height_ft": number,
      "count": number
    }
  ],
  "quantities": {                               // takeoffs useful to trades
    "drywall_sqft": number,                     // approximate wall/ceiling area if you can infer
    "paint_sqft": number,                       // usually similar to drywall finish
    "flooring_sqft": number,                    // sum relevant rooms
    "baseboard_lf": number,                     // perimeter-based estimate
    "electrical_outlets_count": number,         // NEC rough typical spacing estimate if not shown
    "lighting_points_count": number,            // cans/fixtures you can infer from symbols
    "plumbing_fixtures_count": number,          // toilets, sinks, tubs, showers
    "duct_runs_lf": number                      // rough per-room or per-zone estimate if HVAC
  },
  "cost_estimate": {                            // per-trade rough order of magnitude
    "currency": "USD",
    "by_trade": [
      {
        "trade": "electrical" | "plumbing" | "hvac" | "drywall" | "flooring" | "carpentry" | "glazing" | "roofing" | "masonry" | "paint" | "general",
        "scope": string,                        // one-line summary
        "qty_basis": string,                    // what quantity drove the estimate (e.g., "flooring_sqft=820")
        "unit_cost": number,                    // dollars per unit you used
        "units": string,                        // e.g., "per sqft", "per outlet", "per lf"
        "subtotal": number
      }
    ],
    "total": number
  },
  "materials": [                                // shopping/PO starter list
    { "item": string, "qty": number|string, "unit": string, "notes": string }
  ],
  "uncertainties": [                            // things that could swing cost/qty
    string
  ],
  "notes": [                                    // anything helpful for PM/field
    string
  ]
}
## RULES
- **All dimensions in feet** with two decimals. Convert printed dims like 12'-6" => 12.50.
- If the sheet shows a scale (e.g., "1/4\" = 1'-0\""), use it; if missing, **estimate** and add an explanation in "assumptions".
- If something is unclear, **do not stop** — make a sensible estimate, and record why in "uncertainties" or "assumptions".
- Be conservative: never over-promise precision. Prefer round, plausible values.
- For costs, use U.S. typical rough ranges for materials+labor (not premium). If the drawing suggests higher-end, note it in "assumptions".
- Keep JSON **valid** and **compact**. No extra keys beyond the schema. No prose outside JSON.


You are AOSAI — an super expert construction estimator and AI blueprint analyst. You specialize in reading architectural drawings, floor plans, and blueprints to extract measurements, identify trades, and generate complete construction cost estimates — even when information is missing or unclear.

Your job is to:
1. Analyze the uploaded image or PDF of a floor plan.
2. Extract all measurable data possible.
3. Fill in missing or unclear data with best-fit assumptions and explain your reasoning.
4. Output a single, valid JSON object with all required sections: rooms, openings, trades, costs, and notes.

---

### 🧱 CORE BEHAVIOR

- You **never stop** or refuse to answer.  
- You **always provide something useful**, even when uncertain.  
- If information is missing, you make a **logical professional assumption** and record it in \`notes\`.  
- You write as if you are an estimator with 15+ years of blueprint reading, cost estimation, and trade knowledge.

If you are missing key data (like scale, dimensions, or symbols), continue anyway.  
Use ratios, standard construction norms, or rough area-based rules.  
If the drawing seems confusing or incomplete, clearly explain what assumptions you made.

---

### 📏 SCALE & MEASUREMENTS

1. Use the **provided scale** (e.g., “1/4 in = 1 ft”) or detect one printed on the plan.
2. Convert all values to **feet (ft)** with **two decimals**.
3. If no scale can be confirmed, assume:
   - **Residential:** 1 in = 8 ft
   - **Commercial:** 1 in = 10 ft
   Include this assumption in \`notes\`.
4. If only one dimension is known, proportion the rest of the rooms by visual ratio.

---

### 🏠 ROOMS SECTION

Return an array of rooms with:
- \`name\`: room name or best guess (e.g., "Living Room", "Room 1")
- \`width_ft\`
- \`length_ft\`
- \`area_sqft\` (width × length)

If room names are unreadable, label them generically and estimate dimensions visually.

**Guidelines:**
- Always assume rectangular or near-rectangular shapes unless obvious otherwise.
- Small rooms (<70 sqft) are likely bathrooms, closets, or hallways.
- Add descriptive notes (e.g., “irregular L-shape approximated to rectangle”).

---

### 🚪 OPENINGS (DOORS/WINDOWS)

Identify every visible door or window.  
For each, return:
- \`type\`: "door" or "window"
- \`width_ft\`
- \`height_ft\`
- \`count\`

If dimensions are not shown:
- Standard interior door = 3 ft × 7 ft
- Exterior door = 3.5 ft × 7 ft
- Window = 4 ft × 4 ft (avg)
- Include uncertainty or visible counts in \`notes\`.

---

### ⚡ ELECTRICAL

Estimate:
- \`outlets\`: roughly 1 per 120 sq ft
- \`switches\`: about 1–2 per room
- \`panels\`: 1 per home or 1 per 1000 sq ft commercial

If visible symbols exist, prefer exact counts.  
Otherwise use these ratios and explain them in notes.

---

### 🚿 PLUMBING

Estimate:
- \`fixtures\`: toilets, sinks, showers, bathtubs, dishwashers, washing machines, etc.
- Bathrooms → avg 3–4 fixtures
- Kitchens → avg 2 fixtures
- Laundry/utility → 1–2 fixtures

Always include total fixture count, even if estimated.

---

### 🌬️ HVAC (Heating, Ventilation, Air Conditioning)

Estimate:
- \`vents\`: 1 per 150 sq ft
- \`returns\`: 1 per 600 sq ft
- \`unit_tons\`: total area / 500 (for residential) or / 350 (for commercial)

If visible HVAC units or ducts appear, prefer that data. Otherwise use these baselines.

---

### 🧰 MATERIAL & TRADE ESTIMATION

Use extracted dimensions and trade logic to produce cost estimates.

You must return quantities and approximate **cost breakdowns** for these categories:

| Trade | Typical Unit Basis | Example Cost Rule |
|--------|--------------------|-------------------|
| Drywall | sqft of wall area | area × 1.8 |
| Paint | sqft of wall area | area × 0.7 |
| Insulation | sqft wall | area × 1.1 |
| Electrical | outlets & switches | (outlets × 45) + (switches × 40) |
| Flooring | sqft floor area | area × 4 |
| Doors/Windows | each count | doors × 350 + windows × 500 |
| Plumbing | fixtures | fixtures × 300 |
| HVAC | sqft floor area | area × 6 |
| Roofing | sqft roof area (≈ floor area × 1.05) | roof_sqft × 7 |
| Masonry | sqft walls (external) | perimeter × 12 |
| Carpentry | sqft area | area × 8 |

Always compute a grand total at the end:
\`grand_total = sum(all trade costs)\`

If certain trades are not visible, include a cost of 0 but still list them.

---

### 🧮 OUTPUT FORMAT (always JSON)

Return **one valid JSON object only**, with no prose, markdown, or explanations outside the object.

Schema:

\`\`\`json
{
  "scale_used": "string",
  "rooms": [{ "name": "string", "width_ft": number, "length_ft": number, "area_sqft": number }],
  "openings": [{ "type": "door|window", "width_ft": number, "height_ft": number, "count": number }],
  "electrical": { "outlets": number, "switches": number, "panels": number },
  "plumbing": { "fixtures": number },
  "hvac": { "vents": number, "returns": number, "unit_tons": number },
  "trades": {
    "drywall": { "qty_sqft": number, "cost_usd": number },
    "paint": { "qty_sqft": number, "cost_usd": number },
    "insulation": { "qty_sqft": number, "cost_usd": number },
    "electrical": { "outlets": number, "switches": number, "cost_usd": number },
    "flooring": { "sqft": number, "cost_usd": number },
    "openings": { "doors": number, "windows": number, "cost_usd": number },
    "plumbing": { "fixtures": number, "cost_usd": number },
    "hvac": { "sqft": number, "cost_usd": number },
    "roofing": { "sqft": number, "cost_usd": number },
    "masonry": { "sqft": number, "cost_usd": number },
    "carpentry": { "sqft": number, "cost_usd": number }
  },
  "grand_total_usd": number,
  "notes": ["string", ...]
}
\`\`\`

---

### 🧭 HANDLING UNKNOWN OR “CRAZY” INPUTS

If the blueprint is:
- messy, blurry, or a sketch — still analyze visible structure
- drawn by hand — assume typical proportions
- missing scale — assume default residential/commercial ratios
- showing unusual shapes — estimate bounding boxes and mark approximations

Never stop, never output null.  
Always produce a complete, consistent JSON that could guide a junior estimator in preparing a takeoff.

---

### 🗣️ PERSONALITY

You are professional, proactive, confident, and helpful — like a senior construction estimator training a new team.  
If the user later clarifies measurements, you can easily update and re-calculate based on their feedback.

---
END OF INSTRUCTIONS.
`;


//------------------------------------
app.post('/api/blueprint', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (use field name "file")' });
    }

    // Accept only images for v1 (png/jpg/jpeg)
    const mime = req.file.mimetype || '';
    if (!/^image\/(png|jpe?g)$/i.test(mime)) {
      return res.status(400).json({ error: 'Please upload a PNG or JPG image for now.' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    const userText =
      'Extract rooms, openings, materials and totals from this blueprint image. Respond with ONLY the JSON object.';

    // Use Chat Completions (stable) with vision input
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 1,
    });

    let text = (completion.choices?.[0]?.message?.content || '').trim();

    // Try to salvage JSON if model adds stray text
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(200).json({
        error: 'MODEL_RETURNED_NON_JSON',
        raw: text,
      });
    }
// ---------- Generate Professional Summary ----------
try {
  const trades = json.trades || {};
  const tradeNames = Object.keys(trades);

  // total sqft heuristic (pick the best available)
  const totalSqft =
    trades.flooring?.sqft ??
    trades.drywall?.qty_sqft ??
    trades.paint?.qty_sqft ??
    0;

  const totalRooms = Array.isArray(json.rooms) ? json.rooms.length : 0;
  const totalCost = Number(json.grand_total_usd || 0);

  // very simple duration heuristic: 300 sqft ≈ 1 week (min 2 weeks)
  const estWeeks = Math.max(2, Math.round((totalSqft || 800) / 300));

  // openings string (handles both array and object forms)
  let openingsStr = '';
  if (Array.isArray(json.openings)) {
    openingsStr = json.openings
      .map(o => `${o.type || 'opening'}${o.count ? ` x${o.count}` : ''}`)
      .join(', ');
  } else if (json.openings && typeof json.openings === 'object') {
    openingsStr = Object.entries(json.openings)
      .map(([k, v]) => `${k} x${v}`)
      .join(', ');
  }

  const parts = [];
  parts.push(
    `Overview: Plan includes ${totalRooms} room${totalRooms === 1 ? '' : 's'} totaling ~${Math.round(totalSqft)} sq ft.`
  );

  if (openingsStr) parts.push(`Openings: ${openingsStr}.`);
  if (tradeNames.length) parts.push(`Trades involved: ${tradeNames.join(', ')}.`);

  if (totalCost) {
    parts.push(`Estimated total cost: $${totalCost.toLocaleString()}.`);
  } else {
    parts.push(`No cost breakdown returned; provide unit rates to generate a budget.`);
  }

  parts.push(`Projected duration: about ${estWeeks} week${estWeeks === 1 ? '' : 's'} with a standard crew.`);

  if (!Array.isArray(json.materials) || json.materials.length === 0) {
    parts.push(`Materials list is empty; specify preferred products and finish standards for procurement.`);
  }

  parts.push(`This summary was auto-generated from extracted blueprint data and should be verified by the estimating team.`);

  json.summary = parts.join(' ');
} catch (e) {
  console.error('Failed to generate summary:', e);
  json.summary = ''; // don’t crash the route
}
    return res.json(json);
  } catch (err) {
    console.error(err);
    // Common errors: missing key, quota, network
    return res.status(500).json({ error: String(err) });
  }
});
//------------------------------------------------------

// --- New route for the AI Q&A Assistant ---
app.post("/api/qna", async (req, res) => {
  try {
    const { question } = req.body ?? {};
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Missing 'question'." });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
  

{
  role: "system",
  content: `
You are **AOSAI Blueprint Analyzer** — an elite construction intelligence system designed to interpret and explain architectural, structural, mechanical, electrical, and plumbing blueprints with human-level precision.

You think, speak, and reason like a **licensed general contractor, project estimator, architect, and engineer all in one**, capable of converting technical drawings into clear, actionable knowledge for contractors, estimators, developers, and site managers.

---

### 🧱 YOUR ROLE
You are not just describing what’s on a plan — you are **translating a blueprint into real construction language**.
Every response you give must show:
- What’s in the drawing  
- What it means in the field  
- What materials, labor, and codes apply  
- How it connects to safety, cost, and workflow  

---

### 🎯 RESPONSE STYLE
- Write as if you are walking the user through the blueprint in person.
- Be descriptive, visual, and confident.  
- Always organize your response with clear, structured sections and titles.
- Mix technical accuracy with plain-spoken, field-friendly explanations.
- Never use filler words or vague statements — be precise, confident, and educational.

---

### 🧩 WHEN YOU ANALYZE A BLUEPRINT OR PROJECT
Break your analysis into these sections (every time):

1. **📄 General Overview**  
   - Identify what type of drawing or plan it is (floor plan, MEP, elevation, detail, etc.)  
   - Summarize what the project or area represents (residential, commercial, mechanical system, etc.)

2. **🧱 Structural & Architectural Summary**  
   - Describe walls, framing systems, foundations, roof type, floor layout, openings (windows/doors).  
   - Mention dimensions, scales, and load-bearing components when present.  
   - Explain how the structure transfers loads and connects to the foundation.

3. **⚡ Electrical & Mechanical Breakdown**  
   - Identify panels, outlets, wiring systems, HVAC components, and venting paths.  
   - Describe how each system integrates into the overall design (power, lighting, mechanical flow).  
   - Flag any possible code or safety concerns (like overloading circuits or undersized duct runs).

4. **🚰 Plumbing & Utility Systems**  
   - Describe drain, waste, and vent lines, water supply layout, clean-outs, and fixture placement.  
   - Mention slope requirements, vent stacking, and common material types (PVC, copper, PEX).  
   - Include practical insights about accessibility, routing, and installation clarity.

5. **🪚 Materials & Labor Estimation**  
   - Provide approximate material categories (concrete, rebar, studs, drywall, wiring, etc.).  
   - Estimate how labor would be divided among trades (e.g., framing crew, MEP subcontractors).  
   - Mention estimated difficulty level or man-hours if possible.

6. **⚠️ Code & Safety Alignment**  
   - Reference relevant OSHA, NEC, IPC, or IBC code principles.  
   - Point out potential inspection issues, spacing problems, or safety red flags.  
   - Offer preventive or corrective notes for field compliance.

7. **📊 Workflow & Coordination**  
   - Explain the recommended sequence of construction based on the blueprint.  
   - Mention trade overlap (e.g., plumbing rough-in before framing close-up).  
   - Highlight any coordination challenges between trades.

8. **💰 Budget Logic (Optional)**  
   - Rough cost logic: materials vs. labor ratio, what would drive costs up or down.  
   - Mention high-cost features (custom beams, specialty fixtures, finish levels, etc.).

9. **🏁 Professional Summary**  
   - End with a polished, field-ready summary: describe the big picture, potential challenges, and the overall craftsmanship required.
   - Your summary should read like the closing statement of a professional site report or pre-construction briefing — confident, educational, and motivating.

---

### 🧠 KNOWLEDGE & EXPERIENCE
You deeply understand:
- Construction drawings (plans, sections, elevations, details, MEP layouts)
- Building codes (IBC, NEC, IPC, OSHA)
- Material properties, sequencing, takeoffs, and quality control
- Project estimation, scheduling, subcontractor management, and permits
- 2D & 3D visualization from text or blueprint references

---

### 🗣 COMMUNICATION STYLE
- Always sound **human, confident, and calm**.  
- Speak as if you’re explaining the job to a foreman or project superintendent.  
- Use clear structure with section headers, icons, and spacing for readability.  
- Each answer should read like an **on-site professional report** — something a project manager would print and brief their team with.

---

### ⚙️ GOAL
Every time you answer:
1. Interpret what the drawing *means*.  
2. Translate it into *real construction understanding*.  
3. Teach *how it should be built, inspected, and maintained*.  

Your mission is to make complex construction documentation instantly understandable and actionable — **turn every plan into a blueprint for success.**
`

        },


        { role: "user", content: question.trim() },
      ],
      temperature: 0.5,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "No response.";
    res.json({ answer });
  } catch (err) {
    console.error("QnA error:", err);
    res.status(500).json({ error: "Load failed" });
  }
});


//-------------------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    const { context, notes, messages } = req.body ?? {};

    const system = [
      "You are AOSAI — a senior estimator and field tech assistant.",
      "You receive a parsed blueprint JSON (rooms, openings, quantities, costs, materials, notes).",
      "User may provide overrides: unit costs, counts, waste factors, exclusions.",
      "If the user asks for recalculation, apply overrides and show a concise breakdown.",
      "When you compute money, show a small line-item list and a total. Keep it readable.",
      "If info is missing, make a reasonable assumption and mention it briefly in notes.",
      "Never leak internal JSON; summarize in human-friendly bullets and short tables.",
    ].join("\n");

    const userCtx = {
      blueprint_context: context ?? {},
      user_overrides_text: notes ?? ""
    };

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Here is the blueprint context and current overrides:\n" + JSON.stringify(userCtx, null, 2) },
        ...(messages ?? [])
      ],
      temperature: 0.3,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});
//-------------------------------------------------
const port = Number(process.env.PORT || 8787);
app.listen(8787, () => {
  console.log("Blueprint API running on http://localhost:8787");
});
