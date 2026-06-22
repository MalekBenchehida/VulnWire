const fs = require('fs');
const path = require('path');

const RSS_FEEDS = [
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'CISA', url: 'https://www.cisa.gov/feeds/hacker-news.xml' },
    { name: 'SecurityWeek', url: 'https://feeds.feedburner.com/Securityweek' },
];

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8211;/g, '-')
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchRSS(feed) {
    try {
        const res = await fetch(feed.url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < 10) {
            const block = itemMatch[1];
            const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                             block.match(/<title>(.*?)<\/title>/);
            const linkMatch = block.match(/<link>(.*?)<\/link>/) || 
                            block.match(/<feedburner:origLink>(.*?)<\/feedburner:origLink>/);
            const descMatch = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || 
                            block.match(/<description>(.*?)<\/description>/);
            
            const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
            const link = linkMatch ? linkMatch[1].trim() : '';
            const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
            if (title) {
                items.push({
                    title: cleanText(title),
                    url: link,
                    description: cleanText(description),
                    source: feed.name
                });
            }
        }
        return items;
    } catch (e) {
        console.error(`Error fetching RSS from ${feed.name} (${feed.url}):`, e.message);
        return [];
    }
}

async function fetchNews() {
    console.log("Fetching live RSS feeds...");
    const results = await Promise.all(RSS_FEEDS.map(fetchRSS));
    const headlines = results.flat().slice(0, 40);

    if (headlines.length === 0) {
        console.error("No headlines fetched from RSS feeds.");
        process.exit(1);
    }

    console.log(`Got ${headlines.length} headlines.`);

    // Structured output based on headline analysis
    const output = {
        breaches: [],
        ransomware: [],
        vulns: [],
        insurance: []
    };

    // Simple categorization based on keywords
    headlines.forEach(h => {
        const title = h.title.toLowerCase();
        const entry = {
            title: h.title,
            tldr: h.description || "Breaking cybersecurity development requiring immediate attention and assessment.",
            action: "Verify system logs for indicators of compromise and apply relevant patches.",
            cve_ids: [],
            source_url: h.url,
            source: h.source
        };

        // Extract CVE IDs
        const cves = [];
        const textToSearch = `${h.title} ${h.description || ''}`;
        const cveRegex = /\bCVE-\d{4}-\d{4,7}\b/gi;
        let match;
        while ((match = cveRegex.exec(textToSearch)) !== null) {
            const cve = match[0].toUpperCase();
            if (!cves.includes(cve)) {
                cves.push(cve);
            }
        }
        entry.cve_ids = cves;

        // Categorize
        if (title.includes('breach') || title.includes('leak') || title.includes('data stolen')) {
            output.breaches.push(entry);
        } else if (title.includes('ransomware') || title.includes('extortion') || title.includes('encrypted')) {
            output.ransomware.push(entry);
        } else if (title.includes('cve-') || title.includes('vulnerability') || title.includes('zero-day') || title.includes('patch')) {
            output.vulns.push(entry);
        } else if (title.includes('insurance') || title.includes('cyber insurance') || title.includes('coverage') || title.includes('premium') || title.includes('claim')) {
            output.insurance.push(entry);
        }
    });

    // Ensure we have at least some content in each category
    ['breaches', 'ransomware', 'vulns', 'insurance'].forEach(cat => {
        if (output[cat].length === 0) {
            output[cat].push({
                title: "Awaiting Fresh Intelligence",
                tldr: "No automated categorization found for this cycle.",
                action: "Wait for next scheduled update or manually review RSS feeds.",
                cve_ids: [],
                source_url: "",
                source: "System"
            });
        }
        // Trim to 4 items per category
        output[cat] = output[cat].slice(0, 4);
    });

    // Read existing data to preserve history
    const rootPath = path.join(__dirname, '..', 'data.json');
    let existingData = { breaches: [], ransomware: [], vulns: [], insurance: [], history: {} };
    if (fs.existsSync(rootPath)) {
        try {
            existingData = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
        } catch (e) {
            console.error("Error reading existing data.json:", e.message);
        }
    }

    if (!existingData.history) {
        existingData.history = {};
    }

    // Accumulate today's news
    const today = new Date().toISOString().split('T')[0];
    const currentStories = [];
    ['breaches', 'ransomware', 'vulns', 'insurance'].forEach(cat => {
        output[cat].forEach(story => {
            if (story.title && story.title !== "Awaiting Fresh Intelligence") {
                currentStories.push({
                    ...story,
                    category: cat
                });
            }
        });
    });

    if (!existingData.history[today]) {
        existingData.history[today] = [];
    }

    currentStories.forEach(story => {
        const duplicate = existingData.history[today].find(hStory => 
            (story.source_url && hStory.source_url === story.source_url) || 
            (hStory.title === story.title)
        );
        if (!duplicate) {
            existingData.history[today].push(story);
        }
    });

    output.history = existingData.history;

    fs.writeFileSync(rootPath, JSON.stringify(output, null, 2));
    console.log("Successfully saved data to data.json");
}

fetchNews();
