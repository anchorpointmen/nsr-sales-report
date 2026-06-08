// acculynx-tools.js — the live-query toolbox Steven uses to answer sales questions.
const BASE = "https://api.acculynx.com/api/v2";

function authHeaders() {
  const key = process.env.ACCULYNX_API_KEY;
  if (!key) throw new Error("ACCULYNX_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

let _lastCall = 0;
async function rateGate(minGapMs = 120) {
  const wait = Math.max(0, _lastCall + minGapMs - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  _lastCall = Date.now();
}

async function get(path, params = {}) {
  await rateGate();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); return get(path, params); }
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`AccuLynx ${res.status} on ${path}: ${body.slice(0, 200)}`); }
  return res.json();
}

const MAX_PAGES = 40;

async function fetchJobs({ milestones, dateFilterType, startDate, endDate, sortBy = "MilestoneDate" }) {
  const all = [];
  let pageStartIndex = 0;
  const pageSize = 25;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await get("/jobs", {
      pageSize, pageStartIndex,
      milestones: milestones?.length ? milestones.join(",") : undefined,
      dateFilterType: startDate || endDate ? dateFilterType : undefined,
      startDate, endDate, sortBy, sortOrder: "Descending", includes: "contact",
    });
    const items = data.items ?? data.results ?? data.data ?? [];
    all.push(...items);
    if (items.length < pageSize) break;
    pageStartIndex += pageSize;
  }
  return all;
}

function salesOwner(job) {
  return job.salesOwner?.name || job.salesOwner?.fullName ||
    [job.salesOwner?.firstName, job.salesOwner?.lastName].filter(Boolean).join(" ") ||
    job.salesRep || "Unassigned";
}

async function jobRevenue(job) {
  const direct = job.approvedValue ?? job.contractValue ?? job.totalValue;
  if (typeof direct === "number") return direct;
  try { const fin = await get(`/jobs/${job.id}/financials`); const f = Array.isArray(fin) ? fin[0] : (fin.items?.[0] ?? fin); return f?.approvedValue ?? f?.worksheet?.totalPrice ?? 0; } catch { return 0; }
}

async function approvedDate(jobId) {
  try { const hist = await get(`/jobs/${jobId}/milestone-history`); const items = hist.items ?? hist.results ?? hist.data ?? []; const a = items.find((m) => (m.name ?? "").toLowerCase() === "approved"); return a?.date ? a.date.slice(0, 10) : null; } catch { return null; }
}

export async function jobsByMilestone({ milestones, startDate, endDate, dateFilterType = "MilestoneDate" }) {
  const jobs = await fetchJobs({ milestones, startDate, endDate, dateFilterType });
  const byRep = {};
  for (const j of jobs) { const owner = salesOwner(j); byRep[owner] = (byRep[owner] || 0) + 1; }
  return { count: jobs.length, byRep, milestone: milestones, dateRange: { startDate, endDate } };
}

export async function salesByApprovedDate({ startDate, endDate }) {
  const jobs = await fetchJobs({ milestones: ["approved", "completed", "invoiced", "closed"] });
  const byRep = {};
  let totalRevenue = 0, totalJobs = 0;
  for (const j of jobs) {
    const date = await approvedDate(j.id);
    if (!date) continue;
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;
    const rev = await jobRevenue(j);
    const owner = salesOwner(j);
    byRep[owner] = byRep[owner] || { jobs: 0, revenue: 0 };
    byRep[owner].jobs += 1; byRep[owner].revenue += rev || 0;
    totalRevenue += rev || 0; totalJobs += 1;
  }
  return { totalJobs, totalRevenue, byRep, dateRange: { startDate, endDate } };
}

export async function pipelineSnapshot() {
  const milestones = ["lead", "prospect", "approved", "completed", "invoiced", "closed"];
  const out = {};
  for (const m of milestones) { const jobs = await fetchJobs({ milestones: [m] }); out[m] = jobs.length; }
  return out;
}

export async function listMilestones() {
  const data = await get("/company-settings/job-file-settings/workflow-milestones", { includes: "status" });
  const items = data.items ?? data.results ?? data.data ?? [];
  return items.map((m) => ({ name: m.name ?? "(unnamed)", statuses: (m.statuses ?? m.status ?? []).map((s) => s.name ?? "(unnamed)") }));
}

export const TOOL_DEFS = [
  { name: "sales_by_approved_date", description: "Get total sales (count + revenue) within a date range, where a sale is dated by when the job entered the Approved milestone. Grouped by sales rep. Use for any 'sales' question — weekly, monthly, annual, per-rep.", input_schema: { type: "object", properties: { startDate: { type: "string", description: "Start date YYYY-MM-DD inclusive" }, endDate: { type: "string", description: "End date YYYY-MM-DD inclusive" } }, required: ["startDate", "endDate"] } },
  { name: "jobs_by_milestone", description: "Count jobs currently in one or more milestones, optionally filtered by date range. Use for 'how many leads', 'prospects', 'jobs in production'. Valid: lead, prospect, approved, completed, invoiced, closed, cancelled, dead.", input_schema: { type: "object", properties: { milestones: { type: "array", items: { type: "string" }, description: "Milestone names, lowercase" }, startDate: { type: "string" }, endDate: { type: "string" }, dateFilterType: { type: "string", enum: ["CreatedDate", "MilestoneDate", "ModifiedDate"] } }, required: ["milestones"] } },
  { name: "pipeline_snapshot", description: "Count of jobs currently in each milestone. Use for 'where are my leads in the workflow' or 'pipeline overview'.", input_schema: { type: "object", properties: {} } },
  { name: "list_milestones", description: "List workflow milestones and sub-statuses.", input_schema: { type: "object", properties: {} } },
];

export async function runTool(name, input) {
  switch (name) {
    case "sales_by_approved_date": return salesByApprovedDate(input);
    case "jobs_by_milestone": return jobsByMilestone(input);
    case "pipeline_snapshot": return pipelineSnapshot();
    case "list_milestones": return listMilestones();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
