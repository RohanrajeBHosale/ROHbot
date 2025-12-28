const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. Unified CORS & Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) return res.status(400).end("User input required");

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // 2. USE GEMINI 1.5 FLASH
        // In late 2025, 1.5 Flash is the most reliable model for Free Tier accounts
        // that have previously faced security flags.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // 3. RAG Pipeline: Vector Search
        const { embedding } = await embedModel.embedContent(userInput);
        const { data: documents, error: dbError } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3, 
            match_count: 3,
        });

        if (dbError) console.error("Supabase Error:", dbError);

        const context = documents?.map(d => d.content).join('\n\n') || "No specific background found.";

        // 4. Gemini History Validation
        // Ensure history starts with 'user' and alternates correctly
        let validHistory = (history || []).filter(item => item.parts && item.parts[0].text.trim() !== "");
        if (validHistory.length > 0 && validHistory[0].role === 'model') {
            validHistory.shift(); 
        }

        const chat = model.startChat({ history: validHistory });
        
        const finalPrompt = `
            You are ROHbot, the AI digital twin of Rohanraje Bhosale.
            Answer the user's question based on the context provided below.
            
            CONTEXT FROM ROHAN'S RECORDS:
            ${context}
            
            USER QUESTION:
            "${userInput}"
        `;

        // 5. Streaming Response
        const result = await chat.sendMessageStream(finalPrompt);
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        
        // Custom error message for the 429 Quota issue
        if (error.message.includes('429')) {
            res.write("QUOTA_NOTICE: Google has limited 2.0 Flash access for this project. Switched to 1.5 Flash. Please refresh and try again.");
        } else {
            res.write(`ERROR_DETAIL: ${error.message}`);
        }
        res.end();
    }
};
