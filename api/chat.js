// api/chat.js
// Groq streaming chat endpoint (OpenAI-compatible)
// Works as a Vercel Serverless Function (/api/chat)

const ALLOWED_ORIGINS = new Set([
  "https://rohanraje.com",
  "https://www.rohanraje.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;

  // If browser origin is allowed, echo it back (best practice)
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    // no-origin requests (curl/postman)
    res.setHeader("Access-Control-Allow-Origin", "*");
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
    const clean = (userInput || "").trim();
    if (!clean) return res.status(400).json({ error: "Missing userInput" });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

    // ✅ Use a supported Groq model (the one you used is decommissioned)
    // Docs show llama-3.3-70b-versatile as current example.  [oai_citation:1‡GroqCloud](https://console.groq.com/docs/quickstart?utm_source=chatgpt.com)
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    // Convert your stored Gemini-like history to OpenAI-style messages if needed.
    // Your client sends history as: [{role:'user'|'model', parts:[{text}]}]
    const messages = [];

    if (Array.isArray(history)) {
      for (const h of history) {
        const role = h?.role === "user" ? "user" : "assistant";
        const text = h?.parts?.[0]?.text;
        if (text) messages.push({ role, content: String(text) });
      }
    }

    messages.push({ role: "user", content: clean });

    // Stream back plain text (your client reads res.body as a stream)
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Transfer-Encoding", "chunked");

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.35,
        stream: true,
      }),
    });

    if (!groqRes.ok || !groqRes.body) {
      const t = await groqRes.text().catch(() => "");
      console.error("Groq error:", groqRes.status, t);
      return res.status(500).end("Snag in the connection.");
    }

    // Groq streams SSE: lines like "data: {...}\n\n"
    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events separated by \n\n
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const lines = evt.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();

          if (data === "[DONE]") {
            res.end();
            return;
          }

          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) res.write(delta);
          } catch {
            // ignore malformed chunks
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error("api/chat error:", err);
    res.status(500).end("Snag in the connection.");
  }
};
