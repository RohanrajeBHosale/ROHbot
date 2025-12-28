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
        
        // 1. Get Embeddings for the search
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        // 2. Search your Knowledge Base in Supabase
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3, 
            match_count: 5,
        });

        // Combine the found documents into a single context string
        const contextText = documents?.map(d => d.content).join('\n\n') || "No background info found.";

        // 3. Construct the Groq Messages with strict Persona instructions
        const groqMessages = [
            { 
                role: "system", 
                content: `You are ROHbot, the AI digital twin of Rohanraje Bhosale. 
                You have access to Rohan's personal knowledge base provided below. 
                
                STRICT RULES:
                1. Use the CONTEXT to answer questions about Rohan's education, skills, and experience.
                2. Answer in the FIRST PERSON (e.g., "I studied at...", "My projects include...").
                3. If the user asks about education, refer to the provided context.
                4. Do NOT say you don't have personal information. If it's in the context, YOU KNOW IT.
                
                CONTEXT FROM ROHAN'S RECORDS:
                ${contextText}` 
            },
            ...(history || []).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.parts[0].text
            })),
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
            res.write(content);
        }
        
        res.end();

    } catch (error) {
        console.error(error);
        res.write("I'm having trouble retrieving my memories right now.");
        res.end();
    }
};
