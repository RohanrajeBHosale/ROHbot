// /api/chat.js
// Groq-only generation (streaming). Supabase retrieval (semantic if OPENAI_API_KEY exists; else keyword fallback).

const { createClient } = require("@supabase/supabase-js");

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

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function toOpenAIMessages(history) {
  // Your frontend history is Gemini-like:
  // [{ role: 'user'|'model', parts: [{text: "..."}] }]
  // Convert to OpenAI/Groq:
  // [{ role: 'user'|'assistant', content: "..." }]
  if (!Array.isArray(history)) return [];

  return history
    .map((h) => {
      const role = h?.role === "user" ? "user" : "assistant";
      const text =
        Array.isArray(h?.parts) && h.parts[0]?.text ? String(h.parts[0].text) : "";
      if (!text.trim()) return null;
      return { role, content: text };
    })
    .filter(Boolean);
}

function extractKeywords(input) {
  // simple keyword extraction for fallback retrieval
  const stop = new Set([
    "the","a","an","and","or","but","if","then","else","what","which","who","whom","this","that",
    "is","are","was","were","be","been","being","to","of","in","on","for","with","as","at","by",
    "from","about","tell","show","me","your","my","you","i"
  ]);

  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w))
    .slice(0, 6);
}

async function getQueryEmbeddingOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    console.error("OpenAI embedding error:", r.status, err);
    return null;
  }

  const data = await r.json();
  const emb = data?.data?.[0]?.embedding;
  return Array.isArray(emb) ? emb : null;
}

async function retrieveContext(supabase, userInput) {
  // Prefer semantic retrieval if OPENAI_API_KEY exists
  const embedding = await getQueryEmbeddingOpenAI(userInput);

  if (embedding) {
    // Requires your existing Supabase RPC:
    // match_documents(query_embedding vector, match_threshold float, match_count int)
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_threshold: 0.65,
      match_count: 5,
    });

    if (error) {
      console.error("Supabase match_documents error:", error);
    } else if (Array.isArray(data) && data.length) {
      return {
        mode: "semantic",
        docs: data,
      };
    }
  }

  // Fallback: keyword retrieval (not semantic, but works without embeddings)
  const kws = extractKeywords(userInput);
  if (!kws.length) {
    return { mode: "none", docs: [] };
  }

  // Build OR filter: content ilike %kw%
  // supabase-js OR syntax: .or("content.ilike.%foo%,content.ilike.%bar%")
  const orExpr = kws.map((k) => `content.ilike.%${k}%`).join(",");

  const { data, error } = await supabase
    .from("documents")
    .select("id, content, metadata")
    .or(orExpr)
    .limit(5);

  if (error) {
    console.error("Supabase keyword retrieval error:", error);
    return { mode: "none", docs: [] };
  }

  return { mode: "keyword", docs: Array.isArray(data) ? data : [] };
}

function formatContext(docs) {
  // Keep context compact; include metadata if present
  if (!Array.isArray(docs) || docs.length === 0) return "NO_CONTEXT_FOUND";

  return docs
    .map((d, i) => {
      const meta =
        d?.metadata && typeof d.metadata === "object"
          ? JSON.stringify(d.metadata)
          : "";
      const content = String(d?.content || "").trim();
      return `[#${i + 1}] ${content}${meta ? `\nMETA: ${meta}` : ""}`;
    })
    .join("\n\n");
}

async function streamGroqChat({ res, model, messages }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.write("Error: Missing GROQ_API_KEY.");
    return;
  }

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      stream: true,
      messages,
    }),
  });

  if (!r.ok || !r.body) {
    const err = await r.text().catch(() => "");
    console.error("Groq chat error:", r.status, err);
    res.write("Error: LLM request failed.");
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder(); // Default is UTF-8, which is usually correct
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Decode the chunk immediately
    const decodedChunk = decoder.decode(value, { stream: true });
    buffer += decodedChunk;

    // Log each decoded chunk as it comes from Groq
    console.log("GROQ STREAM CHUNK:", decodedChunk); // <-- NEW LOG

    // Groq streams as SSE-like "data: {...}\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.replace(/^data:\s*/, "");
      if (payload === "[DONE]") return;

      const json = safeJsonParse(payload);
      const delta = json?.choices?.[0]?.delta?.content;
      if (delta) {
          console.log("GROQ DELTA CONTENT:", delta); // <-- NEW LOG
          res.write(delta);
      }
    }
  }
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Stream plain text so your UI reader.read() works
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    const { userInput, history } = req.body || {};
    const question = String(userInput || "").trim();
    if (!question) {
      res.write("Please enter a question.");
      return res.end();
    }

    // Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.write("Error: Missing Supabase env vars.");
      return res.end();
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Retrieve context
    const { mode, docs } = await retrieveContext(supabase, question);
    const contextText = formatContext(docs);

    console.log("--- Retrieved Context (before LLM) ---"); // <-- NEW LOG
    console.log(contextText);                                // <-- NEW LOG
    console.log("---------------------------------------"); // <-- NEW LOG

    // Force grounding (no generic "as an AI model" answers)
    const system = {
      role: "system",
      content: `
You are ROHbot, Rohan's portfolio assistant.
You MUST answer using ONLY the provided CONTEXT.
- If the answer is in context: be specific (projects, tools, outcomes).
- If the answer is NOT in context: say exactly: "That information is not present in my knowledge base."
- Do NOT say "I don’t have access", "as a language model", or generic explanations.
- Keep answers concise (3-7 sentences).
`.trim(),
    };

    const user = {
      role: "user",
      content: `
CONTEXT (${mode}):
${contextText}

USER QUESTION:
${question}
`.trim(),
    };

    const prior = toOpenAIMessages(history);

    const messagesToSend = [system, ...prior, user];
    console.log("--- Full Messages Sent to Groq LLM ---"); // <-- NEW LOG
    messagesToSend.forEach((msg, idx) => console.log(`[${idx}] ${msg.role}: ${msg.content}`)); // <-- NEW LOG
    console.log("--------------------------------------"); // <-- NEW LOG

    // Choose a Groq model that is NOT decommissioned
    // Good defaults:
    // - llama-3.1-8b-instant (fast + cheap)
    // - mixtral-8x7b-32768 (strong reasoning, longer)
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    await streamGroqChat({
      res,
      model,
      messages: messagesToSend,
    });

    return res.end();
  } catch (e) {
    console.error("api/chat fatal error:", e);
    res.write("Error: Snag in the connection.");
    return res.end();
  }
};
