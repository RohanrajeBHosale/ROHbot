// /api/chat.js

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

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { userInput, history } = req.body || {};
    const clean = String(userInput || "").trim();
    if (!clean) return res.status(400).json({ error: "Missing userInput" });

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

    // Convert your Gemini-style history -> OpenAI/Groq messages
    // history item format you used: { role: 'user'|'model', parts:[{text}] }
    const msgs = [];
    msgs.push({
      role: "system",
      content:
        "You are ROHbot, Rohan's portfolio assistant. Answer concisely, confidently, and grounded in his projects. If unsure, ask a clarifying question.",
    });

    if (Array.isArray(history)) {
      for (const h of history) {
        const role = h?.role === "user" ? "user" : "assistant";
        const text = h?.parts?.[0]?.text || "";
        if (String(text).trim()) msgs.push({ role, content: String(text) });
      }
    }

    msgs.push({ role: "user", content: clean });

    // Stream plain text back (your frontend expects raw chunks)
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-store");

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile", // or "llama-3.1-8b-instant"
        messages: msgs,
        temperature: 0.5,
        stream: true,
      }),
    });

    if (!r.ok || !r.body) {
      const err = await r.text().catch(() => "");
      console.error("Groq error:", r.status, err);
      return res.status(500).end("Error: Groq request failed.");
    }

    // Parse the SSE stream from Groq and write only the text deltas to client
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Groq sends SSE lines like: "data: {...}\n\n"
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const p of parts) {
        const line = p.trim();
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) res.write(delta);
        } catch {
          // ignore malformed chunks
        }
      }
    }

    res.end();
  } catch (e) {
    console.error("chat error:", e);
    res.status(500).end("Error: Internal Server Error");
  }
};
