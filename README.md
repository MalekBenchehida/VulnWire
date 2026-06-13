# VulnWire Cyber Briefing Dashboard

An automated threat intelligence dashboard that pulls the latest Data Breaches, Ransomware Activity, and Vulnerabilities using the Gemini API and Google Search.

## Features
- **Automated Intelligence:** Pulls breaking news every 4 hours via GitHub Actions.
- **Surgical Actions:** Provides actionable advice for security teams for every incident.
- **CVE Integration:** Deep-links directly to the NVD database for identified vulnerabilities.
- **Copy to Clipboard:** One-click "Copy as TXT" for rapid internal briefing distribution.

## Setup Instructions

1. **Push to GitHub:** Initialize this folder as a git repo and push to your GitHub account.
2. **Configure API Key:**
   - Go to **Settings > Secrets and variables > Actions**.
   - Create a **New Repository Secret**.
   - Name: `GEMINI_API_KEY`
   - Value: [Your Gemini API Key]
3. **Enable GitHub Pages:**
   - Go to **Settings > Pages**.
   - Under **Source**, select "Deploy from a branch".
   - Select `main` and save.
4. **Trigger Initial Run:**
   - Go to the **Actions** tab.
   - Select "Update Cyber Intelligence".
   - Click **Run workflow** to pull the first batch of live data.

## Local Development
Requires Node.js 20+.
```bash
export GEMINI_API_KEY=your_key_here
node scripts/fetch_news.js
# Open index.html in your browser
```
