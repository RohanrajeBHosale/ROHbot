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
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.2, 
            match_count: 5,
        });

        const contextText = documents?.map(d => d.content).join('\n\n') || "";

        const groqMessages = [
            { 
                role: "system", 
                content: `You are ROHbot, Rohan's AI twin. 
                CONTEXT: ${contextText}
                
                STRICT PERSONALITY RULES:
                1. BE CONCISE. Keep your response to 1-2 SHORT sentences maximum.
                2. Direct and punchy. No long intros or "fluff."
                3. Answer in the first person.
                4. If a user interrupts with a new question, pivot immediately.` 
            },
            ...(history || []).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.parts[0].text
            })),
            { role: "user", content: userInput }
        ];

        const stream = await groq.chat.completions.create({
            messages: groqMessages,
            model: "llama-3.3-70b-versatile",
            stream: true,
            max_tokens: 150, // Hard limit for brevity
            temperature: 0.6
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) res.write(content);
        }
        res.end();

    } catch (error) {
        console.error(error);
        res.write("I'm having a quick brain-freeze. Try again?");
        res.end();
    }
};
