# NSR ELITE — Weekly Sales Report

Automated weekly KPI report for New Standard Restoration. Pulls **sales data from
AccuLynx** (weekly / month-to-date / year-to-date) and **door-knocking activity
from Active Knocker** (weekly), formats an NSR ELITE–styled scorecard, and posts
it to Slack. Runs on a GitHub Actions cron every Monday morning.

## What it reports

- **Door knocking (this week):** doors knocked + appointments set, per rep — from Active Knocker.
- **Sales (this week):** jobs sold + revenue closed, per rep — from AccuLynx.
- **Month-to-date & Year-to-date:** company jobs + revenue totals.
- **Pace to BHAG:** YTD revenue vs. expected pace toward the $15M company BHAG.

Roster, per-rep BHAGs, and the "sold" milestone names live in `src/config.js`.

## Setup

1. **Install:** `npm install` (no runtime deps — uses Node 20 built-in `fetch`).
2. **Local env:** `cp .env.example .env` and fill in values.
3. **Dry run:** `npm run report:dry` — prints the Slack payload without posting.
4. **Live run:** `npm run report`.

### GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | Where to get it |
| --- | --- |
| `ACCULYNX_API_KEY` | my.acculynx.com/apikeys (admin) |
| `ACTIVEKNOCKER_API_KEY` | Active Knocker → Configuration → Integration → API Key |
| `ACTIVEKNOCKER_BASE_URL` | from Active Knocker support |
| `ACTIVEKNOCKER_ACTIVITY_PATH` | from Active Knocker support |
| `ACTIVEKNOCKER_READY` | `true` once the two above are filled and verified |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for the target channel |

The cron is set for **13:00 UTC Mondays (8 AM Central)** in
`.github/workflows/weekly-report.yml`. You can also trigger it manually from the
Actions tab ("Run workflow").

## Active Knocker — finishing the integration

Active Knocker has an API and your key is enabled, but they don't publish endpoint
docs. Two facts are still needed:

1. **Base URL** + **endpoint path** that returns rep activity (doors / appts / sales) by date range.
2. **Response field names** for rep, doors, appointments, date.

Email **support@activeknocker.com** and ask for those. Then:

```bash
ACTIVEKNOCKER_API_KEY=xxxx ACTIVEKNOCKER_BASE_URL=https://... \
  node scripts/probe-activeknocker.js "/the/path/they/gave/you"
```

Use the printed JSON to set the `CONFIG.fields` mapping in `src/activeknocker.js`,
set `ACTIVEKNOCKER_READY=true`, and the door-knock section goes live. Until then
the report runs fine and shows door knocking as "config pending."

## AccuLynx notes

- REST v2, base `https://api.acculynx.com/api/v2`, Bearer auth.
- Sales are pulled from `GET /jobs` filtered by `MilestoneDate` within each window
  and limited to the milestones in `SOLD_MILESTONES`. Revenue is read from the job's
  approved/financial value, falling back to `GET /jobs/{id}/financials`.
- Confirm your milestone names against `GET /milestones` and rep name spellings
  against `GET /users`, then adjust `src/config.js` if needed.

## Project layout

```
src/
  config.js        roster, BHAGs, date-window helpers
  acculynx.js      AccuLynx jobs + revenue by rep/period
  activeknocker.js Active Knocker activity adapter (config block to finish)
  format.js        Slack Block Kit builder
  index.js         orchestrator + Slack post
scripts/
  probe-activeknocker.js  endpoint/shape discovery helper
bot/
  app.js           Slack DM bot (Socket Mode, Claude-backed) — deploy on Railway
  data.js          live KPI snapshot for the bot (reuses src/ modules)
  slack-app-manifest.json  paste into Slack to create the app
  README.md        bot setup + Railway deploy guide
.github/workflows/weekly-report.yml  Friday 8PM CT cron
railway.json       Railway deploy config for the bot
```

## Two pieces, two homes

- **The weekly report** (`src/index.js`) runs on **GitHub Actions**, Friday 8 PM CT,
  and posts the scorecard to Slack.
- **The talk-back bot** (`bot/app.js`) runs on **Railway** (always-on) and answers
  DMs about the numbers. See `bot/README.md` for setup.

Both share the `src/` data modules, so config fixes apply to both.
