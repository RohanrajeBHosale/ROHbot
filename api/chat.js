const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. UNIVERSAL CORS HANDLER (One block to rule them all)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Set streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        const { userInput, history } = req.body;
        if (!userInput) {
            res.write("Error: User input is required.");
            return res.end();
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // --- MODEL UPDATES FOR LATE 2025 ---
        // Changed to Gemini 2.0 Flash (The stable 2025 workhorse)
        const generationModel = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash", 
        });

        // Embedding model (keeping 004 as it is usually stable)
        const embeddingModel = genAI.getGenerativeModel({ 
            model: "text-embedding-004" 
        });

        const chat = generationModel.startChat({
            history: history || [],
        });

        // 2. RAG PIPELINE: Query Rewriting
        const rewritePrompt = `Rewrite the user's query to be a concise search term for a vector database... Query: "${userInput}"`;
        const rewriteResult = await generationModel.generateContent(rewritePrompt);
        const rewrittenQuery = (await rewriteResult.response.text()).trim();
        
        // 3. RAG PIPELINE: Vector Search
        const { embedding } = await embeddingModel.embedContent(rewrittenQuery);
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.50, // Slightly lowered to ensure we get context
            match_count: 5,
        });

        if (error) throw new Error(`Supabase RPC error: ${error.message}`);
        
        const contextText = documents && documents.length > 0 
            ? documents.map(doc => doc.content).join('\n\n') 
            : "No specific background found in knowledge base.";

        const finalPrompt = `
            You are ROHbot, the AI digital twin of Rohanraje Bhosale.
            Use the following context to answer the user accurately. 
            If the answer isn't in the context, use your general knowledge but stay in character.
            
            CONTEXT FROM ROHAN'S KNOWLEDGE BASE:
            ${contextText}
            
            USER'S QUESTION:
            "${userInput}"
        `;

        // 4. STREAMING RESPONSE
        const result = await chat.sendMessageStream(finalPrompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText); // Push chunk to the portfolio UI
        }
        
        res.end();

    } catch (error) {
        console.error("Error in RAG streaming pipeline:", error);
        // Provide the specific error to the UI for easier debugging
        res.write(`Error: ${error.message || "I'm having trouble connecting to my core logic."}`);
        res.end()
