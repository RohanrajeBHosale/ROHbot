// ROHbot/api/chat.js

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI, FunctionDeclarationSchemaType } = require("@google/generative-ai");
const axios = require("axios");

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

async function getVercelDeploymentStatus() {
  try {
    const token = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (!token || !projectId) {
      return { status: "unknown", error: "Vercel env vars not set." };
    }

    const response = await axios.get(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const latest = response.data?.deployments?.[0];
    return { status: latest?.state || "unknown" };
  } catch (err) {
    console.error("Error fetching Vercel status:", err?.response?.data || err);
    return { status: "unknown", error: "Could not fetch deployment status." };
  }
}

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

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // We stream text
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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      res.write("Server misconfigured: missing SUPABASE_URL / SUPABASE_SERVICE_KEY / GEMINI_API_KEY.");
      return res.end();
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const genAI = new GoogleGenerativeAI(geminiKey);

    // Chat model with tools
    const generationModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools,
    });

    const chat = generationModel.startChat({ history: history || [] });

    // Embed + fetch context
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embed = await embeddingModel.embedContent(question);

    const { data: documents, error: matchError } = await supabase.rpc("match_documents", {
      query_embedding: embed.embedding.values,
      match_threshold: 0.70,
      match_count: 3,
    });

    if (matchError) {
      console.error("Supabase match_documents error:", matchError);
    }

    const contextText =
      documents && documents.length > 0
        ? documents.map((d, i) => `SOURCE ${i + 1}:\n${d.content}`).join("\n\n---\n\n")
        : "No relevant context found.";

    const persona = `
You are ROHbot — Rohan’s AI twin.
You answer like a sharp, concise engineer.
Rules:
- Use the provided CONTEXT first.
- If context is missing, say what you can and suggest what info is needed.
- Don’t hallucinate companies, roles, dates, or claims.
- If the user asks “are you online / deployed / working”, call the getVercelDeploymentStatus tool.
- Keep answers crisp, with bullets if helpful.
`;

    const finalPrompt = `
${persona}

CONTEXT:
${contextText}

USER QUESTION:
"${question}"

INSTRUCTION:
Decide if you need a tool. If the question is about live deployment/status, use getVercelDeploymentStatus.
Otherwise, answer using CONTEXT.
`;

    const result = await chat.sendMessage(finalPrompt);
    const response = result.response;

    const functionCall = response.functionCalls()?.[0];

    if (functionCall) {
      let functionResponse = { error: "Unknown tool called" };

      if (functionCall.name === "getVercelDeploymentStatus") {
        functionResponse = await getVercelDeploymentStatus();
      }

      const result2 = await chat.sendMessage([
        {
          functionResponse: {
            name: functionCall.name,
            response: functionResponse,
          },
        },
      ]);

      // If your SDK returns a stream iterable:
      if (result2.stream) {
        for await (const chunk of result2.stream) {
          res.write(chunk.text());
        }
      } else {
        // Fallback (non-stream)
        res.write(result2.response?.text?.() || "");
      }

      return res.end();
    }

    // No tool call: stream if possible, else plain text
    if (result.stream) {
      for await (const chunk of result.stream) {
        res.write(chunk.text());
      }
      return res.end();
    }

    res.write(response.text());
    return res.end();

  } catch (error) {
    console.error("Error in agentic pipeline:", error);
    res.write("Error: I’m having trouble on the server right now.");
    return res.end();
  }
};
