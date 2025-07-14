// api/chat.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// The system prompt remains the same.
const systemPrompt = `You are ROHbot, a personal AI assistant for Rohanraje Bhosale. You must act and speak as if you ARE Rohan. Use "I", "my", not "his".
Your tone is professional, confident, and clear.
You have been provided with relevant context scraped from my life and career knowledge base. 
You MUST use this context to form your answer. If the context does not contain the answer, say "That's an excellent question. From what I recall, that specific detail isn't top of mind, but I can tell you about a related area..." and then pivot to a relevant topic from the context.
Do not make up information. Base your answer strictly on the provided context.`;

module.exports = async (req, res) => {
    // CORS headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        try {
            const { userInput } = req.body;
            if (!userInput) return res.status(400).json({ error: 'User input is required.' });
            
            // Initialize clients...
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
            
            // Step 1a: Rewrite Query
            const queryRewriterModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const rewritePrompt = `Rewrite the following user query to be from a first-person perspective, as if the user is asking me (Rohan) directly. For example, 'tell me about his education' should become 'tell me about your education'. Just return the rewritten query and nothing else. Query: "${userInput}"`;
            const rewriteResult = await queryRewriterModel.generateContent(rewritePrompt);
            const rewrittenQuery = (await rewriteResult.response.text()).trim();

            console.log(`Original Query: "${userInput}" | Rewritten Query: "${rewrittenQuery}"`);

            // Step 1b: Retrieve Documents
            const { embedding } = await embeddingModel.embedContent(rewrittenQuery);
            const { data: documents, error } = await supabase.rpc('match_documents', {
                query_embedding: embedding.values,
                match_threshold: 0.70,
                match_count: 5
            });

            if (error) throw new Error(`Supabase error: ${error.message}`);
            
            const contextText = documents && documents.length > 0
                ? documents.map(doc => doc.content).join('\n\n---\n\n')
                : "No relevant information found in the knowledge base.";

            // 2. Augment: Create the final, robust prompt
            const generationModel = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction: systemPrompt
            });
            
            // --- THIS IS THE KEY CHANGE ---
            // This structure is much more direct and less prone to leakage.
            const augmentedPrompt = `
                A user is asking me the following question: "${userInput}"

                I have searched my knowledge base and found the following relevant context:
                """
                ${contextText}
                """

                Based on my persona and the provided context, what is the best possible response I can give?
            `;
            
            // 3. Generate
            const finalResult = await generationModel.generateContent(augmentedPrompt);
            const responseText = await finalResult.response.text();
            
            res.status(200).json({ reply: responseText });

        } catch (error) {
            console.error("Error in RAG pipeline:", error);
            res.status(500).json({ error: "Failed to process the request." });
        }
    } else {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
