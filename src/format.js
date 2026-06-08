// format.js — builds the Slack message (Block Kit) for the weekly KPI report.
import { COMPANY_BHAG, monthsElapsed } from "./config.js";

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n) => (n * 100).toFixed(0) + "%";

export function buildSlackMessage({ week, month, year, sales, knock, reps }) {
  const blocks = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "🏆 NSR ELITE — Weekly Sales Report", emoji: true },
  });
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `*Week:* ${week.label}  ·  *Month:* ${month.label}  ·  *${year.label}*  ·  Discipline Over Motivation` },
    ],
  });
  blocks.push({ type: "divider" });

  // --- Door knocking (Active Knocker) ---
  if (knock.ready) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*🚪 Door Knocking — This Week*\nTotal doors: *${knock.totals.doors}*  ·  Appts set: *${knock.totals.appointments}*` } });
    const lines = reps
      .map((r) => ({ r, k: knock.byRep[r.name] }))
      .filter(({ k }) => k.doors || k.appointments)
      .sort((a, b) => b.k.doors - a.k.doors)
      .map(({ r, k }) => `• *${r.name}* — ${k.doors} doors, ${k.appointments} appts`);
    if (lines.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🚪 Door Knocking* — _Active Knocker API config pending. Add base URL + endpoint to enable._" } });
  }
  blocks.push({ type: "divider" });

  // --- Weekly sales (AccuLynx) ---
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*💰 Sales — This Week (${week.label})*\nJobs sold: *${sales.week.totals.jobs}*  ·  Revenue: *${usd(sales.week.totals.revenue)}*` } });
  const weekLines = reps
    .map((r) => ({ r, s: sales.week.byRep[r.name] }))
    .filter(({ s }) => s.jobs || s.revenue)
    .sort((a, b) => b.s.revenue - a.s.revenue)
    .map(({ r, s }) => `• *${r.name}* — ${s.jobs} jobs, ${usd(s.revenue)}`);
  if (weekLines.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: weekLines.join("\n") } });
  blocks.push({ type: "divider" });

  // --- Month & Year totals ---
  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*📅 Month-to-Date*\n${sales.month.totals.jobs} jobs\n${usd(sales.month.totals.revenue)}` },
      { type: "mrkdwn", text: `*📈 Year-to-Date*\n${sales.year.totals.jobs} jobs\n${usd(sales.year.totals.revenue)}` },
    ],
  });

  // --- Pace to BHAG ---
  const mElapsed = monthsElapsed();
  const ytdRev = sales.year.totals.revenue;
  const expected = (COMPANY_BHAG / 12) * mElapsed;
  const onPace = ytdRev >= expected;
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*🎯 Pace to Company BHAG (${usd(COMPANY_BHAG)})*\nYTD ${usd(ytdRev)} vs. expected ${usd(expected)} → ${onPace ? "✅ *ON PACE*" : "⚠️ *BEHIND PACE*"} (${pct(ytdRev / COMPANY_BHAG)} of goal)` },
  });

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "New Standard Restoration · 4675 Bluestem Road Suite 1, Roscoe, IL 61073" }],
  });

  return { blocks, text: `NSR ELITE Weekly Report — Week ${week.label}: ${sales.week.totals.jobs} jobs, ${usd(sales.week.totals.revenue)}` };
}
