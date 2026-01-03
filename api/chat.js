// ROHbot/api/chat.js
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI, FunctionDeclarationSchemaType } = require("@google/generative-ai");

// ---------- CORS ----------
const ALLOWED_ORIGINS = new Set([
  "https://rohanraje.com",
  "https://www.rohanraje.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;

  // IMPORTANT: do NOT use "*" for your main site requests
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ---------- TOOL: Vercel Status (NO axios) ----------
async function getVercelDeploymentStatus() {
  try {
    const token = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (!token || !projectId) {
      return { status: "unknown", error: "Missing VERCEL_API_TOKEN or VERCEL_PROJECT_ID" };
    }

    const r = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { status: "unknown", error: `Vercel API error ${r.status}: ${t}` };
    }

    const data = await r.json();
    const latest = data?.deployments?.[0];
    return { status: latest?.state || "unknown" };
  } catch (e) {
    return { status: "unknown", error: "Could not fetch deployment status" };
  }
}

// ---------- TOOL SCHEMA (Gemini function calling) ----------
const tools = [
  {
    functionDeclarations: [
      {
        name: "getVercelDeploymentStatus",
        description:
          "Gets the current live deployment status of the ROHbot project from Vercel to see if it is online and ready.",
        parameters: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {},
          required: [],
        },
      },
    ],
  },
];

// ---------- HANDLER ----------
module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Return text so your existing frontend streaming reader works.
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  try {
    const { userInput, history } = req.body || {};
    const question = (userInput || "").trim();
    if (!question) {
      res.status(400).write("Missing userInput");
      return res.end();
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ✅ FIX: use a model id that exists for your API version
    // gemini-1.5-flash-latest / gemini-1.5-flash-002 are commonly listed.  [oai_citation:1‡Google AI Developers Forum](https://discuss.ai.google.dev/t/imagen-model-not-found-in-python-google-generative-ai/46547?utm_source=chatgpt.com)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      tools,
    });

    const chat = model.startChat({ history: history || [] });

    // RAG retrieval
    const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const { embedding } = await embedModel.embedContent(question);

    const { data: documents } = await supabase.rpc("match_documents", {
      query_embedding: embedding.values,
      match_threshold: 0.7,
      match_count: 3,
    });

    const contextText =
      documents && documents.length
        ? documents.map((d) => d.content).join("\n\n")
        : "No relevant context found.";

    const finalPrompt = `
You are ROHbot, Rohan's portfolio assistant.
Answer briefly, clearly, and grounded in the provided CONTEXT.
If the user asks about whether ROHbot is online / deployment status, call getVercelDeploymentStatus.

---
CONTEXT:
${contextText}
---
USER:
${question}
`.trim();

    // 1) Ask model (non-stream) so we can detect function calls reliably
    const result = await chat.sendMessage(finalPrompt);
    const response = result.response;
    const functionCall = response.functionCalls?.()?.[0];

    // 2) If tool called, execute and send tool result back
    if (functionCall) {
      let toolResult = { error: "Unknown tool called" };

      if (functionCall.name === "getVercelDeploymentStatus") {
        toolResult = await getVercelDeploymentStatus();
      }

      const result2 = await chat.sendMessage([
        {
          functionResponse: {
            name: functionCall.name,
            response: toolResult,
          },
        },
      ]);

      res.status(200).write(result2.response.text());
      return res.end();
    }

    // 3) Otherwise just return the answer
    res.status(200).write(response.text());
    return res.end();
  } catch (err) {
    console.error("chat error:", err);
    res.status(500).write("Error: ROHbot backend failed.");
    return res.end();
  }
};
