const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load local .env if running locally

// 1. Setup Clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

const GITHUB_USERNAME = "RohanrajeBHosale";

async function generateAndUpload(content, source, repoName = null) {
    try {
        const result = await embedModel.embedContent(content);
        const embedding = result.embedding.values;

        const { error } = await supabase.from('documents').upsert({
            content: content,
            metadata: { source: source, repo: repoName, last_updated: new Date() },
            embedding: embedding
        }, { onConflict: 'content' });

        if (error) throw error;
        console.log(`✅ Synced: ${source}`);
    } catch (err) {
        console.error(`❌ Failed: ${source}`, err.message);
    }
}

async function startIngestion() {
    console.log("🚀 Starting Full Knowledge Update...");

    // PART A: Ingest Local Markdown Files (Personal/Education/Exp)
    const knowledgeDir = './knowledge';
    if (fs.existsSync(knowledgeDir)) {
        const files = fs.readdirSync(knowledgeDir);
        for (const file of files) {
            if (file.endsWith('.md')) {
                const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf8');
                await generateAndUpload(content, `file:${file}`);
            }
        }
    }

    // PART B: Ingest GitHub Projects (Auto-discovery)
    console.log("🔍 Scanning GitHub for tagged portfolio projects...");
    try {
        // Authenticated request using your new Token
        const res = await axios.get(
            `https://api.github.com/search/repositories?q=user:${GITHUB_USERNAME}+topic:portfolio`, 
            {
                headers: {
                    'Authorization': `token ${process.env.GH_PAT}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        const repos = res.data.items;
        for (const repo of repos) {
            const projectInfo = `
                Project Name: ${repo.name}
                Description: ${repo.description || "An AI/Data project by Rohan."}
                URL: ${repo.html_url}
                Primary Language: ${repo.language}
                Topics: ${repo.topics.join(', ')}
            `.trim();

            await generateAndUpload(projectInfo, 'github-api', repo.name);
        }
    } catch (err) {
        console.error("❌ GitHub API Error:", err.message);
    }

    console.log("✨ Bot Knowledge is now 100% up to date.");
}

startIngestion();
