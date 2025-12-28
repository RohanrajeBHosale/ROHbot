const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// --- 1. PASTE YOUR NEW CREDENTIALS HERE ---
// Ensure the URL starts with https://
const SUPABASE_URL = 'https://ibfmanphfiqrnbgpoafx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_X9NpMUXxTKclIUSjWWmI6g_prRftpBa';
const GEMINI_KEY = 'AIzaSyBiltdsxNlu7a58r9Ns3AJz2OsuXtc1wAY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function ingest() {
    // This points to the folder with your .md files
    const knowledgeDir = './knowledge';

    if (!fs.existsSync(knowledgeDir)) {
        console.error("❌ Error: 'knowledge' folder not found. Make sure you are in the ROHbot folder.");
        return;
    }

    const files = fs.readdirSync(knowledgeDir);
    console.log("🚀 Starting ingestion...");

    for (const file of files) {
        if (!file.endsWith('.md')) continue;

        console.log(`📄 Processing: ${file}`);
        const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf8');

        try {
            // 2. Generate the embedding (Numbers)
            const result = await model.embedContent(content);
            const embedding = result.embedding.values;

            // 3. Insert into your empty Supabase table
            const { error } = await supabase.from('documents').insert({
                content: content,
                metadata: { source: file },
                embedding: embedding
            });

            if (error) throw error;
            console.log(`✅ Successfully uploaded ${file}`);
        } catch (err) {
            console.error(`❌ Error with ${file}:`, err.message);
        }
    }
    console.log("✨ All files uploaded! Check your Supabase dashboard now.");
}

ingest();