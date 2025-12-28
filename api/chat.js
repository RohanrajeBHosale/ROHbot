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
        const { userInput, history } = req.body;
        if (!userInput) return res.status(400).end("No input");

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // 1. Get Embeddings (Google)
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        // 2. Search Knowledge (Supabase)
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3, 
            match_count: 3,
        });
        const contextText = documents?.map(d => d.content).join('\n\n') || "Rohan is an AI Engineer.";

        // 3. Format History for Groq
        const groqMessages = [
            { 
                role: "system", 
                content: `You are ROHbot, the AI digital twin of Rohanraje Bhosale. 
                Use this context to answer: ${contextText}. 
                Be concise, professional, and friendly. Do not repeat yourself.` 
            },
            ...(history || []).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: typeof m.parts[0].text === 'string' ? m.parts[0].text : ''
            })).filter(m => m.content !== ""),
            { role: "user", content: userInput }
        ];

        // 4. Stream from Groq
        const stream = await groq.chat.completions.create({
            messages: groqMessages,
            model: "llama-3.3-70b-versatile",
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) res.write(content);
        }
        
        res.end();

    } catch (error) {
        console.error(error);
        res.write("Error processing request.");
        res.end();
    }
};
