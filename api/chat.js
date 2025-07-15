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
    
    // --- THIS IS THE KEY CHANGE FOR STREAMING ---
    // We set the response header for a streaming text response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput } = req.body;
        if (!userInput) {
            res.write("Error: User input is required.");
            return res.end();
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // RAG Pipeline Steps (unchanged)
        const rewritePrompt = `Rewrite the following user query to be from a first-person perspective... Query: "${userInput}"`; // Abbreviated for clarity
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
            You are ROHbot... (rest of your detailed prompt)
            ---
            CONTEXT:
            ${contextText}
            ---
            USER'S QUESTION:
            "${userInput}"
            ---
            INSTRUCTION:
            Based on the context, formulate a comprehensive answer...
        `; // Abbreviated for clarity

        // --- Use generateContentStream ---
        const result = await generationModel.generateContentStream(finalPrompt);

        // Stream the response back to the client
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText); // Write each chunk as it arrives
        }
        
        res.end(); // End the response stream when Gemini is done

    } catch (error) {
        console.error("Error in RAG streaming pipeline:", error);
        res.write("Error: I'm having trouble connecting to my core logic right now.");
        res.end();
    }
};
