// /api/chat.js

const ALLOWED_ORIGINS = new Set([
  "https://rohanraje.com",
  "https://www.rohanraje.com",
  "http://localhost:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { userInput, history } = req.body || {};
    if (!userInput) return res.status(400).end("Missing input");

    if (!process.env.GROQ_API_KEY) {
      throw new Error("Missing GROQ_API_KEY");
    }

    const messages = [
      {
        role: "system",
        content:
          "You are ROHbot, Rohan's portfolio assistant. Be concise, confident, and grounded in his experience.",
      },
    ];

    if (Array.isArray(history)) {
      for (const h of history) {
        messages.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.parts?.[0]?.text || "",
        });
      }
    }

    messages.push({ role: "user", content: userInput });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages,
        stream: true,
      }),
    });

    if (!r.body) throw new Error("No stream from Groq");

    const reader = r.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();
  } catch (e) {
    console.error("chat error:", e);
    res.status(500).end("Snag in the connection.");
  }
};
