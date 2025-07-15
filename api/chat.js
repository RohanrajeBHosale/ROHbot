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

        // Initialize clients
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Step 1: Rewrite Query
        const rewritePrompt = `Rewrite the user's query to be a question about "me" or "my" background. For example, "tell me about his education" becomes "tell me about your education". Just return the rewritten query. Query: "${userInput}"`;
        const rewriteResult = await generationModel.generateContent(rewritePrompt);
        const rewrittenQuery = (await rewriteResult.response.text()).trim();
        console.log(`Rewritten query for search: "${rewrittenQuery}"`);
        
        // Step 2: Retrieve Documents
        const { embedding } = await embeddingModel.embedContent(rewrittenQuery);
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.70,
            match_count: 5,
        });

        if (error) throw new Error(`Supabase RPC error: ${error.message}`);
        
        const contextText = documents && documents.length > 0
            ? documents.map(doc => doc.content).join('\n\n---\n\n')
            : "No relevant context found in the knowledge base.";
        
        console.log("Retrieved Context:\n", contextText.substring(0, 200) + "...");

        // Step 3: Augment and Generate with advanced rules
        const finalPrompt = `
            You are ROHbot, an AI assistant representing Rohanraje Bhosale. Your primary function is to answer questions about Rohan's life, skills, and career based ONLY on the provided context. You must speak from a first-person perspective ("I", "my").

            **RULES:**
            1.  **Grounding:** Base your entire answer on the "CONTEXT FROM KNOWLEDGE BASE" provided below. Do not use any outside knowledge.
            2.  **Persona:** You are professional, confident, and clear.
            3.  **General Questions Gate-keeping:** If the user's question is clearly a general knowledge question (e.g., "what is the capital of France?", "explain quantum physics") AND the provided context is empty or irrelevant, you MUST first ask for permission to answer it. Respond with ONLY this: "My main purpose is to discuss Rohan's skills and projects. Are you sure you'd like me to answer that general knowledge question?"
            4.  **Fallback:** If the user's question IS about Rohan but the context is empty ("No relevant context found."), you MUST respond with ONLY this: "That's an excellent question. While that specific detail isn't in my immediate knowledge base, I'd be happy to discuss my projects or professional experience instead."

            ---
            CONTEXT FROM KNOWLEDGE BASE:
            ${contextText}
            ---

            USER'S ORIGINAL QUESTION:
            "${userInput}"

            ---
            Based on these rules and the provided context, generate the best possible response.
        `;
        
        const result = await generationModel.generateContent(finalPrompt);
        const responseText = await result.response.text();

        res.status(200).json({ reply: responseText });

    } catch (error) {
        console.error("Error in RAG pipeline:", error);
        res.status(500).json({ error: "Failed to process the request." });
    }
};
