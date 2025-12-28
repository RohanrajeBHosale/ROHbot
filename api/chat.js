const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. Robust CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();
    
    // Set for Chunked Streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) return res.status(400).end("User input required");

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // 2. 2025 Stable Model Selection
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // 3. RAG Logic: Vector Search
        const { embedding } = await embedModel.embedContent(userInput);
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.4,
            match_count: 3,
        });

        const context = documents?.map(d => d.content).join('\n\n') || "General background of Rohanraje Bhosale.";

        // 4. FIX: HISTORY VALIDATION
        // Gemini requires history to start with 'user'. We filter out any leading 'model' messages.
        let validHistory = (history || []).filter(item => item.parts && item.parts[0].text.trim() !== "");
        if (validHistory.length > 0 && validHistory[0].role === 'model') {
            validHistory.shift(); 
        }

        const chat = model.startChat({ history: validHistory });
        
        const finalPrompt = `
            You are ROHbot, the AI digital twin of Rohanraje Bhosale.
            Use the provided context to answer as Rohan. 
            Context: ${context}
            
            Question: ${userInput}
        `;

        // 5. Streaming Execution
        const result = await chat.sendMessageStream(finalPrompt);
        for await (const chunk of result.stream) {
            res.write(chunk.text());
        }
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        res.write(`ERROR: ${error.message}`);
        res.end();
    }
};
