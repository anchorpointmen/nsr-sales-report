# NSR Sales Bot — setup & deploy

A standalone Slack bot you DM to ask about NSR sales KPIs. It pulls the same live
AccuLynx + Active Knocker data the weekly report uses and answers with Claude.
Runs as an always-on process (Socket Mode) on Railway. Lives in the same repo as
the report but runs separately — the report stays on GitHub Actions, this stays
on Railway.

## How it works

- **Socket Mode** — Slack opens a connection to the bot, so no public URL or
  webhook endpoint is needed. The bot runs as one long-lived Node process.
- You **DM the bot**; it pulls a fresh KPI snapshot (cached 5 min) and sends your
  question + the data to Claude (`claude-sonnet-4-6`), then replies in the DM.
- It keeps a short rolling memory per DM so follow-ups like "compare that to last
  month" work. Type `reset` to clear it.

## Step 1 — Create the Slack app (only you can do this)

1. Go to https://api.slack.com/apps → **Create New App** → **From a manifest**.
2. Pick your workspace, then paste the contents of `bot/slack-app-manifest.json`.
3. Review and **Create**.
4. **Basic Information → App-Level Tokens → Generate Token and Scopes:**
   add scope `connections:write`, name it (e.g. "socket"), generate.
   Copy the `xapp-...` token → this is `SLACK_APP_TOKEN`.
5. **OAuth & Permissions → Install to Workspace** → authorize.
   Copy the **Bot User OAuth Token** (`xoxb-...`) → this is `SLACK_BOT_TOKEN`.

Then in Slack, open a DM with "NSR Sales Bot" and say hi (after deploy below).

## Step 2 — Deploy on Railway

1. https://railway.app → **New Project → Deploy from GitHub repo** → pick
   `anchorpointmen/nsr-sales-report`.
2. Railway reads `railway.json` and runs `node bot/app.js`.
3. **Variables** tab — add:

   | Variable | Value |
   | --- | --- |
   | `SLACK_BOT_TOKEN` | `xoxb-...` from step 1 |
   | `SLACK_APP_TOKEN` | `xapp-...` from step 1 |
   | `ANTHROPIC_API_KEY` | from console.anthropic.com |
   | `ACCULYNX_API_KEY` | same key the report uses |
   | `ACTIVEKNOCKER_API_KEY` | same key the report uses |
   | `ACTIVEKNOCKER_BASE_URL` | once probe confirms it |
   | `ACTIVEKNOCKER_ACTIVITY_PATH` | once probe confirms it |
   | `ACTIVEKNOCKER_READY` | `false` until door data is wired |

4. Deploy. Logs should show `⚡ NSR sales bot running (Socket Mode).`

## Step 3 — Try it

DM the bot:
- "How did we do this week?"
- "Which rep is furthest behind pace?"
- "What's our YTD revenue vs the BHAG?"
- "Who knocked the most doors?" (works once Active Knocker is live)

## Notes

- The bot answers from the snapshot only — it won't invent numbers. If door data
  isn't wired yet, it'll say so.
- Cost is minimal: a few cents per conversation on Sonnet, plus Railway's ~$5/mo.
- The report and the bot share `src/` (config, acculynx, activeknocker), so fixing
  rep names or milestones in `src/config.js` updates both.
- This is deliberately standalone. If you later fold it into Tank, the data layer
  (`src/` + `bot/data.js`) carries over as-is.
