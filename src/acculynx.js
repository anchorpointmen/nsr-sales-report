// acculynx.js — pulls sold jobs + revenue from AccuLynx, grouped by sales rep.
//
// API: REST v2, base https://api.acculynx.com/api/v2/
// Auth: Authorization: Bearer <ACCULYNX_API_KEY>  (key from my.acculynx.com/apikeys)
// Docs: https://apidocs.acculynx.com  (machine index at /llms.txt)
//
// Strategy: GET /jobs filtered by MilestoneDate within the window and limited to
// "sold" milestones. For each job we read its sales owner (to attribute to a rep)
// and its approved/financial value (to sum revenue). Paginated via pageStartIndex.

const BASE = "https://api.acculynx.com/api/v2";

function authHeaders() {
  const key = process.env.ACCULYNX_API_KEY;
  if (!key) throw new Error("ACCULYNX_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function get(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 429) {
    // Rate limited — back off once and retry.
    await new Promise((r) => setTimeout(r, 2000));
    return get(path, params);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AccuLynx ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Pull every sold job in [startDate, endDate], following pagination.
async function fetchSoldJobs({ startDate, endDate, milestones }) {
  const all = [];
  let pageStartIndex = 0;
  const pageSize = 25;
  for (let guard = 0; guard < 1000; guard++) {
    const page = await get("/jobs", {
      pageSize,
      pageStartIndex,
      filterByDate: "MilestoneDate",
      startDate,
      endDate,
      milestones: milestones.join(","),
      sortBy: "MilestoneDate",
      sortOrder: "Descending",
      includes: "contact",
    });
    const items = page.items ?? page.results ?? page.data ?? [];
    all.push(...items);
    const more = items.length === pageSize;
    if (!more) break;
    pageStartIndex += pageSize;
  }
  return all;
}

// Best-effort revenue extraction. AccuLynx job objects vary by account config;
// we try the common fields in priority order and fall back to a financials call.
async function jobRevenue(job) {
  const direct =
    job.approvedValue ??
    job.financials?.approvedValue ??
    job.contractValue ??
    job.totalValue;
  if (typeof direct === "number") return direct;

  if (job.id) {
    try {
      const fin = await get(`/jobs/${job.id}/financials`);
      const f = Array.isArray(fin) ? fin[0] : (fin.items?.[0] ?? fin);
      return f?.approvedValue ?? f?.worksheet?.totalPrice ?? 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

// Resolve the sales owner name for a job (used to attribute to a rep).
function jobSalesOwner(job) {
  return (
    job.salesOwner?.name ||
    job.salesOwner?.fullName ||
    [job.salesOwner?.firstName, job.salesOwner?.lastName].filter(Boolean).join(" ") ||
    job.salesRep ||
    "Unassigned"
  );
}

function matchRep(ownerName, reps) {
  if (!ownerName) return null;
  const lc = ownerName.toLowerCase();
  return reps.find((r) => lc.includes(r.acculynxName.toLowerCase())) ?? null;
}

// Returns { byRep: { repName: { jobs, revenue } }, totals: { jobs, revenue } }
export async function acculynxSales({ startDate, endDate, milestones, reps }) {
  const jobs = await fetchSoldJobs({ startDate, endDate, milestones });
  const byRep = Object.fromEntries(reps.map((r) => [r.name, { jobs: 0, revenue: 0 }]));
  let unassigned = { jobs: 0, revenue: 0 };

  for (const job of jobs) {
    const rep = matchRep(jobSalesOwner(job), reps);
    const rev = await jobRevenue(job);
    const bucket = rep ? byRep[rep.name] : unassigned;
    bucket.jobs += 1;
    bucket.revenue += rev || 0;
  }

  const totals = Object.values(byRep).reduce(
    (s, v) => ({ jobs: s.jobs + v.jobs, revenue: s.revenue + v.revenue }),
    { jobs: 0, revenue: 0 }
  );
  return { byRep, unassigned, totals };
}

// Sanity check that the key works and the server is up.
export async function acculynxPing() {
  await get("/ping");
  return true;
}
