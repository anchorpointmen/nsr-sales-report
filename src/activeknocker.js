// activeknocker.js — pulls door-knock activity per rep from Active Knocker.
//
// STATUS: Active Knocker has an "Open API" but does NOT publish endpoint docs
// publicly. Your API key is enabled (Configuration → Integration → API Key).
// Two facts are still needed from Active Knocker support
// (support@activeknocker.com) to finish this module:
//
//   1) The BASE URL and the exact ENDPOINT PATH that returns rep activity
//      (doors knocked / appointments set / sales) for a date range.
//   2) The RESPONSE SHAPE — i.e. which JSON fields hold rep name, doors,
//      appointments, and the date.
//
// Fill in the CONFIG block below once you have them, then run:
//   npm run probe:knocker
// to confirm the shape, and this module will work with no other changes.
// Until then, set the env var ACTIVEKNOCKER_READY=false (default) and the
// report will show door-knock metrics as "pending API config" instead of failing.

// ============================ CONFIG (EDIT ME) ============================
const CONFIG = {
  // e.g. "https://api.activeknocker.com" or "https://web.activeknocker.com/api"
  baseUrl: process.env.ACTIVEKNOCKER_BASE_URL || "",

  // The path that returns activity stats. Use {start} and {end} placeholders
  // for the date range if the endpoint takes query/date params. Example guesses
  // (CONFIRM with support — do not assume):
  //   "/api/v1/reports/activity?start={start}&end={end}"
  //   "/reports/knocks?from={start}&to={end}"
  activityPath: process.env.ACTIVEKNOCKER_ACTIVITY_PATH || "",

  // How the key is sent. Most likely a Bearer header; some APIs use x-api-key.
  authStyle: process.env.ACTIVEKNOCKER_AUTH_STYLE || "bearer", // "bearer" | "x-api-key" | "query"

  // Map Active Knocker's response field names → our canonical fields.
  // After probing, set these to the real keys in their JSON.
  fields: {
    repName: "userName",     // field holding the rep's name
    doors: "doorsKnocked",   // field holding doors knocked count
    appointments: "appointmentsSet",
    sales: "sales",
    date: "date",
  },
};
// ==========================================================================

const READY =
  (process.env.ACTIVEKNOCKER_READY || "false").toLowerCase() === "true" &&
  CONFIG.baseUrl &&
  CONFIG.activityPath;

function authHeaders() {
  const key = process.env.ACTIVEKNOCKER_API_KEY;
  if (!key) throw new Error("ACTIVEKNOCKER_API_KEY is not set");
  if (CONFIG.authStyle === "bearer") return { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (CONFIG.authStyle === "x-api-key") return { "x-api-key": key, Accept: "application/json" };
  return { Accept: "application/json" }; // "query" style appends key to URL below
}

function buildUrl({ start, end }) {
  let path = CONFIG.activityPath.replace("{start}", start).replace("{end}", end);
  const url = new URL(CONFIG.baseUrl.replace(/\/$/, "") + path);
  if (CONFIG.authStyle === "query") url.searchParams.set("apiKey", process.env.ACTIVEKNOCKER_API_KEY);
  return url;
}

// Returns { ready, byRep: { repName: { doors, appointments, sales } }, totals }
export async function activeKnockerActivity({ startDate, endDate, reps }) {
  const empty = Object.fromEntries(reps.map((r) => [r.name, { doors: 0, appointments: 0, sales: 0 }]));

  if (!READY) {
    return { ready: false, byRep: empty, totals: { doors: 0, appointments: 0, sales: 0 } };
  }

  const res = await fetch(buildUrl({ start: startDate, end: endDate }), { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Active Knocker ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json.data ?? json.results ?? json.items ?? []);

  const byRep = { ...empty };
  const f = CONFIG.fields;
  for (const row of rows) {
    const name = String(row[f.repName] ?? "");
    const rep = reps.find((r) => name.toLowerCase().includes(r.name.toLowerCase()));
    if (!rep) continue;
    byRep[rep.name].doors += Number(row[f.doors] ?? 0);
    byRep[rep.name].appointments += Number(row[f.appointments] ?? 0);
    byRep[rep.name].sales += Number(row[f.sales] ?? 0);
  }

  const totals = Object.values(byRep).reduce(
    (s, v) => ({ doors: s.doors + v.doors, appointments: s.appointments + v.appointments, sales: s.sales + v.sales }),
    { doors: 0, appointments: 0, sales: 0 }
  );
  return { ready: true, byRep, totals };
}

export { CONFIG as ACTIVEKNOCKER_CONFIG };
