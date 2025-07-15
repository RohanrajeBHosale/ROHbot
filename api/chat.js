// FILE: /api/chat.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI, FunctionDeclarationSchemaType } = require('@google/generative-ai');
const axios = require('axios');

// --- Tool Implementation (Your existing function) ---
async function getVercelDeploymentStatus() {
    try {
        const { VERCEL_API_TOKEN, VERCEL_PROJECT_ID } = process.env;
        if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID) {
            throw new Error('Vercel environment variables not set.');
        }
        const response = await axios.get(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1`, {
            headers: { 'Authorization': `Bearer ${VERCEL_API_TOKEN}` }
        });
        const latestDeployment = response.data.deployments[0];
        return { status: latestDeployment.state, url: latestDeployment.url };
    } catch (error) {
        console.error("Error fetching Vercel status:", error);
        return { status: 'unknown', error: 'Could not fetch deployment status.' };
    }
}

// --- Tool Definition (Your existing schema) ---
const tools = [{
    functionDeclarations: [{
        name: 'getVercelDeploymentStatus',
        description: 'Gets the current live deployment status of the ROHbot project from Vercel to see if it is online and ready.',
        parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} }
    }]
}];

// --- Main Serverless Function ---
module.exports = async (req, res) => {
    // Standard CORS and method handling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { userInput, history } = req.body;
        if (!userInput) throw new Error("User input is required.");

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", tools });
        
        const chat = generationModel.startChat({ history: history || [] });

        // --- RAG Pipeline: Find relevant context first ---
        const { embedding } = await embeddingModel.embedContent(userInput);
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values, match_threshold: 0.70, match_count: 5
        });

        // CRITICAL: Extract metadata for the frontend animation
        const sourcesMetadata = documents ? documents.map(doc => doc.metadata).filter(Boolean) : [];
        const contextText = documents && documents.length > 0 ? documents.map(doc => doc.content).join('\n\n') : "No relevant context found.";

        const finalPrompt = `
            You are ROHbot, an AI assistant for Rohanraje Bhosale. Your persona is professional, slightly formal, and highly intelligent.
            ---
            CONTEXT FROM KNOWLEDGE BASE:
            ${contextText}
            ---
            USER'S QUESTION: "${userInput}"
            ---
            INSTRUCTION:
            1.  First, decide if the user's question can ONLY be answered by using a tool. If they ask about the real-time status of the project, use the 'getVercelDeploymentStatus' tool.
            2.  Otherwise, formulate a comprehensive answer based *primarily* on the provided CONTEXT. Do not use tools if the context can answer the question.
            3.  Be concise and directly answer the user's question.
        `;

        // Use streaming to get the initial response
        const resultStream = await chat.sendMessageStream(finalPrompt);
        let functionCall = null;
        let initialText = "";

        // Process the initial stream to check for a function call
        for await (const chunk of resultStream.stream) {
            if (chunk.functionCalls) {
                functionCall = chunk.functionCalls[0];
                break; // Exit loop once function call is found
            }
            initialText += chunk.text();
        }

        if (functionCall) {
            // --- Logic for when a TOOL is used ---
            console.log("LLM decided to call a tool:", functionCall.name);
            let functionResponse;
            if (functionCall.name === 'getVercelDeploymentStatus') {
                functionResponse = await getVercelDeploymentStatus();
            } else {
                functionResponse = { error: "Unknown tool called" };
            }

            // Send the tool's result back to the model and stream the final response
            const result2Stream = await chat.sendMessageStream([
                { functionResponse: { name: functionCall.name, response: functionResponse } }
            ]);

            for await (const chunk of result2Stream.stream) {
                res.write(`data: ${JSON.stringify({ type: 'text_chunk', content: chunk.text() })}\n\n`);
            }
            // Add metadata for the tool call itself
            res.write(`data: ${JSON.stringify({ type: 'metadata', sources: [{ source_name: 'Vercel' }] })}\n\n`);

        } else {
            // --- Logic for when NO TOOL is used (standard RAG answer) ---
            // Stream the text that was already generated
            res.write(`data: ${JSON.stringify({ type: 'text_chunk', content: initialText })}\n\n`);
            
            // CRITICAL: Send the metadata from the RAG search at the end
            if (sourcesMetadata.length > 0) {
                res.write(`data: ${JSON.stringify({ type: 'metadata', sources: sourcesMetadata })}\n\n`);
            }
        }
        
    } catch (error) {
        console.error("Error in agentic pipeline:", error);
        res.write(`data: ${JSON.stringify({ type: 'error', content: "I'm having trouble with my internal logic right now." })}\n\n`);
    } finally {
        res.end(); // End the SSE connection
    }
};
