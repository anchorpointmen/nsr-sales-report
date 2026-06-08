// index.js — orchestrates the weekly report.
// Pulls AccuLynx sales (week/month/year) + Active Knocker activity (week),
// formats a Slack message, and posts it to the SLACK_WEBHOOK_URL.
// Run with DRY_RUN=true to print the payload instead of posting.

import { REPS, SOLD_MILESTONES, weekWindow, monthWindow, yearWindow } from "./config.js";
import { acculynxSales } from "./acculynx.js";
import { activeKnockerActivity } from "./activeknocker.js";
import { buildSlackMessage } from "./format.js";

async function postToSlack(payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_WEBHOOK_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack post failed ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function main() {
  // Cron lists both CST and CDT UTC times; only proceed when it's actually
  // 8 PM Central. Manual runs (workflow_dispatch) skip this guard.
  const isScheduled = process.env.GITHUB_EVENT_NAME === "schedule";
  if (isScheduled) {
    const hourCT = Number(
      new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false })
    );
    if (hourCT !== 20) {
      console.log(`Skipping: scheduled run fired at ${hourCT}:00 CT, not 20:00 (DST guard).`);
      return;
    }
  }

  const week = weekWindow();
  const month = monthWindow();
  const year = yearWindow();

  const common = { milestones: SOLD_MILESTONES, reps: REPS };

  const [weekSales, monthSales, yearSales, knock] = await Promise.all([
    acculynxSales({ startDate: week.start, endDate: week.end, ...common }),
    acculynxSales({ startDate: month.start, endDate: month.end, ...common }),
    acculynxSales({ startDate: year.start, endDate: year.end, ...common }),
    activeKnockerActivity({ startDate: week.start, endDate: week.end, reps: REPS }),
  ]);

  const payload = buildSlackMessage({
    week, month, year,
    sales: { week: weekSales, month: monthSales, year: yearSales },
    knock,
    reps: REPS,
  });

  if ((process.env.DRY_RUN || "").toLowerCase() === "true") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  await postToSlack(payload);
  console.log("Posted weekly report to Slack.");
}

main().catch((err) => {
  console.error("Report failed:", err.message);
  process.exit(1);
});
