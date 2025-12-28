const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput } = req.body;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // 1. Get Embeddings (Using Google - Embedding quotas are usually safe)
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        // 2. Search Supabase
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3,
            match_count: 3,
        });
        const context = documents?.map(d => d.content).join('\n\n') || "Rohan is an AI Engineer.";

        // 3. Generate Answer using Groq (Llama 3.3 70B)
        const stream = await groq.chat.completions.create({
            messages: [
                { role: "system", content: `You are ROHbot, Rohan's AI twin. Use this context: ${context}` },
                { role: "user", content: userInput }
            ],
            model: "llama-3.3-70b-versatile",
            stream: true,
        });

        for await (const chunk of stream) {
            res.write(chunk.choices[0]?.delta?.content || "");
        }
        res.end();

    } catch (error) {
        res.write("Error: " + error.message);
        res.end();
    }
};
