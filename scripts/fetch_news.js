const fs = require('fs');
const path = require('path');

const RSS_FEEDS = [
    'https://feeds.feedburner.com/TheHackersNews',
    'https://www.bleepingcomputer.com/feed/',
    'https://www.cisa.gov/feeds/hacker-news.xml',
    'https://feeds.feedburner.com/Securityweek',
];

async function fetchRSS(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < 10) {
            const block = itemMatch[1];
            // Improved regex to handle various title formats
            const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                             block.match(/<title>(.*?)<\/title>/);
            const linkMatch = block.match(/<link>(.*?)<\/link>/) || 
                            block.match(/<feedburner:origLink>(.*?)<\/feedburner:origLink>/);
            
            const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
            const link = linkMatch ? linkMatch[1].trim() : '';
            if (title) items.push({ title, url: link });
        }
        return items;
    } catch (e) {
        console.error(`Error fetching RSS from ${url}:`, e.message);
        return [];
    }
}

async function fetchNews() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API key found in environment variables!");
        process.exit(1);
    }

    console.log("Fetching live RSS feeds...");
    const results = await Promise.all(RSS_FEEDS.map(fetchRSS));
    const headlines = results.flat().slice(0, 40);

    if (headlines.length === 0) {
        console.error("No headlines fetched from RSS feeds.");
        process.exit(1);
    }

    console.log(`Got ${headlines.length} headlines. Sending to Gemini...`);

    const prompt = `You are a cybersecurity analyst. Using ONLY the articles below, categorize and expand on them.
Pick 4 stories for each category: Data Breaches, Ransomware, Vulnerabilities.
If a category has fewer than 4 relevant articles, use the closest matches.

ARTICLES:
${headlines.map((h, i) => `${i + 1}. ${h.title} | URL: ${h.url}`).join('\n')}

For each story provide:
- title: The headline
- tldr: A 2-sentence summary based on the headline.
- action: Specific, actionable advice for a security team.
- cve_ids: Any CVE numbers mentioned (e.g., ["CVE-2024-1234"]). If none, return [].
- source_url: The URL from the article list above that matches this story.

Respond ONLY with valid JSON, no markdown:
{"breaches":[{"title":"...","tldr":"...","action":"...","cve_ids":[],"source_url":"..."}],"ransomware":[...],"vulns":[...]}`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    // Updated to currently available stable models
    const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

    try {
        let jsonString;
        for (const model of MODELS) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.status === 404 || response.status === 429) {
                    console.log(`${model} not available (${response.status}), trying next...`);
                    continue;
                }
                
                if (!response.ok) {
                    const body = await response.text();
                    console.error(`Model ${model} failed: ${response.status} - ${body}`);
                    continue;
                }
                
                console.log(`Using model: ${model}`);
                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    jsonString = data.candidates[0].content.parts[0].text;
                    break;
                }
            } catch (e) {
                console.error(`Error with model ${model}:`, e.message);
            }
        }

        if (!jsonString) throw new Error('No available Gemini model found or all requests failed.');

        // Clean up markdown if AI included it
        jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

        // VALIDATION: Ensure it's valid JSON before writing
        try {
            const parsed = JSON.parse(jsonString);
            // Ensure expected keys exist
            if (!parsed.breaches || !parsed.ransomware || !parsed.vulns) {
                throw new Error("Missing required categories in AI response.");
            }
            // Re-stringify to ensure clean formatting
            jsonString = JSON.stringify(parsed, null, 2);
        } catch (e) {
            console.error("AI returned invalid JSON:", e.message);
            console.error("Raw response:", jsonString);
            process.exit(1);
        }

        const rootPath = path.join(__dirname, '..', 'data.json');
        fs.writeFileSync(rootPath, jsonString);
        console.log("Successfully saved data to data.json");

    } catch (error) {
        console.error("Error fetching news:", error);
        process.exit(1);
    }
}

fetchNews();
