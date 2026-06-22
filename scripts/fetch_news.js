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

    let output = null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
        console.log("GEMINI_API_KEY found. Preparing prompt for Gemini API...");

        const prompt = `You are a Senior Frontend Engineer and Cybersecurity UI/UX Expert acting as a threat intelligence AI.
Analyze the following RSS feed headlines and descriptions to identify the most critical and recent security developments.
Categorize the stories into the following categories:
1. breaches (Data Breaches / leaks / stolen info)
2. ransomware (Ransomware operations / extortion / encryption)
3. vulns (Software/hardware vulnerabilities / zero-days / patches)
4. insurance (Cyber insurance developments / premiums / coverage / claims)

Pick up to 4 stories for each category. For the "vulns" category, prioritize vulnerabilities that have CVE identifiers or represent critical vendor updates.

Below is the raw intelligence feed:
${headlines.map((h, i) => `---
Story ${i+1}:
Title: ${h.title}
Source: ${h.source}
URL: ${h.url}
Description: ${h.description}`).join('\n')}

For each story, populate the required fields in the response JSON:
- title: Headline/title of the story.
- tldr: Concise, 2-3 sentence technical summary of the threat details. Include specific details if available.
- action: Immediate, concrete action that security engineers should perform.
- cve_ids: Array of CVE IDs associated with this story (e.g. ["CVE-2026-1234"]). If none, return an empty array [].
- source_url: The original URL of the story.
- source: The publisher/source name (e.g., "The Hacker News").

For the "vulns" category specifically, you MUST also populate these operational metrics to make it strictly actionable for a Vulnerability Management team:
- active_exploitation: BOOLEAN (true if the vulnerability is reported as actively exploited in the wild, zero-day, or in CISA KEV; false otherwise)
- affected_versions: STRING (Exact product names and vulnerable version ranges, e.g., "Apache HTTP Server versions 2.4.0 through 2.4.58")
- how_to_determine_impact: STRING (Detailed steps to distinguish vulnerable vs. non-vulnerable assets, e.g., inspect running services, query specific software inventory, or check configuration files)
- tanium_query_hint: STRING (Specific query guidance for Tanium, such as Registry paths, file paths, process names, or Tanium Sensor names like 'Get Installed Applications' or 'Get File Version["path"]')
- rapid7_query_hint: STRING (Specific query guidance for Rapid7 InsightVM/InsightIDR, such as SQL queries, vulnerability ID search terms, InsightAgent queries, or asset search filter fields)
- remediation_priority: STRING (Choose from: "Emergency out-of-band", "High next patch cycle", "Medium standard patching", "Low informational")
- cvss_score: STRING (Provide the CVSS score, e.g., "9.8 Critical" or "8.2 High". Estimate if official score is not finalized, but state it clearly)`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        breaches: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    tldr: { type: "string" },
                                    action: { type: "string" },
                                    cve_ids: { type: "array", items: { type: "string" } },
                                    source_url: { type: "string" },
                                    source: { type: "string" }
                                },
                                required: ["title", "tldr", "action", "cve_ids", "source_url", "source"]
                            }
                        },
                        ransomware: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    tldr: { type: "string" },
                                    action: { type: "string" },
                                    cve_ids: { type: "array", items: { type: "string" } },
                                    source_url: { type: "string" },
                                    source: { type: "string" }
                                },
                                required: ["title", "tldr", "action", "cve_ids", "source_url", "source"]
                            }
                        },
                        vulns: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    tldr: { type: "string" },
                                    action: { type: "string" },
                                    cve_ids: { type: "array", items: { type: "string" } },
                                    source_url: { type: "string" },
                                    source: { type: "string" },
                                    active_exploitation: { type: "boolean" },
                                    affected_versions: { type: "string" },
                                    how_to_determine_impact: { type: "string" },
                                    tanium_query_hint: { type: "string" },
                                    rapid7_query_hint: { type: "string" },
                                    remediation_priority: { type: "string" },
                                    cvss_score: { type: "string" }
                                },
                                required: [
                                    "title", "tldr", "action", "cve_ids", "source_url", "source",
                                    "active_exploitation", "affected_versions", "how_to_determine_impact",
                                    "tanium_query_hint", "rapid7_query_hint", "remediation_priority", "cvss_score"
                                ]
                            }
                        },
                        insurance: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    tldr: { type: "string" },
                                    action: { type: "string" },
                                    cve_ids: { type: "array", items: { type: "string" } },
                                    source_url: { type: "string" },
                                    source: { type: "string" }
                                },
                                required: ["title", "tldr", "action", "cve_ids", "source_url", "source"]
                            }
                        }
                    },
                    required: ["breaches", "ransomware", "vulns", "insurance"]
                }
            }
        };

        const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

        for (const model of MODELS) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            try {
                console.log(`Attempting Gemini API call with model: ${model}...`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 404 || response.status === 429) {
                    console.warn(`Model ${model} not available or rate limited (${response.status}), trying next...`);
                    continue;
                }

                if (!response.ok) {
                    const body = await response.text();
                    console.error(`Model ${model} failed with error: ${response.status} - ${body}`);
                    continue;
                }

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    let jsonString = data.candidates[0].content.parts[0].text;
                    jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
                    output = JSON.parse(jsonString);
                    console.log(`Successfully obtained structured JSON from Gemini API using ${model}.`);
                    break;
                }
            } catch (e) {
                console.error(`Exception while calling ${model}:`, e.message);
            }
        }
    }

    // Fallback: Local rule-based extraction if API key is missing or API calls failed
    if (!output) {
        console.log("Running local rule-based intelligence analysis fallback...");
        output = {
            breaches: [],
            ransomware: [],
            vulns: [],
            insurance: []
        };

        headlines.forEach(h => {
            const title = h.title.toLowerCase();
            const textToSearch = `${h.title} ${h.description || ''}`;
            
            // Extract CVE IDs
            const cves = [];
            const cveRegex = /\bCVE-\d{4}-\d{4,7}\b/gi;
            let match;
            while ((match = cveRegex.exec(textToSearch)) !== null) {
                const cve = match[0].toUpperCase();
                if (!cves.includes(cve)) {
                    cves.push(cve);
                }
            }

            const entry = {
                title: h.title,
                tldr: h.description || "Breaking cybersecurity development requiring immediate attention and assessment.",
                action: "Verify system logs for indicators of compromise and apply relevant patches.",
                cve_ids: cves,
                source_url: h.url,
                source: h.source || "OSINT"
            };

            if (title.includes('breach') || title.includes('leak') || title.includes('data stolen') || title.includes('stolen') || title.includes('compromised')) {
                output.breaches.push(entry);
            } else if (title.includes('ransomware') || title.includes('extortion') || title.includes('encrypted') || title.includes('ransom')) {
                output.ransomware.push(entry);
            } else if (title.includes('cve-') || title.includes('vulnerability') || title.includes('zero-day') || title.includes('patch') || title.includes('exploit') || title.includes('bug')) {
                const activeExploit = title.includes('zero-day') || title.includes('active') || title.includes('wild') || title.includes('exploit in the wild') || title.includes('under attack');
                const priority = (activeExploit || title.includes('critical')) ? "Emergency out-of-band" : "High next patch cycle";
                const cvss = (title.includes('critical') || activeExploit) ? "9.8 Critical" : "7.8 High";
                
                output.vulns.push({
                    ...entry,
                    active_exploitation: activeExploit,
                    affected_versions: "Check vendor advisories for specific version ranges.",
                    how_to_determine_impact: "Scan external exposure. Audit version files or package lockfiles.",
                    tanium_query_hint: cves.length > 0 
                        ? `Get Installed Applications having Name contains "${cves[0]}"` 
                        : `Get Running Processes matching service name`,
                    rapid7_query_hint: cves.length > 0 
                        ? `vulnerability.cveIds CONTAINS '${cves[0]}'` 
                        : `asset.vulnerabilities.title CONTAINS 'vulnerability'`,
                    remediation_priority: priority,
                    cvss_score: cvss
                });
            } else if (title.includes('insurance') || title.includes('cyber insurance') || title.includes('coverage') || title.includes('premium') || title.includes('claim')) {
                output.insurance.push(entry);
            } else {
                // Default to vulnerabilities if uncategorized
                output.vulns.push({
                    ...entry,
                    active_exploitation: false,
                    affected_versions: "Check vendor documentation.",
                    how_to_determine_impact: "Analyze configurations and dependency logs.",
                    tanium_query_hint: "Get Installed Applications",
                    rapid7_query_hint: "asset.name CONTAINS ''",
                    remediation_priority: "Medium standard patching",
                    cvss_score: "7.0 High"
                });
            }
        });

        // Ensure exactly 4 items per category with consistent fallback objects
        ['breaches', 'ransomware', 'vulns', 'insurance'].forEach(cat => {
            if (output[cat].length === 0) {
                const emptyEntry = {
                    title: "Awaiting Fresh Intelligence",
                    tldr: "No automated categorization found for this cycle.",
                    action: "Wait for next scheduled update or manually review RSS feeds.",
                    cve_ids: [],
                    source_url: "",
                    source: "System"
                };
                if (cat === 'vulns') {
                    emptyEntry.active_exploitation = false;
                    emptyEntry.affected_versions = "N/A";
                    emptyEntry.how_to_determine_impact = "N/A";
                    emptyEntry.tanium_query_hint = "N/A";
                    emptyEntry.rapid7_query_hint = "N/A";
                    emptyEntry.remediation_priority = "Low informational";
                    emptyEntry.cvss_score = "0.0 None";
                }
                output[cat].push(emptyEntry);
            }
            output[cat] = output[cat].slice(0, 4);
        });
    }

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
