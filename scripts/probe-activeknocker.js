// probe-activeknocker.js — run locally to discover Active Knocker's API.
// Usage:
//   ACTIVEKNOCKER_API_KEY=xxxx \
//   ACTIVEKNOCKER_BASE_URL=https://... \
//   node scripts/probe-activeknocker.js "/some/candidate/path"
//
// Pass one or more candidate paths as args, or rely on the built-in guesses.
// It prints status codes and a snippet of each response so you can identify
// the right endpoint and field names, then fill those into src/activeknocker.js.

const key = process.env.ACTIVEKNOCKER_API_KEY;
const base = (process.env.ACTIVEKNOCKER_BASE_URL || "").replace(/\/$/, "");

if (!key) { console.error("Set ACTIVEKNOCKER_API_KEY"); process.exit(1); }
if (!base) { console.error("Set ACTIVEKNOCKER_BASE_URL (ask Active Knocker support)"); process.exit(1); }

const candidates = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/api/v1/reports",
      "/api/v1/activity",
      "/api/v1/users",
      "/api/v1/stats",
      "/reports/activity",
      "/activity",
    ];

const headerStyles = [
  { name: "bearer", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
  { name: "x-api-key", headers: { "x-api-key": key, Accept: "application/json" } },
];

for (const path of candidates) {
  for (const style of headerStyles) {
    try {
      const res = await fetch(base + path, { headers: style.headers });
      const text = await res.text();
      console.log(`\n[${res.status}] ${style.name}  ${base + path}`);
      console.log(text.slice(0, 400));
    } catch (e) {
      console.log(`\n[ERR] ${style.name}  ${base + path}  ${e.message}`);
    }
  }
}
