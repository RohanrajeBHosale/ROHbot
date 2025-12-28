const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. CORS Headers
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
        
        // 2. SWITCHED TO 1.5 FLASH (Most reliable for Free Tier)
        // This model has the highest quota for free users in Dec 2025.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // 3. RAG Logic: Search Supabase
        const { embedding } = await embedModel.embedContent(userInput);
        const { data: documents } = await supabase.rpc('match_documents', {
            query_embedding: embedding.values,
            match_threshold: 0.3,
            match_count: 3,
        });

        const context = documents?.map(d => d.content).join('\n\n') || "No specific background info found.";

        // 4. Clean History for Gemini (Strict User -> Model alternating)
        let validHistory = (history || []).filter(item => item.parts && item.parts[0].text.trim() !== "");
        if (validHistory.length > 0 && validHistory[0].role === 'model') {
            validHistory.shift(); 
        }

        const chat = model.startChat({ history: validHistory });
        const prompt = `You are ROHbot, the AI twin of Rohanraje Bhosale. Use this context: ${context}\n\nQuestion: ${userInput}`;

        // 5. Stream output
        const result = await chat.sendMessageStream(prompt);
        for await (const chunk of result.stream) {
            res.write(chunk.text());
        }
        res.end();

    } catch (error) {
        console.error("Backend Error:", error);
        // If we get a 429 again, let the user know it's a Google quota issue
        if (error.message.includes('429')) {
            res.write("QUOTA_ERROR: Google has temporarily limited my free brain. Please try again in 60 seconds.");
        } else {
            res.write(`ERROR: ${error.message}`);
        }
        res.end();
    }
};
