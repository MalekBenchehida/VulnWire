const fs = require('fs');
const path = require('path');

async function fetchNews() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API key found in environment variables!");
        process.exit(1);
    }

    console.log("Fetching latest cyber intelligence from Gemini...");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const prompt = `Search the web for the latest cybersecurity news from today or yesterday. 
Return exactly 4 stories for each of the following categories:
1. Data Breaches
2. Ransomware
3. Vulnerabilities (Software flaws, zero-days)

For each story provide:
- title: Headline of the event
- tldr: A 2-sentence summary.
- action: Specific, actionable advice for a security team.
- cve_ids: An array of strings containing any CVE numbers mentioned (e.g., ["CVE-2024-1234"]). If none, return an empty array [].

Respond ONLY with a valid JSON object in this exact shape, no markdown or extra text:
{"breaches":[{"title":"...","tldr":"...","action":"...","cve_ids":[]}],"ransomware":[...],"vulns":[...]}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ 
            google_search_retrieval: {
                dynamic_retrieval_config: {
                    mode: "MODE_DYNAMIC",
                    dynamic_threshold: 0.3
                }
            } 
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const data = await response.json();
        let jsonString = data.candidates[0].content.parts[0].text;
        // Strip markdown code fences if present
        jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        
        const rootPath = path.join(__dirname, '..', 'data.json');
        fs.writeFileSync(rootPath, jsonString);
        console.log("Successfully saved data to data.json");

    } catch (error) {
        console.error("Error fetching news:", error);
        process.exit(1);
    }
}

fetchNews();
