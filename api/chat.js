// api/chat.js

const ALLOWED_ORIGINS = new Set([
  "https://rohanraje.com",
  "https://www.rohanraje.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { userInput, history } = req.body || {};
    const text = (userInput || "").trim();
    if (!text) return res.status(400).json({ error: "Missing userInput" });

    // =========================
    // ✅ OPTION A: return JSON
    // =========================
    const reply = `You said: ${text}`;
    return res.status(200).json({ reply });

    // =========================
    // ✅ OPTION B: STREAM TEXT
    // (uncomment this and remove OPTION A if your LLM streams)
    // =========================
    /*
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const parts = [
      "Here are my RAG projects.",
      "ROHbot is a portfolio assistant with retrieval and grounding.",
      "I also built systems for anomaly detection and diffusion pipelines."
    ];

    for (const p of parts) {
      res.write(p + " ");
      await new Promise(r => setTimeout(r, 150));
    }

    return res.end();
    */

  } catch (err) {
    console.error("chat error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
