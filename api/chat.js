// api/chat.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // Standard CORS and method handling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        // UPDATED: Receive history from the request body
        const { userInput, history } = req.body;
        if (!userInput) {
            res.write("Error: User input is required.");
            return res.end();
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // The generation model is now initialized with history
        const generationModel = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
        });

        const chat = generationModel.startChat({
            history: history || [], // <-- Use the provided history
        });

        // RAG Pipeline
        const rewritePrompt = `Rewrite the user's query to be a question about "me" or "my" background... Query: "${userInput}"`;
        const rewriteResult = await generationModel.generateContent(rewritePrompt);
        const rewrittenQuery = (await rewriteResult.response.text()).trim();
        
        const { embedding } = await embeddingModel.embedContent(rewrittenQuery);
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.70,
            match_count: 5,
        });

        if (error) throw new Error(`Supabase RPC error: ${error.message}`);
        
        const contextText = documents && documents.length > 0 ? documents.map(doc => doc.content).join('\n\n') : "No relevant context found.";

        const finalPrompt = `
            You are ROHbot, an AI assistant for Rohanraje Bhosale... (rest of your detailed prompt)
            ---
            CONTEXT:
            ${contextText}
            ---
            USER'S QUESTION:
            "${userInput}"
            ---
            INSTRUCTION:
            Based on the context AND the conversation history, formulate a comprehensive answer...
        `;

        // Use the chat session to send the new message
        const result = await chat.sendMessageStream(finalPrompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }
        
        res.end();

    } catch (error) {
        console.error("Error in RAG streaming pipeline:", error);
        res.write("Error: I'm having trouble connecting to my core logic right now.");
        res.end();
    }
};
