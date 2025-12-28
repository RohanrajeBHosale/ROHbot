const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. Better CORS (Allowing your localhost and domain)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) throw new Error("No user input provided.");

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // --- 2025 MODEL UPDATES ---
        // Gemini 3 Flash is the current state-of-the-art as of Dec 2025
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // 2. RAG Logic: Fetching your knowledge base from Supabase
        const { embedding } = await embedModel.embedContent(userInput);
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3, // Lowered to ensure we always get context
            match_count: 3,
        });

        const context = documents?.map(d => d.content).join('\n\n') || "Rohan's general background.";

        // 3. Start the Chat with History
        const chat = model.startChat({ 
            history: history || [] 
        });

        const prompt = `
            You are ROHbot, the AI digital twin of Rohanraje Bhosale.
            Answer based on this context: ${context}
            
            User Question: ${userInput}
        `;

        // 4. Stream the Response
        const result = await chat.sendMessageStream(prompt);
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        // This pushes the actual error message to your chat window for debugging
        res.write(`ERROR_LOG: ${error.message}`);
        res.end();
    }
};
