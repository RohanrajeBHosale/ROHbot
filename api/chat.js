// ROHbot/api/chat.js (CommonJS)

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
  // Always set CORS first
  setCors(req, res);

  // ✅ Preflight must NEVER fail
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Stream text back
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-store");

  try {
    const { userInput, history } = req.body || {};
    const question = (userInput || "").trim();
    if (!question) {
      res.write("Ask me something and I’ll answer based on my portfolio context.");
      return res.end();
    }

    // ✅ Lazy-load deps ONLY for POST (preflight won’t care if deps are missing)
    const { createClient } = require("@supabase/supabase-js");
    const { GoogleGenerativeAI } = require("@google/generative-ai");

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      res.write("Server misconfigured: missing SUPABASE_URL / SUPABASE_SERVICE_KEY / GEMINI_API_KEY.");
      return res.end();
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const genAI = new GoogleGenerativeAI(geminiKey);

    // Embed + fetch context
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embed = await embeddingModel.embedContent(question);

    const { data: documents } = await supabase.rpc("match_documents", {
      query_embedding: embed.embedding.values,
      match_threshold: 0.7,
      match_count: 3,
    });

    const contextText =
      documents && documents.length > 0
        ? documents.map((d, i) => `SOURCE ${i + 1}:\n${d.content}`).join("\n\n---\n\n")
        : "No relevant context found.";

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat({ history: history || [] });

    const prompt = `
You are ROHbot — Rohan’s AI twin.
Rules:
- Use CONTEXT first.
- If context is missing, say what you can and ask what you need.
- Don’t hallucinate claims.
- Keep it concise and engineer-like.

CONTEXT:
${contextText}

USER:
${question}
`;

    // If your SDK supports stream:
    const result = await chat.sendMessageStream(prompt);

    for await (const chunk of result.stream) {
      res.write(chunk.text());
    }
    return res.end();

  } catch (err) {
    console.error("chat error:", err);

    // ✅ Ensure the browser can still read the response (CORS already set)
    res.write("Error: ROHbot server failed. Check Vercel logs (likely missing deps/env).");
    return res.end();
  }
};
