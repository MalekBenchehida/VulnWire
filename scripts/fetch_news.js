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
        const xml = await res.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < 10) {
            const block = itemMatch[1];
            const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/);
            const linkMatch = block.match(/<link>(.*?)<\/link>/) || block.match(/<feedburner:origLink>(.*?)<\/feedburner:origLink>/);
            const title = titleMatch ? titleMatch[1].trim() : null;
            const link = linkMatch ? linkMatch[1].trim() : '';
            if (title) items.push({ title, url: link });
        }
        return items;
    } catch {
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

    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash'];

    try {
        let data;
        for (const model of MODELS) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.status === 404 || response.status === 429) { console.log(`${model} not available (${response.status}), trying next...`); continue; }
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`HTTP Error: ${response.status} - ${body}`);
            }
            console.log(`Using model: ${model}`);
            data = await response.json();
            break;
        }
        if (!data) throw new Error('No available Gemini model found.');
        let jsonString = data.candidates[0].content.parts[0].text;
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
