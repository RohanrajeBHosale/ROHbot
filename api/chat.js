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

    try {
        const { userInput } = req.body;
        if (!userInput) return res.status(400).json({ error: 'User input is required.' });

        // Initialize Supabase and Google AI clients
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // --- RAG PIPELINE ---

        // 1. Rewrite the query for better semantic search (first-person)
        const rewritePrompt = `Rewrite the following user query to be from a first-person perspective, asking about "you" or "your". For example, 'tell me about his education' becomes 'tell me about your education'. Just return the rewritten query. Query: "${userInput}"`;
        const rewriteResult = await generationModel.generateContent(rewritePrompt);
        const rewrittenQuery = (await rewriteResult.response.text()).trim();
        console.log(`Rewritten query for search: "${rewrittenQuery}"`);
        
        // 2. Embed the rewritten query
        const { embedding } = await embeddingModel.embedContent(rewrittenQuery);

        // 3. Retrieve relevant documents from Supabase
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.70, // Keep this slightly lower threshold
            match_count: 5,
        });

        if (error) throw new Error(`Supabase RPC error: ${error.message}`);
        
        const contextText = documents && documents.length > 0
            ? documents.map((doc, index) => `Context Snippet ${index + 1}:\n${doc.content}`).join('\n\n')
            : "No relevant context found.";
        
        console.log("Retrieved Context:\n", contextText);

        // 4. Augment and Generate the final response in one clear prompt
        const finalPrompt = `
            You are ROHbot, a personal AI assistant for Rohanraje Bhosale. You MUST act and speak as if you ARE Rohan.
            - Your persona is professional, confident, and clear.
            - Your task is to answer the user's question based *only* on the provided context below.
            - Use the first-person ("I", "my"). Do not say "Rohan" or "his".

            ---
            CONTEXT FROM KNOWLEDGE BASE:
            ${contextText}
            ---

            USER'S QUESTION:
            "${userInput}"

            INSTRUCTION:
            Based on the provided context, formulate a comprehensive answer to the user's question.
            - If the context directly answers the question, synthesize the information into a helpful response.
            - If the context is empty or does not contain the answer ("No relevant context found."), you MUST respond with: "That's a great question. While that specific detail isn't in my immediate knowledge base, I'd be happy to discuss my projects or professional experience instead."
        `;
        
        const result = await generationModel.generateContent(finalPrompt);
        const responseText = await result.response.text();

        res.status(200).json({ reply: responseText });

    } catch (error) {
        console.error("Error in RAG pipeline:", error);
        res.status(500).json({ error: "Failed to process the request." });
    }
};
