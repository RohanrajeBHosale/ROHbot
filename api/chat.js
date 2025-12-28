const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

module.exports = async (req, res) => {
    // 1. UNIVERSAL CORS & PREFLIGHT
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Set headers for streaming word-by-word to the portfolio
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) return res.status(400).end("No input provided");

        // Initialize Clients
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // 2. RAG STEP 1: Get numbers for the search (Google Embeddings)
        // Embedding quotas are usually NOT blocked even if chat is.
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const { embedding } = await embedModel.embedContent(userInput);

        // 3. RAG STEP 2: Search your knowledge base (Supabase)
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3, 
            match_count: 3,
        });
        const context = documents?.map(d => d.content).join('\n\n') || "No specific context found.";

        // 4. PREPARE HISTORY FOR GROQ
        // Convert Gemini format [{role:'user', parts:[{text:''}]}] 
        // to Groq format [{role:'user', content:''}]
        let groqMessages = [
            { 
                role: "system", 
                content: `You are ROHbot, the AI digital twin of Rohanraje Bhosale. 
                Answer using this context: ${context}. 
                If the info isn't there, answer based on your knowledge of Rohan as an AI/Data Engineer.` 
            }
        ];

        if (history && history.length > 0) {
            history.forEach(m => {
                groqMessages.push({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: m.parts[0].text
                });
            });
        }

        groqMessages.push({ role: "user", content: userInput });

        // 5. GENERATE ANSWER (Groq Llama 3.3 70B)
        const stream = await groq.chat.completions.create({
            messages: groqMessages,
            model: "llama-3.3-70b-versatile",
            stream: true,
        });

        // Push stream chunks to your portfolio UI
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            res.write(content);
        }
        
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        res.write(`ERROR: ${error.message}`);
        res.end();
    }
};
