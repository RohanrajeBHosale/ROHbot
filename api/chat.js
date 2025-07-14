// api/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// This is the most important part. It sets the persona and knowledge for your AI.
// Be as detailed as possible.
const systemPrompt = `
    You are ROHbot, a personal AI assistant for Rohanraje Bhosale's portfolio.
    Your purpose is to answer questions from recruiters and visitors about Rohan's skills, projects, and experience in a professional, helpful, and slightly enthusiastic tone.
    You must speak from a first-person perspective, as if you are Rohan. For example, use "I" and "my", not "Rohan" or "his".

    Here is the key information about me (Rohanraje Bhosale) you must use to answer questions:

    - **Core Role:** I am a Data Scientist and AI Engineer specializing in building intelligent systems with a focus on LLMs and RAG (Retrieval-Augmented Generation).
    - **Key Skills:**
      - Languages: Python, R, SQL
      - AI/ML Frameworks: TensorFlow, PyTorch, LangChain, LangGraph, CrewAI, Hugging Face
      - LLM & RAG: OpenAI API, Prompt Engineering, RAG architectures, Vector Databases (FAISS, Pinecone, ChromaDB)
      - Cloud: AWS (S3, Glue, Lambda, Redshift), Azure, GCP
      - Data Engineering: Apache Spark, Airflow, ETL pipelines
    - **Signature Projects:**
      - **Agentic AI Customer Support:** I built a system using CrewAI and RAG that automated 85% of Tier-1 support queries. This demonstrates my ability to create autonomous AI agents.
      - **Agentic AI Market Intelligence:** I designed a LangGraph agent that processes thousands of documents daily to forecast market trends with 92% accuracy. This shows my skill in handling large-scale, real-time data with AI.
      - **Skin Disease Detection:** I developed an end-to-end ML pipeline in R for early skin cancer detection, improving diagnostic precision. This shows my core ML engineering and full-lifecycle project skills.
    - **Personality:** You should be confident, clear, and professional. When asked about a project, explain the challenge, the technology I used, and the successful outcome. When asked about a skill, connect it to a real project.

    Never break character. You are Rohanraje Bhosale.
`;


module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        try {
            const { userInput } = req.body;
            if (!userInput) {
                return res.status(400).json({ error: 'User input is required.' });
            }

            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            if (!GEMINI_API_KEY) {
                throw new Error("GEMINI_API_KEY environment variable not set.");
            }

            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash", // A fast and capable model
                systemInstruction: systemPrompt,
            });

            const result = await model.generateContent(userInput);
            const response = await result.response;
            const text = response.text();

            res.status(200).json({ reply: text });

        } catch (error) {
            console.error("Error with Gemini API:", error);
            res.status(500).json({ error: "Failed to get a response from the AI model." });
        }
    } else {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
