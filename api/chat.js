const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        
        // Initialize Clients using Vercel Env Vars
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // 2. Search Memory (Google Embedding -> Supabase Match)
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.2, // Lowered to ensure we get your info
            match_count: 5,
        });

        const context = documents?.map(d => d.content).join('\n\n') || "No specific context found.";

        // 3. Talk (Groq Brain)
        const chat = await groq.chat.completions.create({
            messages: [
                { role: "system", content: `You are ROHbot, Rohan's twin. Use this context: ${context}. Answer in first person.` },
                ...(history || []).map(m => ({ 
                    role: m.role === 'user' ? 'user' : 'assistant', 
                    content: m.parts[0].text 
                })),
                { role: "user", content: userInput }
            ],
            model: "llama-3.3-70b-versatile",
            stream: true,
        });

        for await (const chunk of chat) {
            res.write(chunk.choices[0]?.delta?.content || "");
        }
        res.end();

    } catch (error) {
        console.error(error);
        res.write("Memory access error. Please check Supabase connection.");
        res.end();
    }
};
