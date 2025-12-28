const axios = require('axios'); // Add this: npm install axios

async function ingestGithubProjects() {
    const GITHUB_USERNAME = "RohanrajeBHosale";
    console.log("🔍 Scanning GitHub for new projects...");

    try {
        // Fetch your public repos
        const res = await axios.get(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated`);
        const repos = res.data;

        for (const repo of repos) {
            // Only ingest if the repo is tagged with 'portfolio'
            if (!repo.topics.includes('portfolio')) continue;

            console.log(`📦 Ingesting project: ${repo.name}`);
            const content = `Project Name: ${repo.name}\nDescription: ${repo.description}\nLink: ${repo.html_url}\nMain Language: ${repo.language}`;

            // Turn this metadata into an embedding and push to Supabase
            const result = await model.embedContent(content);
            const embedding = result.embedding.values;

            await supabase.from('documents').upsert({
                content: content,
                metadata: { source: 'github-api', repo: repo.name },
                embedding: embedding
            }, { onConflict: 'content' }); // Prevents duplicates
        }
    } catch (e) {
        console.error("GitHub API Error:", e.message);
    }
}
