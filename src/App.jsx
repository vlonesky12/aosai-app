// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";

// after imports, near the start of file:
const API = import.meta.env.VITE_API_BASE || window.location.origin;


/* ----------------------------- UI Helpers ----------------------------- */
function Card({ title, right, children }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
function SectionEmpty({ text = "No data." }) {
  return <p className="text-gray-500 italic">{text}</p>;
}

/* ------------------------- Dashboard Tiles --------------------------- */
function DashboardTiles({ onOpen }) {
  const tiles = [
    ["analyzer", "Blueprint\nAnalyzer", "🗺️", "green"],
    ["qna", "AI\nQ&A", "❓", "orange"],
    ["schedules", "Schedules", "📅", "green"],
    ["calculators", "Calculators", "🧮", "orange"],
    ["docsqa", "Docs Q&A", "📄", "green"],
    ["reports", "Reports", "📊", "orange"],
    ["photo", "Photo\nEstimator", "📷", "green"],
    ["team", "Team", "👥", "orange"],
    ["settings", "Settings", "⚙️", "green"],
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-semibold text-[#1C1C1C]">AOSAI — Field Suite</h2>
        <p className="text-gray-600">Demo Dashboard</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-6">
        {tiles.map(([key, label, icon, color]) => {
          const bg = color === "green" ? "bg-[#2ECC71]" : "bg-[#FF7A00]";
          const hover = color === "green" ? "hover:bg-[#2ECC71]/90" : "hover:bg-[#FF7A00]/90";
          return (
            <button
              key={key}
              onClick={() => onOpen(key)}
              className={`${bg} ${hover} text-white rounded-2xl p-6 flex flex-col items-start justify-center shadow-lg transform transition hover:-translate-y-0.5 focus:outline-none`}
              style={{ minHeight: 140 }}
              title={label.replace("\n", " ")}
            >
              <div className="text-4xl mb-4">{icon}</div>
              <div className="text-xl font-bold leading-tight whitespace-pre-line">{label}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-md text-[#1C1C1C] border bg-white"
        >
          Print
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- App Start ------------------------------ */
export default function App() {
  const [tab, setTab] = useState("dashboard"); // default to dashboard

  /* -------------------- Blueprint Analyzer state --------------------- */
  const [file, setFile] = useState(null);
  const [scaleText, setScaleText] = useState('1/4" = 1\'-0"');
  const [trades, setTrades] = useState("electrical, plumbing, drywall, flooring, hvac");
  const [bpLoading, setBpLoading] = useState(false);
  const [bpError, setBpError] = useState("");
  const [bpRaw, setBpRaw] = useState(""); // raw JSON text from server
  const bp = useMemo(() => {
    try {
      return bpRaw ? JSON.parse(bpRaw) : null;
    } catch {
      return null;
    }
  }, [bpRaw]);

  // ---------- NORMALIZE SERVER SHAPE -> UI ARRAYS ----------
  const tradesForUI = useMemo(() => {
    if (!bp?.trades) return [];

    const toQty = (obj) => {
      if ("sqft" in obj) return { qty: obj.sqft, unit: "sqft" };
      if ("qty_sqft" in obj) return { qty: obj.qty_sqft, unit: "sqft" };
      if ("outlets" in obj) return { qty: obj.outlets, unit: "ea" };
      if ("switches" in obj) return { qty: obj.switches, unit: "ea" };
      if ("fixtures" in obj) return { qty: obj.fixtures, unit: "ea" };
      return { qty: undefined, unit: undefined };
    };

    return Object.entries(bp.trades).map(([name, obj]) => ({
      scope: name,
      total: obj.cost_usd ?? obj.cost ?? 0,
      ...toQty(obj),
    }));
  }, [bp]);

  const openingsForUI = useMemo(() => {
    if (!bp?.openings) return [];
    if (Array.isArray(bp.openings)) return bp.openings;

    return Object.entries(bp.openings).map(([k, v]) => ({
      type: k,
      count: typeof v === "number" ? v : v?.count ?? undefined,
      notes: v?.notes,
    }));
  }, [bp]);

  const quantitiesForUI = useMemo(() => {
    if (!bp?.quantities) return [];
    if (Array.isArray(bp.quantities)) return bp.quantities;

    return Object.entries(bp.quantities).map(([item, v]) => ({
      item,
      qty: v?.qty,
      unit: v?.unit,
      notes: v?.notes,
    }));
  }, [bp]);

  async function handleBlueprintUpload(e) {
    e.preventDefault();
    setBpError("");
    setBpRaw("");
    if (!file) {
      setBpError("Please choose a PNG/JPG blueprint image first.");
      return;
    }
    try {
      setBpLoading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scaleText", scaleText);
      fd.append("trades", trades);
      const res = await fetch(`${API}/api/blueprint`, { method:"POST", body: fd });

      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      const json = await res.json();
      setBpRaw(JSON.stringify(json, null, 2));
    } catch (err) {
      setBpError(String(err.message || err));
    } finally {
      setBpLoading(false);
    }
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }
  function downloadJSON() {
    if (bp) download("blueprint_analysis.json", JSON.stringify(bp, null, 2));
  }
  function roomsCSV() {
    if (!bp?.rooms?.length) return "";
    const header = ["name", "width_ft", "length_ft", "area_sqft", "perimeter_ft", "notes"];
    const rows = bp.rooms.map((r) => header.map((h) => r[h] ?? "").join(","));
    return [header.join(","), ...rows].join("\n");
  }
  function materialsCSV() {
    if (!bp?.materials?.length) return "";
    const header = ["item", "qty", "unit", "notes"];
    const rows = bp.materials.map((m) => header.map((h) => m[h] ?? "").join(","));
    return [header.join(","), ...rows].join("\n");
  }

  /* --------------------------- AI Q&A state --------------------------- */
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]); // {role:'user'|'assistant', content:string}
  const [pricingNotes, setPricingNotes] = useState("");

  async function sendQnA() {
    const msg = qaInput.trim();
    if (!msg) return;
    setQaHistory((h) => [...h, { role: "user", content: msg }]);
    setQaInput("");
    setQaLoading(true);
    try {
        const res = await fetch(`${API}/api/chat`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: bp,
          notes: pricingNotes,
          messages: [{ role: "user", content: msg }],
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? "(no reply)";
      setQaHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (err) {
      setQaHistory((h) => [...h, { role: "assistant", content: "Error: " + String(err) }]);
    } finally {
      setQaLoading(false);
    }
  }

  /* ------------------- Team / Jobs / Schedules state ------------------ */
  const [team, setTeam] = useState(() => {
    const saved = localStorage.getItem("aosai_team");
    return saved ? JSON.parse(saved) : [{ id: "w1", name: "Alex R", role: "Lead Tech" }];
  });
  const [jobs, setJobs] = useState(() => {
    const saved = localStorage.getItem("aosai_jobs");
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => localStorage.setItem("aosai_team", JSON.stringify(team)), [team]);
  useEffect(() => localStorage.setItem("aosai_jobs", JSON.stringify(jobs)), [jobs]);

  /* --------------------------- Calculators ---------------------------- */
  const [calcLength, setCalcLength] = useState(10);
  const [calcWidth, setCalcWidth] = useState(5);
  const [calcHeight, setCalcHeight] = useState(0.75);
  const [calcPriceUnit, setCalcPriceUnit] = useState(3.5);
  const calcArea = calcLength * calcWidth;
  const calcVolume = calcLength * calcWidth * calcHeight;
  const calcTotal = calcArea * calcPriceUnit;

  /* ===================== Photo Estimator (Visual) ===================== */
  function distance(a, b) {
    if (!a || !b) return 0;
    const dx = a.x - b.x,
      dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function fmtInchesToFeet(inches) {
    if (!inches || !isFinite(inches)) return "—";
    const feet = inches / 12;
    return `${inches.toFixed(2)} in (${feet.toFixed(2)} ft)`;
  }
  function PhotoEstimatorVisual() {
    const [imgSrc, setImgSrc] = useState("");
    const [natural, setNatural] = useState({ w: 0, h: 0 });
    const [refPts, setRefPts] = useState([]); // [{x,y},{x,y}]
    const [tgtPts, setTgtPts] = useState([]); // [{x,y},{x,y}]
    const [refLenIn, setRefLenIn] = useState(3.37); // example: card long edge
    const imgRef = useRef(null);
    const wrapRef = useRef(null);

    useEffect(() => {
      if (!imgRef.current) return;
      const i = imgRef.current;
      const handle = () => setNatural({ w: i.naturalWidth, h: i.naturalHeight });
      if (i.complete) handle();
      else i.addEventListener("load", handle);
      return () => i.removeEventListener && i.removeEventListener("load", handle);
    }, [imgSrc]);

    function toImageXY(evt) {
      if (!wrapRef.current || !imgRef.current) return null;
      const rect = wrapRef.current.getBoundingClientRect();
      const xClient = evt.clientX - rect.left;
      const yClient = evt.clientY - rect.top;
      const dispW = rect.width,
        dispH = rect.height;
      if (!natural.w || !natural.h || !dispW || !dispH) return null;
      const sx = natural.w / dispW,
        sy = natural.h / dispH;
      return { x: xClient * sx, y: yClient * sy, xDisp: xClient, yDisp: yClient };
    }
    function handleClick(evt) {
      const p = toImageXY(evt);
      if (!p) return;
      if (refPts.length < 2) setRefPts((a) => [...a, p]);
      else if (tgtPts.length < 2) setTgtPts((a) => [...a, p]);
    }
    function resetPoints() {
      setRefPts([]);
      setTgtPts([]);
    }

    const refPx = refPts.length === 2 ? distance(refPts[0], refPts[1]) : 0;
    const tgtPx = tgtPts.length === 2 ? distance(tgtPts[0], tgtPts[1]) : 0;
    const inPerPx = refPx > 0 ? refLenIn / refPx : 0;
    const estimateIn = tgtPx * inPerPx;

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Upload photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  resetPoints();
                  const f = e.target.files?.[0];
                  if (!f) {
                    setImgSrc("");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setImgSrc(String(reader.result || ""));
                  reader.readAsDataURL(f);
                }}
                className="block border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Known reference length (in)</label>
              <input
                type="number"
                step="0.01"
                value={refLenIn}
                onChange={(e) => setRefLenIn(Number(e.target.value || 0))}
                className="w-40 border rounded p-2"
                placeholder="e.g. 3.37"
              />
              <p className="text-xs text-gray-500 mt-1">
                Examples: credit card long edge 3.37", US quarter 0.955", paper 11.0".
              </p>
            </div>

            <div className="ml-auto">
              <button onClick={resetPoints} className="px-3 py-2 rounded border">
                Clear points
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-2">
          {!imgSrc ? (
            <div className="p-10 text-center text-gray-500">
              Upload a photo. Click two points along the <b>reference</b> object,
              then two points along the <b>target</b> edge (door/window).
            </div>
          ) : (
            <div className="relative">
              <div
                ref={wrapRef}
                className="relative"
                onClick={handleClick}
                style={{ cursor: "crosshair" }}
              >
                <img ref={imgRef} src={imgSrc} alt="uploaded" className="block max-w-full h-auto select-none" />
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${wrapRef.current?.getBoundingClientRect().width || 100} ${wrapRef.current?.getBoundingClientRect().height || 100}`}
                  preserveAspectRatio="none"
                >
                  {(() => {
                    if (!wrapRef.current || !imgRef.current) return null;
                    const rect = wrapRef.current.getBoundingClientRect();
                    const dispW = rect.width, dispH = rect.height;
                    const sx = dispW / (natural.w || 1);
                    const sy = dispH / (natural.h || 1);
                    const toDisp = (p) => ({ x: p.x * sx, y: p.y * sy });
                    if (refPts.length >= 1) {
                      const a = toDisp(refPts[0]);
                      return (
                        <>
                          <circle cx={a.x} cy={a.y} r="5" fill="#10b981" />
                          {refPts[1] && (() => {
                            const b = toDisp(refPts[1]);
                            return (
                              <>
                                <circle cx={b.x} cy={b.y} r="5" fill="#10b981" />
                                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#10b981" strokeWidth="3" />
                              </>
                            );
                          })()}
                        </>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    if (!wrapRef.current || !imgRef.current) return null;
                    const rect = wrapRef.current.getBoundingClientRect();
                    const dispW = rect.width, dispH = rect.height;
                    const sx = dispW / (natural.w || 1);
                    const sy = dispH / (natural.h || 1);
                    const toDisp = (p) => ({ x: p.x * sx, y: p.y * sy });
                    if (tgtPts.length >= 1) {
                      const a = toDisp(tgtPts[0]);
                      return (
                        <>
                          <circle cx={a.x} cy={a.y} r="5" fill="#3b82f6" />
                          {tgtPts[1] && (() => {
                            const b = toDisp(tgtPts[1]);
                            return (
                              <>
                                <circle cx={b.x} cy={b.y} r="5" fill="#3b82f6" />
                                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3b82f6" strokeWidth="3" />
                              </>
                            );
                          })()}
                        </>
                      );
                    }
                    return null;
                  })()}
                </svg>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500 uppercase text-xs">Reference pixels</div>
              <div className="text-lg font-semibold">{refPx ? refPx.toFixed(1) : "—"}</div>
              <div className="text-gray-500 mt-1">Known length: {refLenIn} in</div>
            </div>
            <div>
              <div className="text-gray-500 uppercase text-xs">Target pixels</div>
              <div className="text-lg font-semibold">{tgtPx ? tgtPx.toFixed(1) : "—"}</div>
              <div className="text-gray-500 mt-1">Scale: {inPerPx ? `${inPerPx.toFixed(4)} in/px` : "—"}</div>
            </div>
          </div>
          <hr className="my-4" />
          <div>
            <div className="text-gray-500 uppercase text-xs">Estimated width</div>
            <div className="text-xl font-bold">{fmtInchesToFeet(estimateIn)}</div>
            <div className="text-xs text-gray-500 mt-2">
              Accuracy depends on straight-on angle, lens distortion, and the reference being in the same plane as the target.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------- Docs Q&A Tab --------------------------- */
 function DocsQATab({ onSummary }) {
    const [files, setFiles] = useState([]);
    const [isIndexing, setIsIndexing] = useState(false);
    const [question, setQuestion] = useState("");
    const [result, setResult] = useState(null);
    const [err, setErr] = useState("");

    // ONE place to read the backend URL
    const API = import.meta.env.VITE_API_BASE || "https://aosai-app-1.onrender.com";


    const [sumLoading, setSumLoading] = useState(false);
    const [sumErr, setSumErr] = useState("");

   
const onPick = (e) => {
  const picked = Array.from(e.target.files || []);
  setFiles(picked.slice(0, 100)); // allow up to 100
  setResult(null);
  setErr("");
};


     


    async function indexFiles() {
      try {
        setIsIndexing(true);
        setResult(null);
        setErr("");
        const form = new FormData();
        files.forEach((f) => form.append("files", f));

          const res = await fetch(`${API}/api/ingest`, { method: "POST", body: formData });
        if (!res.ok) throw new Error(await res.text());
        await res.json();
      } catch (e) {
        setErr(e.message || "Index failed");
      } finally {
        setIsIndexing(false);
      }
    }

    async function ask() {
      try {
        setErr("");
        setResult(null);
          const res = await fetch(`${API}/api/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json(); // { answer, citations: [{file, snippet}] }
        setResult(data);
      } catch (e) {
        setErr(e.message || "Ask failed");
      }
    }
async function generateSummary() {
  try {
    setSumErr("");
    setSumLoading(true);

    const form = new FormData();
    files.forEach((f) => form.append("files", f));

      const res = await fetch(`${API}/api/summarize`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();             // AI JSON from server
    const pretty = JSON.stringify(data, null, 2);
    onSummary?.(pretty);                       // hand raw JSON string up to App
  } catch (e) {
    setSumErr(e.message || "Summary failed");
  } finally {
    setSumLoading(false);
  }
}



    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Docs Q&A (Beta)">
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-sm font-medium mb-1">
            Upload up to 100 files (PDF, DOCX, TXT)
          </label>
              <input type="file" multiple accept=".pdf,.docx,.txt" onChange={onPick} className="border rounded p-2 w-full" />
              {!!files.length && (
                <ul className="list-disc pl-5 mt-2">
                  {files.map((f) => (
                    <li key={f.name}>{f.name} ({Math.round(f.size / 1024)} KB)</li>
                  ))}
                </ul>
              )}
            </div>

            <button onClick={indexFiles} disabled={!files.length || isIndexing} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
              {isIndexing ? "Indexing…" : "Index Files"}
            </button>

<div className="flex items-center gap-2 mt-2">
  <button
    onClick={generateSummary}
    disabled={!files.length || sumLoading}
    className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
    title="Creates an executive summary, timeline, tools/materials, stakeholders, risks."
  >
    {sumLoading ? "Summarizing…" : "Generate Summary"}
  </button>
  {sumErr && <span className="text-red-600 text-sm">{sumErr}</span>}
</div>



            {err && <div className="text-red-600">{err}</div>}
            <p className="text-xs text-gray-500">Tip: searchable PDFs work best. Scanned PDFs need OCR (upgrade later).</p>
          </div>
        </Card>

        <Card title="Ask a question">
          <div className="flex gap-2">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g., How thick is the lobby curtain wall glass?" className="flex-1 border rounded p-2 text-sm" />
            <button onClick={ask} disabled={!question.trim()} className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50">Ask</button>
          </div>

          {result ? (
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-gray-500 uppercase text-xs">Answer</div>
                <div className="whitespace-pre-wrap text-sm">{result.answer}</div>
              </div>
              {!!result.citations?.length && (
                <div>
                  <div className="text-gray-500 uppercase text-xs mb-1">Sources</div>
                  <ol className="list-decimal pl-5 text-sm space-y-1">
                    {result.citations.map((c, i) => (
                      <li key={i}>
                        <b>{c.file}</b> — <span className="text-gray-600 italic">{c.snippet}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4"><SectionEmpty text="No answer yet." /></div>
          )}
        </Card>
      </div>
    );
  }



// -------------------------- Summary (AI) --------------------------
const [summaryRaw, setSummaryRaw] = useState(""); // raw JSON string
const summary = useMemo(() => {
  try { return summaryRaw ? JSON.parse(summaryRaw) : null; } catch { return null; }
}, [summaryRaw]);






  /* --------------------------- Components ----------------------------- */

  function NavButton({ code, label }) {
    const active = tab === code;
    return (
      <button
        className={
          "px-3 py-2 rounded border text-sm " +
          (active ? "bg-black text-white" : "bg-white hover:bg-gray-50")
        }
        onClick={() => setTab(code)}
      >
        {label}
      </button>
    );
  }

  function HeaderBar() {
    const nav = [
      ["analyzer", "Blueprint Analyzer"],
      ["qna", "AI Q&A"],
      ["schedules", "Schedules"],
      ["jobs", "Jobs"],
      ["team", "Team"],
      ["calculators", "Calculators"],
      ["photo", "Photo Estimator (Beta)"],
      ["docsqa", "Docs Q&A (Beta)"],
      ["reports", "Reports"],
      ["settings", "Settings"],
    ];
    return (
      <header className="border-b bg-white print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold">AOSAI — Field Suite (Demo)</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <button className="px-3 py-2 rounded border bg-white text-[#1C1C1C]" onClick={() => setTab("dashboard")}>
              Home
            </button>
            {nav.map(([code, label]) => (
              <NavButton key={code} code={code} label={label} />
            ))}
            <button className="px-3 py-2 rounded border" onClick={() => window.print()} title="Print current view">Print</button>
          </div>
        </div>
      </header>
    );
  }

  /* --------------------------- TAB RENDERS ---------------------------- */

  function TabAnalyzer() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleBlueprintUpload} className="bg-white rounded-xl shadow p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Blueprint File</label>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full border rounded p-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium">Scale (if known)</span>
              <input type="text" value={scaleText} onChange={(e) => setScaleText(e.target.value)} className="w-full mt-1 border rounded p-2" placeholder='e.g. 1/8" = 1’-0"' />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Trades (comma separated)</span>
              <input type="text" value={trades} onChange={(e) => setTrades(e.target.value)} className="w-full mt-1 border rounded p-2" placeholder="electrical, plumbing, drywall…" />
            </label>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={bpLoading} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">{bpLoading ? "Analyzing…" : "Upload & Analyze"}</button>
            <button type="button" className="px-4 py-2 rounded border" onClick={downloadJSON} disabled={!bp}>Download JSON</button>
            <button type="button" className="px-4 py-2 rounded border" onClick={() => { const csv = roomsCSV(); if (csv) download("rooms.csv", csv); }} disabled={!bp?.rooms?.length}>Rooms CSV</button>
            <button type="button" className="px-4 py-2 rounded border" onClick={() => { const csv = materialsCSV(); if (csv) download("materials.csv", csv); }} disabled={!bp?.materials?.length}>Materials CSV</button>
          </div>

          {!!bpError && <p className="text-sm text-red-600">Error: {bpError}</p>}
          <p className="text-xs text-gray-500">Tip: start with a clear floor-plan PNG/JPG. (PDF? Export page to PNG first.)</p>
        </form>

        <div className="space-y-4">
          <Card title="Summary">
            {bp?.rooms?.length ? (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">NAME</th>
                      <th className="py-2 pr-4">WIDTH (FT)</th>
                      <th className="py-2 pr-4">LENGTH (FT)</th>
                      <th className="py-2 pr-4">AREA (SQFT)</th>
                      <th className="py-2 pr-4">PERIMETER (FT)</th>
                      <th className="py-2">NOTES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bp.rooms.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{r.name}</td>
                        <td className="py-2 pr-4">{r.width_ft != null ? Number(r.width_ft).toFixed(2) : "—"}</td>
                        <td className="py-2 pr-4">{r.length_ft != null ? Number(r.length_ft).toFixed(2) : "—"}</td>
                        <td className="py-2 pr-4">{r.area_sqft != null ? Number(r.area_sqft).toFixed(2) : "—"}</td>
                        <td className="py-2 pr-4">{r.perimeter_ft != null ? Number(r.perimeter_ft).toFixed(2) : "—"}</td>
                        <td className="py-2">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <SectionEmpty text="Upload a plan to see rooms and quantities." />
            )}
          </Card>

          <Card title="Materials">
            {bp?.materials?.length ? (
              <ul className="list-disc pl-5 text-sm space-y-1">
                {bp.materials.map((m, i) => (
                  <li key={i}>
                    {m.item} — {m.qty ?? "?"} {m.unit ?? ""} {m.notes ? `(${m.notes})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <SectionEmpty />
            )}
          </Card>

          <Card title="Professional Summary (Printable)">
            {bp?.pro_summary ? (
              <div className="text-sm whitespace-pre-wrap">{bp.pro_summary}</div>
            ) : (
              <SectionEmpty text="No summary yet. Run analysis first." />
            )}
          </Card>

          <Card title="Raw JSON (debug)">
            <details>
              <summary className="cursor-pointer text-sm">Show</summary>
              <pre className="text-xs mt-2 overflow-auto">{bpRaw || "No data."}</pre>
            </details>
          </Card>
        </div>
      </div>
    );
  }

  function TabQnA() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Context">
          {bp ? (
            <div className="text-sm space-y-1">
              <div><b>Rooms:</b> {bp.rooms?.length ?? 0}</div>
              <div><b>Materials:</b> {bp.materials?.length ?? 0}</div>
              <div className="text-xs text-gray-500">The assistant uses this context when answering.</div>
            </div>
          ) : (
            <SectionEmpty text="No blueprint context yet. (Optional but recommended.)" />
          )}
          <label className="block text-sm mt-4">
            <span className="font-medium">Pricing / rules (optional)</span>
            <textarea className="w-full border rounded p-2 mt-1 h-24 text-sm" placeholder="e.g., Drywall $1.85/sqft; LVP $2.25/sqft; add 10% waste; exclude balcony…" value={pricingNotes} onChange={(e) => setPricingNotes(e.target.value)} />
          </label>
        </Card>

        <Card title="AI Q&A" right={<button className="px-3 py-1 rounded border text-sm" onClick={() => setQaHistory([])}>Clear</button>}>
          <div className="border rounded p-2 h-72 overflow-auto bg-gray-50">
            {!qaHistory.length && <div className="text-sm text-gray-500">Ask for recalcs or field help, e.g. “Recalc drywall @ $1.85/sqft and add 8 outlets.”</div>}
            {qaHistory.map((m, i) => (
              <div key={i} className={`mb-2 text-sm ${m.role === "user" ? "font-medium" : ""}`}>
                <span className="uppercase text-[10px] text-gray-400">{m.role}</span><br />
                {m.content}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={qaInput} onChange={(e) => setQaInput(e.target.value)} placeholder="Type a question…" className="flex-1 border rounded p-2 text-sm" />
            <button className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={qaLoading || !qaInput.trim()} onClick={sendQnA}>
              {qaLoading ? "Thinking…" : "Send"}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  function TabTeam() {
    const [name, setName] = useState("");
    const [role, setRole] = useState("Tech");

    function addWorker() {
      if (!name.trim()) return;
      setTeam((t) => [...t, { id: "w" + (Date.now() + Math.random()), name: name.trim(), role }]);
      setName("");
      setRole("Tech");
    }
    function remove(id) {
      setTeam((t) => t.filter((w) => w.id !== id));
    }

    return (
      <div className="grid gap-6">
        <Card title="Add Worker">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="border rounded p-2" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="border rounded p-2" value={role} onChange={(e) => setRole(e.target.value)}>
              <option>Tech</option>
              <option>Lead Tech</option>
              <option>Apprentice</option>
              <option>Project Manager</option>
            </select>
            <button className="px-3 py-2 rounded bg-black text-white" onClick={addWorker}>Add</button>
          </div>
        </Card>

        <Card title="Team">
          {team.length ? (
            <ul className="divide-y">
              {team.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-gray-500">{w.role}</div>
                  </div>
                  <button className="px-2 py-1 rounded border text-sm" onClick={() => remove(w.id)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty />
          )}
        </Card>
      </div>
    );
  }

  function TabSchedules() {
    const [title, setTitle] = useState("");
    const [date, setDate] = useState("");
    const [assignee, setAssignee] = useState(team[0]?.id ?? "");
    const [notes, setNotes] = useState("");

    function addSchedule() {
      if (!title.trim() || !date || !assignee) return;
      setJobs((j) => [...j, { id: "j" + (Date.now() + Math.random()), title: title.trim(), date, assignee, status: "Scheduled", notes }]);
      setTitle(""); setDate(""); setAssignee(team[0]?.id ?? ""); setNotes("");
      alert("Job scheduled.");
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Create Schedule">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="border rounded p-2" placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="border rounded p-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select className="border rounded p-2" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {team.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input className="border rounded p-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="mt-3">
            <button className="px-3 py-2 rounded bg-black text-white" onClick={addSchedule}>Schedule Job</button>
          </div>
        </Card>

        <Card title="Upcoming">
          {jobs.length ? (
            <ul className="divide-y">
              {jobs.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((j) => {
                const worker = team.find((w) => w.id === j.assignee);
                return (
                  <li key={j.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-gray-500">{j.date || "No date"}</div>
                    </div>
                    <div className="text-sm">{worker ? worker.name : "Unassigned"} — <i>{j.status}</i></div>
                    {j.notes ? <div className="text-xs text-gray-500 mt-1">{j.notes}</div> : null}
                  </li>
                );
              })}
            </ul>
          ) : <SectionEmpty />}
        </Card>
      </div>
    );
  }

  function TabJobs() {
    function setStatus(id, status) {
      setJobs((j) => j.map((x) => (x.id === id ? { ...x, status } : x)));
    }
    function remove(id) {
      setJobs((j) => j.filter((x) => x.id !== id));
    }
    return (
      <div className="grid gap-6">
        <Card title="Jobs">
          {jobs.length ? (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Assignee</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((j) => {
                    const worker = team.find((w) => w.id === j.assignee);
                    return (
                      <tr key={j.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{j.date || "—"}</td>
                        <td className="py-2 pr-3">{j.title}</td>
                        <td className="py-2 pr-3">{worker ? worker.name : "—"}</td>
                        <td className="py-2 pr-3">{j.status}</td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-2">
                            <select className="border rounded p-1" value={j.status} onChange={(e) => setStatus(j.id, e.target.value)}>
                              <option>Scheduled</option>
                              <option>In Progress</option>
                              <option>Complete</option>
                              <option>Hold</option>
                            </select>
                            <button className="px-2 py-1 rounded border" onClick={() => remove(j.id)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <SectionEmpty />}
        </Card>
      </div>
    );
  }

  function TabCalculators() {
    const shapes = [
      { name: "Rectangle / Square", formula: "L × W" },
      { name: "Triangle", formula: "½ × Base × Height" },
      { name: "Circle", formula: "π × r²" },
      { name: "Cylinder", formula: "π × r² × Height" },
      { name: "Sphere", formula: "4⁄3 × π × r³" },
      { name: "Cone", formula: "⅓ × π × r² × Height" },
      { name: "Pyramid", formula: "⅓ × Base Area × Height" },
    ];
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Material Calculator">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Length (ft)
              <input className="border rounded p-2 w-full" type="number" value={calcLength} onChange={(e) => setCalcLength(+e.target.value || 0)} />
            </label>
            <label>Width (ft)
              <input className="border rounded p-2 w-full" type="number" value={calcWidth} onChange={(e) => setCalcWidth(+e.target.value || 0)} />
            </label>
            <label>Height / Thickness (ft)
              <input className="border rounded p-2 w-full" type="number" value={calcHeight} onChange={(e) => setCalcHeight(+e.target.value || 0)} />
            </label>
            <label>Price ($/sq ft)
              <input className="border rounded p-2 w-full" type="number" value={calcPriceUnit} onChange={(e) => setCalcPriceUnit(+e.target.value || 0)} />
            </label>
          </div>
          <div className="mt-4 text-sm space-y-1">
            <div>Area: <b>{calcArea.toFixed(2)} sq ft</b></div>
            <div>Volume: <b>{calcVolume.toFixed(2)} cu ft</b></div>
            <div>Total Cost: <b>${calcTotal.toFixed(2)}</b></div>
          </div>
        </Card>

        <Card title="Shape Reference Guide">
          <ul className="list-disc pl-6 text-sm space-y-1">
            {shapes.map((s, i) => <li key={i}><b>{s.name}</b> — {s.formula}</li>)}
          </ul>
        </Card>
      </div>
    );
  }

  function TabPhoto() {
    return <Card title="Photo Estimator"><PhotoEstimatorVisual /></Card>;
  }

  function TabReports() {
    return (
      <div className="grid gap-6">

	<Card
  title="Printable Report"
  right={
    <button
      className="px-3 py-1 rounded border text-sm"
      onClick={() => window.print()}
    >
      Print
    </button>
  }
>
  {bp ? (
    <div className="text-sm space-y-3">
      <div className="font-semibold">Project Summary</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-500">Rooms</div>
          <div className="text-xl font-semibold">{bp.rooms?.length ?? 0}</div>
        </div>

        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-500">Materials</div>
          <div className="text-xl font-semibold">{bp.materials?.length ?? 0}</div>
        </div>

        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-500">Openings</div>
          <div className="text-xl font-semibold">{bp.openings?.length ?? 0}</div>
        </div>
      </div>

      <div className="font-semibold mt-4 mb-1">Narrative</div>
      {bp.pro_summary ? (
        <div className="whitespace-pre-wrap">{bp.pro_summary}</div>
      ) : (
        <SectionEmpty text="No narrative yet." />
      )}
    </div>
  ) : (
    <SectionEmpty text="No analyzer data yet." />
  )}
</Card>


        <Card title="AI Project Summary (Printable)" right={<button className="px-3 py-1 rounded border text-sm" onClick={() => window.print()}>Print</button>}>
  {!summary ? (
    <SectionEmpty text="No AI summary yet. Go to Docs Q&A → Generate Summary." />
  ) : (
    <div className="text-sm space-y-4">
      {/* Executive Summary */}
      <div>
        <div className="font-semibold mb-1">Executive Summary</div>
        <div className="whitespace-pre-wrap">{summary.executive_summary || "—"}</div>
      </div>

      {/* Objectives */}
      {!!summary.key_objectives?.length && (
        <div>
          <div className="font-semibold mb-1">Key Objectives</div>
          <ul className="list-disc pl-5">
            {summary.key_objectives.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}

      {/* Scope */}
      {(summary.scope?.in_scope?.length || summary.scope?.out_of_scope?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-semibold mb-1">In Scope</div>
            <ul className="list-disc pl-5">
              {(summary.scope?.in_scope || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-1">Out of Scope</div>
            <ul className="list-disc pl-5">
              {(summary.scope?.out_of_scope || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Timeline */}
      {summary.estimated_timeline && (
        <div>
          <div className="font-semibold mb-1">Estimated Timeline</div>
          <div className="text-xs text-gray-600">
            Overall: {summary.estimated_timeline.overall_duration_days ?? "—"} days ·
            Confidence: {summary.estimated_timeline.confidence || "—"}
          </div>
          <div className="mt-2 space-y-2">
            {(summary.estimated_timeline.milestones || []).map((m, i) => (
              <div key={i} className="border rounded p-2">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-gray-600">Duration: {m.duration_days ?? "—"} day(s)</div>
                {!!m.dependencies?.length && <div className="text-xs">Depends on: {m.dependencies.join(", ")}</div>}
                {!!m.assumptions?.length && <div className="text-xs italic">Assumptions: {m.assumptions.join("; ")}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tools & Materials */}
      {(summary.tools_and_materials?.materials?.length || summary.tools_and_materials?.tools?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!!summary.tools_and_materials?.materials?.length && (
            <div>
              <div className="font-semibold mb-1">Materials</div>
              <ul className="list-disc pl-5">
                {summary.tools_and_materials.materials.map((m, i) => (
                  <li key={i}><b>{m.name}</b>{m.qty ? ` — ${m.qty}` : ""}{m.notes ? ` (${m.notes})` : ""}</li>
                ))}
              </ul>
            </div>
          )}
          {!!summary.tools_and_materials?.tools?.length && (
            <div>
              <div className="font-semibold mb-1">Tools</div>
              <ul className="list-disc pl-5">
                {summary.tools_and_materials.tools.map((t, i) => (
                  <li key={i}><b>{t.name}</b>{t.notes ? ` — ${t.notes}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Stakeholders */}
      {!!summary.stakeholders?.length && (
        <div>
          <div className="font-semibold mb-1">Stakeholders / Contacts</div>
          <ul className="divide-y">
            {summary.stakeholders.map((s, i) => (
              <li key={i} className="py-2">
                <div className="font-medium">{s.name} <span className="text-xs text-gray-500">({s.role || "Role n/a"})</span></div>
                <div className="text-xs text-gray-600">{s.email || ""}{s.phone ? ` · ${s.phone}` : ""}</div>
                {s.source && <div className="text-xs italic text-gray-500">Source: {s.source}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {!!summary.risks_and_mitigations?.length && (
        <div>
          <div className="font-semibold mb-1">Risks & Mitigations</div>
          <ul className="list-disc pl-5">
            {summary.risks_and_mitigations.map((r, i) => (
              <li key={i}><b>{r.risk}</b> — impact: {r.impact || "n/a"} · mitigation: {r.mitigation || "n/a"}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Open Questions */}
      {!!summary.open_questions?.length && (
        <div>
          <div className="font-semibold mb-1">Open Questions</div>
          <ul className="list-disc pl-5">
            {summary.open_questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {/* Sources */}
      {!!summary.sources?.length && (
        <div className="text-xs text-gray-500">
          <div className="font-semibold">Sources</div>
          <ul className="list-disc pl-5">
            {summary.sources.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  )}
</Card>
       

<Card title="Summary JSON (debug)">
  <details>
    <summary className="cursor-pointer text-sm">Show</summary>
    <pre className="text-xs mt-2 overflow-auto">{summaryRaw || "No data."}</pre>
  </details>
</Card>
 </div>
    );
  }




  function TabSettings() {
    return (
      <div className="grid gap-6">
        <Card title="Settings">
          <div className="text-sm text-gray-600">
            Demo UI. Printing uses your browser’s print dialog. Analyzer + Q&A require your server at <b>http://localhost:8787</b>.
          </div>
        </Card>
      </div>
    );
  }

  /* ------------------------------- Render ----------------------------- */
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1C1C1C]">
      <HeaderBar />

      <main className="max-w-7xl mx-auto px-6 py-6 print:px-2">
        {tab === "dashboard" && <DashboardTiles onOpen={(k) => setTab(k)} />}

        {tab === "analyzer" && <TabAnalyzer />}
        {tab === "qna" && <TabQnA />}
        {tab === "schedules" && <TabSchedules />}
        {tab === "jobs" && <TabJobs />}
        {tab === "team" && <TabTeam />}
        {tab === "calculators" && <TabCalculators />}
        {tab === "photo" && <TabPhoto />}
        {tab === "docsqa" && <DocsQATab onSummary={(jsonStr) => setSummaryRaw(jsonStr)} />}
        {tab === "reports" && <TabReports />}
        {tab === "settings" && <TabSettings />}
      </main>
    </div>
  );
}
