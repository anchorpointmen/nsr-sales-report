// config.js — roster, goals, and date-window helpers.
// Edit the roster here when reps change. Names must match how each rep
// appears as the Sales Owner in AccuLynx (see scripts/probe-activeknocker.js
// and the AccuLynx /users endpoint to confirm exact spellings).

export const REPS = [
  { name: "Juan",    acculynxName: "Juan",    bhag: 2_000_000 },
  { name: "Aiden",   acculynxName: "Aiden",   bhag: 3_000_000 },
  { name: "Skylar",  acculynxName: "Skylar",  bhag: 1_000_000 },
  { name: "Branden", acculynxName: "Branden", bhag: 2_000_000 },
  { name: "Matt",    acculynxName: "Matt",    bhag: 3_000_000 },
  { name: "Andy",    acculynxName: "Andy",    bhag: 2_000_000 },
  { name: "Mitch",   acculynxName: "Mitch",   bhag: 1_000_000 },
  { name: "Blake",   acculynxName: "Blake",   bhag: 1_000_000 },
];

export const COMPANY_BHAG = REPS.reduce((s, r) => s + r.bhag, 0);

// Milestones that count as a "sold" job in AccuLynx. Adjust to match your
// workflow — these are the milestone names NSR uses for closed/sold work.
// Confirm against GET /milestones for your account.
export const SOLD_MILESTONES = ["Job", "Production", "Closed", "Completed"];

// ---- Date windows (all in America/Chicago, NSR's operating timezone) ----
const TZ = "America/Chicago";

function chicagoNow() {
  // Returns a Date shifted to Chicago wall-clock so week math is local.
  const s = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

function iso(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Sales week = Saturday → Friday, matching the sheet's "5/30-6/5" style.
// Returns the most recently completed week by default.
export function weekWindow(ref = chicagoNow()) {
  const d = new Date(ref);
  const day = d.getDay();              // 0=Sun .. 6=Sat
  const sinceSat = (day + 1) % 7;      // days back to this week's Saturday
  const thisSat = new Date(d); thisSat.setDate(d.getDate() - sinceSat);
  // Completed week is the previous Sat→Fri block.
  const start = new Date(thisSat); start.setDate(thisSat.getDate() - 7);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: iso(start), end: iso(end), label: `${start.getMonth()+1}/${start.getDate()}-${end.getMonth()+1}/${end.getDate()}` };
}

export function monthWindow(ref = chicagoNow()) {
  const d = new Date(ref);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return { start: iso(start), end: iso(d), label: start.toLocaleString("en-US", { month: "long", year: "numeric" }) };
}

export function yearWindow(ref = chicagoNow()) {
  const d = new Date(ref);
  const start = new Date(d.getFullYear(), 0, 1);
  return { start: iso(start), end: iso(d), label: `${d.getFullYear()} YTD` };
}

// Months elapsed in the year, for pace-to-BHAG (matches sheet's monthly pace).
export function monthsElapsed(ref = chicagoNow()) {
  const d = new Date(ref);
  return d.getMonth() + 1 + d.getDate() / 30;
}
