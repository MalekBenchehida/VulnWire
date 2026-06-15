# VulnWire Cyber Briefing Dashboard

An automated threat intelligence dashboard that pulls the latest Data Breaches, Ransomware Activity, and Vulnerabilities via RSS feeds.

## Features
- **Automated Intelligence:** Pulls breaking news every 4 hours via GitHub Actions.
- **Surgical Actions:** Provides actionable advice for security teams for every incident.
- **CVE Integration:** Deep-links directly to the NVD database for identified vulnerabilities.
- **Copy to Clipboard:** One-click "Copy as TXT" for rapid internal briefing distribution.
- **MS Teams Bot:** Real-time threat notifications sent directly to your Teams channel.

## Setup Instructions

### GitHub Pages Dashboard

1. **Push to GitHub:** Initialize this folder as a git repo and push to your GitHub account.
2. **Enable GitHub Pages:**
   - Go to **Settings > Pages**.
   - Under **Source**, select "Deploy from a branch".
   - Select `main` and save.
3. **Trigger Initial Run:**
   - Go to the **Actions** tab.
   - Select "Update Cyber Intelligence".
   - Click **Run workflow** to pull the first batch of live data.

### Microsoft Teams Bot (Incoming Webhook)

1. **Create Webhook in Teams:**
   - Go to your Teams channel
   - Click **•••** (More Options) > **Connectors**
   - Find **Incoming Webhook** and click **Configure**
   - Name it "VulnWire Bot" and click **Create**
   - Copy the webhook URL

2. **Add Webhook to GitHub Secrets:**
   - Go to **Settings > Secrets and variables > Actions**
   - Create a **New Repository Secret**
   - Name: `TEAMS_WEBHOOK_URL`
   - Value: [Your webhook URL]

3. **Update Workflow (Optional):**
   Add this step after the fetch step in `.github/workflows/update_news.yml`:
   ```yaml
   - name: Send to Teams
     if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
     run: |
       node scripts/teams_bot.js
     env:
       TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
   ```

## Local Development
Requires Node.js 20+.
```bash
node scripts/fetch_news.js
# Open index.html in your browser
```
