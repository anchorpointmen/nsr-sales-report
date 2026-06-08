// data.js — gathers the same KPI snapshot the report uses, for the bot to reason over.
// Reuses the report's AccuLynx + Active Knocker modules so there's one source of truth.

import { REPS, SOLD_MILESTONES, weekWindow, monthWindow, yearWindow, COMPANY_BHAG, monthsElapsed } from "../src/config.js";
import { acculynxSales } from "../src/acculynx.js";
import { activeKnockerActivity } from "../src/activeknocker.js";

// Pulls a full snapshot and returns a compact JSON object that's cheap to feed
// to Claude as context. Cached briefly so rapid-fire questions don't re-hit APIs.
let cache = { at: 0, data: null };
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getSnapshot({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < TTL_MS) return cache.data;

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

  const mElapsed = monthsElapsed();
  const snapshot = {
    asOf: new Date().toISOString(),
    periods: { week: week.label, month: month.label, year: year.label },
    companyBhag: COMPANY_BHAG,
    expectedYtdByPace: Math.round((COMPANY_BHAG / 12) * mElapsed),
    reps: REPS.map((r) => ({
      name: r.name,
      bhag: r.bhag,
      week: { ...weekSales.byRep[r.name], doors: knock.byRep[r.name].doors, appointments: knock.byRep[r.name].appointments },
      monthRevenue: monthSales.byRep[r.name].revenue,
      monthJobs: monthSales.byRep[r.name].jobs,
      ytdRevenue: yearSales.byRep[r.name].revenue,
      ytdJobs: yearSales.byRep[r.name].jobs,
    })),
    totals: {
      week: { ...weekSales.totals, doors: knock.totals.doors, appointments: knock.totals.appointments },
      month: monthSales.totals,
      year: yearSales.totals,
    },
    doorKnockReady: knock.ready,
  };

  cache = { at: Date.now(), data: snapshot };
  return snapshot;
}
