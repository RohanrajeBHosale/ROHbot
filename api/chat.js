const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

module.exports = async (req, res) => {
    // --- 1. BULLETPROOF CORS BLOCK ---
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allows all origins (localhost and your domain)
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle Preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST for the actual chat
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- 2. STREAMING HEADERS ---
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) return res.status(400).end("User input required");

        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // --- 3. RAG: GET NUMBERS (Google Embeddings) ---
        // We use Google for embeddings because your Supabase data uses Google's math.
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        // --- 4. RAG: SEARCH KNOWLEDGE (Supabase) ---
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3,
            match_count: 3,
        });

        const contextText = documents?.map(d => d.content).join('\n\n') || "No specific background found.";

        // --- 5. BRAIN: TALK (Groq Llama 3.3) ---
        // Using Groq for the chat logic because it is fast and free.
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are ROHbot, the AI digital twin of Rohanraje Bhosale. 
                    Use this context to answer: ${contextText}. 
                    If information is missing, answer based on your general knowledge of Rohan as an AI/Data Engineer.` 
                },
                ... (history || []).map(m => ({ 
                    role: m.role === 'user' ? 'user' : 'assistant', 
                    content: m.parts[0].text 
                })),
                { role: "user", content: userInput }
            ],
            model: "llama-3.3-70b-versatile",
            stream: true,
        });

        // Push stream chunks to frontend
        for await (const chunk of chatCompletion) {
            const content = chunk.choices[0]?.delta?.content || "";
            res.write(content);
        }
        
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        res.write(`BACKEND_ERROR: ${error.message}`);
        res.end();
    }
};
