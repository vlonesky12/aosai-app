// src/QnA.jsx
import { useState } from "react";

export default function QnA() {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
//--------------
  const API = import.meta.env.VITE_API_BASE || window.location.origin;



  async function askAI(e) {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setAnswers((a) => [...a, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/qna`, {
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      const reply =
        data.answer ||
        "I'm sorry, I couldn’t find specific information for that question yet.";
      setAnswers((a) => [...a, { role: "assistant", text: reply }]);
    } catch (err) {
      setAnswers((a) => [
        ...a,
        { role: "assistant", text: "Error: " + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-semibold">
            AOSAI — Construction Q&A Assistant
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ask any technical or field question — electrical, plumbing, HVAC,
            safety codes, blueprints, materials, or inspection steps. The AI will
            answer with descriptive, professional-grade explanations suitable for
            contractors, estimators, or project managers.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <form onSubmit={askAI} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Example: What’s the proper way to waterproof a shower wall before tiling?"
            className="flex-1 border rounded p-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </form>

        <div className="border rounded-lg p-4 bg-white shadow-sm h-[70vh] overflow-auto">
          {!answers.length && (
            <p className="text-sm text-gray-500 italic">
              Start by typing a question above. The AI will respond with detailed
              explanations, including safety steps, materials, and reasoning.
            </p>
          )}
          {answers.map((m, i) => (
            <div
              key={i}
              className={`mb-4 ${
                m.role === "user" ? "text-gray-800 font-medium" : "text-gray-700"
              }`}
            >
              <div
                className={`uppercase text-xs mb-1 ${
                  m.role === "user" ? "text-blue-500" : "text-green-600"
                }`}
              >
                {m.role === "user" ? "You" : "AOSAI"}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

