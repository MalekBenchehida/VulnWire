const fs = require('fs');
const path = require('path');

const teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL;

if (!teamsWebhookUrl) {
    console.log("TEAMS_WEBHOOK_URL not set, skipping Teams notification.");
    process.exit(0);
}

console.log("Reading data.json for latest threats...");
const dataPath = path.join(__dirname, '..', 'data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Build Teams message card
const activities = [];

['breaches', 'ransomware', 'vulns'].forEach(cat => {
    const titleMap = {
        breaches: '⚠️ DATA BREACHES',
        ransomware: '🚨 RANSOMWARE',
        vulns: '🐞 VULNERABILITIES'
    };
    
    data[cat].slice(0, 2).forEach(story => {
        activities.push({
            type: 'MessageCard',
            '@context': 'https://schema.org/extensions',
            '@type': 'MessageCard',
            title: titleMap[cat],
            text: `**${story.title}**\n\n${story.tldr}\n\n**Action:** ${story.action}`,
            potentialAction: story.source_url ? [{
                '@type': 'OpenUri',
                name: 'Read More',
                targets: [{ os: 'default', uri: story.source_url }]
            }] : []
        });
    });
});

async function sendToTeams() {
    try {
        const response = await fetch(teamsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activities })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Teams API returned ${response.status}: ${text}`);
        }

        console.log("Successfully sent alerts to Teams.");
    } catch (e) {
        console.error("Error sending to Teams:", e.message);
        process.exit(1);
    }
}

sendToTeams();
