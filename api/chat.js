// FILE: /api/chat.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // --- Standard CORS and method handling ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    // --- Set headers for Server-Sent Events (SSE) streaming ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { userInput, history } = req.body;
        if (!userInput) {
            throw new Error("User input is required.");
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const chat = generationModel.startChat({ history: history || [] });

        // --- RAG Pipeline: Find relevant context and metadata ---
        const { embedding } = await embeddingModel.embedContent(userInput);
        const { data: documents, error: rpcError } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.70,
            match_count: 5
        });

        if (rpcError) throw new Error(`Supabase RPC Error: ${rpcError.message}`);

        // This is the CRITICAL part for the animation
        const sourcesMetadata = documents ? documents.map(doc => doc.metadata).filter(Boolean) : [];
        const contextText = documents && documents.length > 0 ? documents.map(doc => doc.content).join('\n\n') : "No relevant context found.";

        const finalPrompt = `You are ROHbot, an AI assistant for Rohanraje Bhosale. Based on the following CONTEXT, answer the user's question concisely.\n\nCONTEXT:\n${contextText}\n\nUSER'S QUESTION: ${userInput}`;

        const result = await chat.sendMessageStream(finalPrompt);

        // Stream the response as structured JSON
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                // Send a text chunk
                res.write(`data: ${JSON.stringify({ type: 'text_chunk', content: chunkText })}\n\n`);
            }
        }

        // After all text is sent, send the metadata for the animation
        if (sourcesMetadata.length > 0) {
            res.write(`data: ${JSON.stringify({ type: 'metadata', sources: sourcesMetadata })}\n\n`);
        }

    } catch (error) {
        console.error("Error in chat API:", error);
        // Send a structured error message
        res.write(`data: ${JSON.stringify({ type: 'error', content: "I'm having trouble connecting to my core systems right now." })}\n\n`);
    } finally {
        // End the connection
        res.end();
    }
};
