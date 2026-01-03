// api/chat.js

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const ALLOWED_ORIGINS = new Set([
  'https://rohanraje.com',
  'https://www.rohanraje.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function safeJsonParse(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return null;
  }
}

async function getVercelDeploymentStatus() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { status: 'unknown', error: 'Vercel env vars missing' };

  const r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!r.ok) return { status: 'unknown', error: `Vercel API error ${r.status}` };

  const data = await r.json();
  const latest = data?.deployments?.[0];
  return { status: latest?.state || 'unknown' };
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Stream plain text
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const body = safeJsonParse(req.body) || {};
    const userInput = String(body.userInput || '').trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!userInput) {
      res.write('Please ask a question.');
      return res.end();
    }

    // --- Supabase client ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.write('Server misconfigured: missing Supabase env vars.');
      return res.end();
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Embedding via Gemini (ONLY embeddings) ---
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      res.write('Server misconfigured: missing GEMINI_API_KEY (needed for embeddings).');
      return res.end();
    }
    const genAI = new GoogleGenerativeAI(geminiKey);
    const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

    const embedResp = await embedModel.embedContent(userInput);
    const queryVec = embedResp?.embedding?.values;
    if (!Array.isArray(queryVec)) {
      res.write('Embedding failed.');
      return res.end();
    }

    // --- Retrieve KB context ---
    const { data: docs, error: matchErr } = await supabase.rpc('match_documents', {
      query_embedding: queryVec,
      match_threshold: 0.72,
      match_count: 5,
    });

    if (matchErr) console.error('match_documents error:', matchErr);

    const contextText =
      Array.isArray(docs) && docs.length
        ? docs
            .map((d, i) => `[#${i + 1}] ${String(d.content || '').trim()}`)
            .filter(Boolean)
            .join('\n\n')
        : '';

    // --- Hard rule: if no KB context, do NOT hallucinate ---
    const ragGuard =
      contextText.length === 0
        ? `No relevant context was found in Rohan's knowledge base. You MUST say you don't have enough info and ask a follow-up question. Do NOT provide generic explanations.`
        : `Use ONLY the provided CONTEXT as your source of truth. If the answer is not in the context, say you don't know and ask what to add.`;

    // --- Tool-like behavior (simple, deterministic) ---
    const wantsStatus =
      /deployment|deploy|vercel|status|online|down|uptime/i.test(userInput) ||
      /are you live|are you working/i.test(userInput);

    let toolResult = null;
    if (wantsStatus) toolResult = await getVercelDeploymentStatus();

    // --- Groq (OpenAI compatible) ---
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      res.write('Server misconfigured: missing GROQ_API_KEY.');
      return res.end();
    }

    const groq = new OpenAI({
      apiKey: groqKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    // Model: use a currently supported Groq production model
    // llama-3.3-70b-versatile is listed on Groq supported models page.  [oai_citation:1‡GroqCloud](https://console.groq.com/docs/models)
    const MODEL = 'llama-3.3-70b-versatile';

    const system = `
You are ROHbot — Rohanraje Bhosale's portfolio assistant.
Style rules:
- Be concise, specific, and factual.
- No generic textbook explanations.
- Prefer bullet points.
- If the user asks about "your projects", interpret it as Rohan's projects from the KB.

RAG RULE:
${ragGuard}

If a TOOL_RESULT is provided, use it.
`;

    const userMsg = `
CONTEXT:
${contextText || '(empty)'}

TOOL_RESULT:
${toolResult ? JSON.stringify(toolResult) : '(none)'}

USER QUESTION:
${userInput}
`;

    // Build messages for Groq
    const groqMessages = [
      { role: 'system', content: system },
      ...history
        .filter((m) => m && m.role && m.content)
        .slice(-12)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content),
        })),
      { role: 'user', content: userMsg },
    ];

    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: groqMessages,
      temperature: 0.2,
      stream: true,
    });

    for await (const part of stream) {
      const delta = part?.choices?.[0]?.delta?.content;
      if (delta) res.write(delta);
    }

    return res.end();
  } catch (e) {
    console.error('api/chat fatal:', e);
    res.write('Error: ROHbot backend crashed. Check Vercel function logs.');
    return res.end();
  }
};
