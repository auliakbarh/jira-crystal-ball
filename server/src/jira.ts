// Minimal JIRA Cloud REST client. Uses Basic auth (email:apiToken).
// Fetches issues from an Agile board, optionally filtered by JQL.
import { env } from "./env.js";

export interface JiraTicket {
  key: string;
  status: string | null;
  assignee: string | null;
  assigneeAccountId: string | null;
  summary: string | null;
  url: string;
  priority: string | null;
  issueType: string | null;
  epicKey: string | null;
  epicName: string | null;
  parentKey: string | null;
  parentName: string | null;
  parentType: string | null;
  storyPoints: number | null;
  storyPointsFE: number | null;
  storyPointsBE: number | null;
  storyPointsQA: number | null;
  carryOver: boolean; // issue was in at least one earlier (closed) sprint
  carryOverCount: number; // how many completed sprints it has rolled through
  carryOverSprints: string[]; // names of those completed sprints
}

interface SpFields {
  default?: string | null;
  fe?: string | null;
  be?: string | null;
  qa?: string | null;
}

interface JiraConfigLike {
  baseUrl: string;
  email: string;
  apiToken: string;
  boardId: string;
  jql?: string | null;
  spFields?: SpFields;
}

function authHeader(cfg: JiraConfigLike): string {
  const token = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function jiraHeaders(cfg: JiraConfigLike) {
  return {
    Authorization: authHeader(cfg),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// --- Story-point field resolution (accepts a custom field id OR a name) --
const fieldMapCache = new Map<string, Map<string, string>>(); // base → (name.toLowerCase() → id)

async function fieldNameToId(cfg: JiraConfigLike): Promise<Map<string, string>> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const cached = fieldMapCache.get(base);
  if (cached) return cached;
  const m = new Map<string, string>();
  try {
    const res = await fetch(`${base}/rest/api/3/field`, { headers: jiraHeaders(cfg) });
    if (res.ok) {
      const arr: any[] = await res.json();
      // First occurrence wins so duplicate names resolve deterministically.
      for (const f of arr) {
        const key = String(f?.name ?? "").toLowerCase();
        if (f?.name && f?.id && !m.has(key)) m.set(key, String(f.id));
      }
    }
  } catch {
    /* leave empty → names won't resolve, ids still work */
  }
  fieldMapCache.set(base, m);
  return m;
}

// Resolve a config value (custom field id like "customfield_10033" OR a field
// name like "Story Points QA") to its custom field id, or null.
async function resolveSpId(cfg: JiraConfigLike, value?: string | null): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^customfield_\d+$/i.test(v)) return v;
  const map = await fieldNameToId(cfg);
  return map.get(v.toLowerCase()) ?? null;
}

const numOrNull = (x: unknown): number | null => (typeof x === "number" ? x : null);

// --- Simple in-memory response cache (short TTL) -------------------------
// Cuts repeated JIRA calls on the dashboard/board and reduces rate-limit risk.
// Pass { force: true } to bypass (e.g. the Board "Refresh" button).
const JIRA_CACHE_TTL_MS = 60_000;
const jiraCache = new Map<string, { at: number; data: unknown }>();

function cacheKey(kind: string, cfg: JiraConfigLike): string {
  const sp = cfg.spFields ? `${cfg.spFields.default}|${cfg.spFields.fe}|${cfg.spFields.be}|${cfg.spFields.qa}` : "";
  return `${kind}:${normalizeBaseUrl(cfg.baseUrl)}:${cfg.boardId}:${cfg.jql ?? ""}:${sp}`;
}

async function cached<T>(kind: string, cfg: JiraConfigLike, force: boolean, run: () => Promise<T>): Promise<T> {
  const key = cacheKey(kind, cfg);
  if (!force) {
    const hit = jiraCache.get(key);
    if (hit && Date.now() - hit.at < JIRA_CACHE_TTL_MS) return hit.data as T;
  }
  const data = await run();
  jiraCache.set(key, { at: Date.now(), data });
  return data;
}

export interface JiraFetchOpts {
  force?: boolean;
}

/**
 * Resolve the numeric agile board id. The Board ID field accepts either the
 * numeric id (used directly) or a project key like "ATH" (looked up to the
 * project's first board), so users don't have to dig the number out of the URL.
 */
async function resolveBoardId(cfg: JiraConfigLike, base: string): Promise<string> {
  const raw = (cfg.boardId ?? "").trim();
  if (/^\d+$/.test(raw)) return raw;
  if (!raw) throw new Error("Board ID is empty");

  const res = await fetch(
    `${base}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(raw)}&maxResults=50`,
    { headers: jiraHeaders(cfg) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Board lookup for "${raw}" failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const boards: any[] = data.values ?? [];
  if (boards.length === 0) {
    throw new Error(`No board found for project "${raw}". Use the numeric board id from the board URL.`);
  }
  return String(boards[0].id);
}

interface SpIds {
  default: string | null;
  fe: string | null;
  be: string | null;
  qa: string | null;
}

function mapIssue(base: string, issue: any, spIds?: SpIds): JiraTicket {
  const f = issue.fields ?? {};
  const spRead = (id: string | null) => (id ? numOrNull(f[id]) : null);
  const parent = f.parent;
  const parentType = parent?.fields?.issuetype?.name ?? null;
  // Epic: the agile API exposes `fields.epic` on company-managed boards; on
  // team-managed projects the epic is simply the issue's parent (type Epic).
  const epic = f.epic ?? issue.epic ?? null;
  const parentIsEpic = parentType === "Epic";
  return {
    key: issue.key,
    status: f.status?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    assigneeAccountId: f.assignee?.accountId ?? null,
    summary: f.summary ?? null,
    url: `${base}/browse/${issue.key}`,
    priority: f.priority?.name ?? null,
    issueType: f.issuetype?.name ?? null,
    epicKey: epic?.key ?? (parentIsEpic ? parent.key : null),
    epicName: epic?.name ?? epic?.summary ?? (parentIsEpic ? parent?.fields?.summary ?? null : null),
    parentKey: parent?.key ?? null,
    parentName: parent?.fields?.summary ?? null,
    parentType,
    storyPoints: spRead(spIds?.default ?? null),
    storyPointsFE: spRead(spIds?.fe ?? null),
    storyPointsBE: spRead(spIds?.be ?? null),
    storyPointsQA: spRead(spIds?.qa ?? null),
    carryOver: Array.isArray(f.closedSprints) && f.closedSprints.length > 0,
    carryOverCount: Array.isArray(f.closedSprints) ? f.closedSprints.length : 0,
    carryOverSprints: Array.isArray(f.closedSprints)
      ? f.closedSprints.map((s: any) => s?.name).filter(Boolean)
      : [],
  };
}

/**
 * Fetch issues for a board. When a JQL override is present the standard
 * search endpoint is used; otherwise the agile board issues endpoint.
 */
export function fetchBoardIssues(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<JiraTicket[]> {
  return cached("board", cfg, !!opts.force, () => _fetchBoardIssues(cfg));
}

async function resolveSpIds(cfg: JiraConfigLike): Promise<SpIds> {
  const s = cfg.spFields ?? {};
  const [def, fe, be, qa] = await Promise.all([
    resolveSpId(cfg, s.default),
    resolveSpId(cfg, s.fe),
    resolveSpId(cfg, s.be),
    resolveSpId(cfg, s.qa),
  ]);
  return { default: def, fe, be, qa };
}

function spFieldsParam(ids: SpIds): string {
  return [ids.default, ids.fe, ids.be, ids.qa].filter(Boolean).join(",");
}

async function _fetchBoardIssues(cfg: JiraConfigLike): Promise<JiraTicket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const spIds = await resolveSpIds(cfg);

  const fields = `summary,status,assignee,issuetype,parent,epic,priority,closedSprints${spFieldsParam(spIds) ? "," + spFieldsParam(spIds) : ""}`;
  const useJql = !!(cfg.jql && cfg.jql.trim());
  const boardId = useJql ? null : await resolveBoardId(cfg, base);

  // Paginate: JQL (`/search`) and board (`/board/{id}/issue`) both return
  // { issues, total, startAt } — loop until we've seen `total` (or a short page).
  const all: JiraTicket[] = [];
  const seen = new Set<string>();
  let startAt = 0;
  // Guard against runaway loops; 50 pages * 100 = 5000 issues max.
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100", fields });
    if (useJql) params.set("jql", cfg.jql!.trim());
    const url = useJql
      ? `${base}/rest/api/3/search?${params.toString()}`
      : `${base}/rest/agile/1.0/board/${boardId}/issue?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`JIRA request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const issues: any[] = data.issues ?? [];
    for (const issue of issues) {
      if (issue.key && seen.has(issue.key)) continue;
      if (issue.key) seen.add(issue.key);
      all.push(mapIssue(base, issue, spIds));
    }
    startAt += issues.length;
    const total = typeof data.total === "number" ? data.total : startAt;
    if (issues.length === 0 || startAt >= total) break;
  }
  return all;
}

/**
 * Fetch issues belonging to the board's ACTIVE sprint(s) only.
 * Resolves active sprint ids from the agile API, then pulls their issues —
 * board-scoped, so it won't leak other projects' sprints the way a bare
 * `sprint in openSprints()` JQL would.
 */
export function fetchActiveSprintIssues(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<JiraTicket[]> {
  return cached("activeIssues", cfg, !!opts.force, () => _fetchActiveSprintIssues(cfg));
}

async function _fetchActiveSprintIssues(cfg: JiraConfigLike): Promise<JiraTicket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);
  const spIds = await resolveSpIds(cfg);

  // 1. Active sprints on this board.
  const sprintRes = await fetch(
    `${base}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    { headers },
  );
  if (!sprintRes.ok) {
    const body = await sprintRes.text().catch(() => "");
    throw new Error(`JIRA active-sprint lookup failed (${sprintRes.status}): ${body.slice(0, 300)}`);
  }
  const sprintData: any = await sprintRes.json();
  const sprintIds: number[] = (sprintData.values ?? []).map((s: any) => s.id);
  if (sprintIds.length === 0) return [];

  // 2. Issues for each active sprint, paginated so large sprints aren't truncated.
  const fields = `summary,status,assignee,issuetype,parent,epic,priority,closedSprints${spFieldsParam(spIds) ? "," + spFieldsParam(spIds) : ""}`;
  const all: JiraTicket[] = [];
  const seen = new Set<string>();
  for (const sid of sprintIds) {
    let startAt = 0;
    // Guard against runaway loops; 50 pages * 100 = 5000 issues max.
    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100", fields });
      const res = await fetch(
        `${base}/rest/agile/1.0/board/${boardId}/sprint/${sid}/issue?${params.toString()}`,
        { headers },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`JIRA sprint issues failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const data: any = await res.json();
      const issues: any[] = data.issues ?? [];
      for (const issue of issues) {
        if (seen.has(issue.key)) continue;
        seen.add(issue.key);
        all.push(mapIssue(base, issue, spIds));
      }
      startAt += issues.length;
      const total = typeof data.total === "number" ? data.total : startAt;
      if (issues.length === 0 || startAt >= total) break;
    }
  }
  return all;
}

export interface JiraSprintInfo {
  id: number;
  number: number | null; // parsed from the sprint name when possible
  name: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
}

function isoToDate(s?: string | null): string | null {
  return s ? s.slice(0, 10) : null;
}

/** First active sprint on the board, or null (e.g. Kanban / none active). */
export function fetchActiveSprintInfo(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<JiraSprintInfo | null> {
  return cached("activeInfo", cfg, !!opts.force, () => _fetchActiveSprintInfo(cfg));
}

async function _fetchActiveSprintInfo(cfg: JiraConfigLike): Promise<JiraSprintInfo | null> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);

  const res = await fetch(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=active`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA active-sprint lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const sprint = (data.values ?? [])[0];
  if (!sprint) return null;
  const name = String(sprint.name ?? "");
  // Prefer the number right after "Sprint"; else the last number in the name.
  const afterSprint = name.match(/sprint\s*#?\s*(\d+)/i);
  const lastNum = name.match(/(\d+)(?!.*\d)/);
  const numStr = afterSprint?.[1] ?? lastNum?.[1];
  return {
    id: sprint.id,
    number: numStr ? parseInt(numStr, 10) : null,
    name: sprint.name ?? `Sprint ${sprint.id}`,
    startDate: isoToDate(sprint.startDate),
    endDate: isoToDate(sprint.endDate),
  };
}

/**
 * Fetch issues belonging to the board's NEXT (future) sprint — the immediately
 * upcoming sprint (current + 1). Resolves the first future-state sprint on the
 * board, then pulls its issues. Returns [] when no future sprint exists yet.
 * Used by the Clairvoyance (grooming) view and Tarot ticket list.
 */
export function fetchNextSprintIssues(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<JiraTicket[]> {
  return cached("nextIssues", cfg, !!opts.force, () => _fetchNextSprintIssues(cfg));
}

async function firstFutureSprintId(base: string, boardId: string, headers: Record<string, string>): Promise<number | null> {
  const res = await fetch(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=future`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA future-sprint lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const sprint = (data.values ?? [])[0]; // first future sprint = next (current + 1)
  return sprint ? (sprint.id as number) : null;
}

async function _fetchNextSprintIssues(cfg: JiraConfigLike): Promise<JiraTicket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);
  const spIds = await resolveSpIds(cfg);

  const sid = await firstFutureSprintId(base, boardId, headers);
  if (sid == null) return [];

  const fields = `summary,status,assignee,issuetype,parent,epic,priority,closedSprints${spFieldsParam(spIds) ? "," + spFieldsParam(spIds) : ""}`;
  const all: JiraTicket[] = [];
  const seen = new Set<string>();
  let startAt = 0;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100", fields });
    const res = await fetch(
      `${base}/rest/agile/1.0/board/${boardId}/sprint/${sid}/issue?${params.toString()}`,
      { headers },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`JIRA next-sprint issues failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const issues: any[] = data.issues ?? [];
    for (const issue of issues) {
      if (seen.has(issue.key)) continue;
      seen.add(issue.key);
      all.push(mapIssue(base, issue, spIds));
    }
    startAt += issues.length;
    const total = typeof data.total === "number" ? data.total : startAt;
    if (issues.length === 0 || startAt >= total) break;
  }
  return all;
}

// Paginate any board issue endpoint (sprint issues / backlog) into JiraTickets.
async function paginateIssues(
  base: string,
  headers: Record<string, string>,
  path: string,
  fields: string,
  spIds: SpIds,
): Promise<JiraTicket[]> {
  const all: JiraTicket[] = [];
  const seen = new Set<string>();
  let startAt = 0;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ startAt: String(startAt), maxResults: "100", fields });
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${base}${path}${sep}${params.toString()}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`JIRA request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const issues: any[] = data.issues ?? [];
    for (const issue of issues) {
      if (issue.key && seen.has(issue.key)) continue;
      if (issue.key) seen.add(issue.key);
      all.push(mapIssue(base, issue, spIds));
    }
    startAt += issues.length;
    const total = typeof data.total === "number" ? data.total : startAt;
    if (issues.length === 0 || startAt >= total) break;
  }
  return all;
}

// A grooming bucket: one future (not-yet-started) sprint, or the backlog.
export interface GroomingBucket {
  key: string;
  label: string;
  kind: "FUTURE_SPRINT" | "BACKLOG";
  tickets: JiraTicket[];
}

/** All future sprints (each with its issues) + the backlog, for grooming. */
export function fetchGroomingBuckets(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<GroomingBucket[]> {
  return cached("grooming", cfg, !!opts.force, () => _fetchGroomingBuckets(cfg));
}

async function _fetchGroomingBuckets(cfg: JiraConfigLike): Promise<GroomingBucket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);
  const spIds = await resolveSpIds(cfg);
  const fields = `summary,status,assignee,issuetype,parent,epic,priority,closedSprints${spFieldsParam(spIds) ? "," + spFieldsParam(spIds) : ""}`;

  const buckets: GroomingBucket[] = [];

  // Future (not-yet-started) sprints, in board order.
  const sres = await fetch(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=future`, { headers });
  if (!sres.ok) {
    const body = await sres.text().catch(() => "");
    throw new Error(`JIRA future-sprint lookup failed (${sres.status}): ${body.slice(0, 300)}`);
  }
  const sdata: any = await sres.json();
  for (const s of sdata.values ?? []) {
    const tickets = await paginateIssues(base, headers, `/rest/agile/1.0/board/${boardId}/sprint/${s.id}/issue`, fields, spIds);
    buckets.push({ key: `sprint-${s.id}`, label: s.name ?? `Sprint ${s.id}`, kind: "FUTURE_SPRINT", tickets });
  }

  // Backlog: issues not assigned to any sprint.
  const backlog = await paginateIssues(base, headers, `/rest/agile/1.0/board/${boardId}/backlog`, fields, spIds);
  buckets.push({ key: "backlog", label: "Backlog", kind: "BACKLOG", tickets: backlog });

  return buckets;
}

export interface JiraVelocityRow {
  sprintId: string;
  number: number;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  committedPoints: number;
  completedPoints: number;
  ticketCount: number;
  doneCount: number;
}

function isDoneName(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "done" || s === "closed" || s === "resolved" || s === "complete" || s === "completed";
}

function parseSprintNumber(name: string): number | null {
  const after = name.match(/sprint\s*#?\s*(\d+)/i);
  const last = name.match(/(\d+)(?!.*\d)/);
  const s = after?.[1] ?? last?.[1];
  return s ? parseInt(s, 10) : null;
}

/** Per-closed-sprint velocity computed live from JIRA (committed vs Done SP). */
export function fetchJiraVelocity(cfg: JiraConfigLike, limit: number, opts: JiraFetchOpts = {}): Promise<JiraVelocityRow[]> {
  return cached(`jiraVelocity:${limit}`, cfg, !!opts.force, () => _fetchJiraVelocity(cfg, limit));
}

async function _fetchJiraVelocity(cfg: JiraConfigLike, limit: number): Promise<JiraVelocityRow[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);
  const spIds = await resolveSpIds(cfg);
  const fields = `summary,status,issuetype${spFieldsParam(spIds) ? "," + spFieldsParam(spIds) : ""}`;

  const res = await fetch(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=closed`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA closed-sprint lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  let sprints: any[] = (data.values ?? []).filter((s: any) => s.startDate && s.endDate);
  sprints.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  if (limit > 0) sprints = sprints.slice(-limit);

  const out: JiraVelocityRow[] = [];
  let seq = 0;
  for (const s of sprints) {
    seq += 1;
    const issues = await paginateIssues(base, headers, `/rest/agile/1.0/board/${boardId}/sprint/${s.id}/issue`, fields, spIds);
    let committed = 0;
    let completed = 0;
    let doneCount = 0;
    for (const it of issues) {
      const pts = typeof it.storyPoints === "number" ? it.storyPoints : 0;
      committed += pts;
      if (isDoneName(it.status)) {
        completed += pts;
        doneCount += 1;
      }
    }
    out.push({
      sprintId: String(s.id),
      number: parseSprintNumber(String(s.name ?? "")) ?? seq,
      name: s.name ?? null,
      startDate: isoToDate(s.startDate),
      endDate: isoToDate(s.endDate),
      committedPoints: Math.round(committed * 100) / 100,
      completedPoints: Math.round(completed * 100) / 100,
      ticketCount: issues.length,
      doneCount,
    });
  }
  return out;
}

/** First future (next) sprint on the board, or null. */
export function fetchNextSprintInfo(cfg: JiraConfigLike, opts: JiraFetchOpts = {}): Promise<JiraSprintInfo | null> {
  return cached("nextInfo", cfg, !!opts.force, () => _fetchNextSprintInfo(cfg));
}

async function _fetchNextSprintInfo(cfg: JiraConfigLike): Promise<JiraSprintInfo | null> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);

  const res = await fetch(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=future`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA future-sprint lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const sprint = (data.values ?? [])[0];
  if (!sprint) return null;
  const name = String(sprint.name ?? "");
  const afterSprint = name.match(/sprint\s*#?\s*(\d+)/i);
  const lastNum = name.match(/(\d+)(?!.*\d)/);
  const numStr = afterSprint?.[1] ?? lastNum?.[1];
  return {
    id: sprint.id,
    number: numStr ? parseInt(numStr, 10) : null,
    name: sprint.name ?? `Sprint ${sprint.id}`,
    startDate: isoToDate(sprint.startDate),
    endDate: isoToDate(sprint.endDate),
  };
}

// --- Write-back (Tarot → Jira sync) -------------------------------------
export interface SpIdsResolved {
  default: string | null;
  fe: string | null;
  be: string | null;
  qa: string | null;
}

/** Resolve a squad's configured SP field names/ids to custom field ids. */
export function resolveSquadSpIds(cfg: JiraConfigLike): Promise<SpIdsResolved> {
  return resolveSpIds(cfg);
}

/** Read the current numeric values of the given field ids for one issue. */
export async function getIssueFieldValues(
  cfg: JiraConfigLike,
  issueKey: string,
  fieldIds: string[],
): Promise<Record<string, number | null>> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const ids = fieldIds.filter(Boolean);
  if (ids.length === 0) return {};
  const params = new URLSearchParams({ fields: ids.join(",") });
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`, {
    headers: jiraHeaders(cfg),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA issue read failed for ${issueKey} (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const f = data.fields ?? {};
  const out: Record<string, number | null> = {};
  for (const id of ids) out[id] = numOrNull(f[id]);
  return out;
}

/**
 * Fetch a single issue's display metadata (summary/type/priority/parent), used
 * to label a Tarot round when the ticket isn't in the cached next-sprint list
 * (e.g. a sub-task). Returns null on failure so callers can fall back gracefully.
 */
export async function getIssueMeta(
  cfg: JiraConfigLike,
  issueKey: string,
): Promise<Pick<JiraTicket, "summary" | "issueType" | "priority" | "url" | "parentKey" | "parentName"> | null> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const params = new URLSearchParams({ fields: "summary,issuetype,priority,parent" });
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`, {
    headers: jiraHeaders(cfg),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data: any = await res.json().catch(() => null);
  if (!data) return null;
  const f = data.fields ?? {};
  return {
    summary: f.summary ?? null,
    issueType: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    url: `${base}/browse/${issueKey}`,
    parentKey: f.parent?.key ?? null,
    parentName: f.parent?.fields?.summary ?? null,
  };
}

/** Write field values to an issue. PUT /rest/api/3/issue/{key} { fields }. */
export async function updateIssueFields(
  cfg: JiraConfigLike,
  issueKey: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const base = normalizeBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    headers: jiraHeaders(cfg),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA issue update failed for ${issueKey} (${res.status}): ${body.slice(0, 300)}`);
  }
  // Bust caches so subsequent reads reflect the new value.
  for (const k of jiraCache.keys()) jiraCache.delete(k);
}

export interface JiraField {
  id: string;
  name: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  email?: string | null;
}

/**
 * List human JIRA users (accountId + name) for the admin member picker.
 * Filters out apps/bots; needs the "Browse users and groups" global permission.
 */
export async function listUsers(cfg: JiraConfigLike): Promise<JiraUser[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/rest/api/3/users/search?maxResults=1000`, {
    headers: jiraHeaders(cfg),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA user list failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const arr: any[] = await res.json();
  return arr
    .filter((u) => u.accountType === "atlassian" && u.active !== false && u.accountId)
    .map((u) => ({
      accountId: String(u.accountId),
      displayName: String(u.displayName ?? u.accountId),
      email: u.emailAddress ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** List all JIRA fields (id + name) — used by admin UI to pick the SP field. */
export async function listFields(cfg: JiraConfigLike): Promise<JiraField[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/rest/api/3/field`, { headers: jiraHeaders(cfg) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA field list failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const arr: any[] = await res.json();
  return arr
    .map((f) => ({ id: String(f.id), name: String(f.name ?? f.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Verify connection by hitting /myself. Returns display name on success. */
export async function testConnection(cfg: JiraConfigLike): Promise<string> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: authHeader(cfg), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA auth failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return data.displayName ?? data.emailAddress ?? "ok";
}

// ─── Fortune: create / update / search / resolve (markdown ⇄ ADF) ────────────

// markdown → Atlassian Document Format. Handles headings, bullet lists (incl.
// checkboxes), GFM pipe tables, inline links + bold; single newlines inside a
// block become hardBreaks (keeps stacked Gherkin clauses). Unrecognised → paragraph.
interface ADFNode { type: string; [k: string]: unknown; }
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*[-*]\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

function inlineNodes(text: string): ADFNode[] {
  const nodes: ADFNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) nodes.push({ type: "text", text: m[1], marks: [{ type: "link", attrs: { href: m[2] } }] });
    else nodes.push({ type: "text", text: m[3], marks: [{ type: "strong" }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.filter((n) => (n as any).text !== "");
}
function paragraphFromLines(lines: string[]): ADFNode {
  const content: ADFNode[] = [];
  for (const line of lines) {
    const inline = inlineNodes(line);
    if (!inline.length) continue;
    if (content.length) content.push({ type: "hardBreak" });
    content.push(...inline);
  }
  return { type: "paragraph", content };
}
function splitCells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function toADF(text: string): object {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const content: ADFNode[] = [];
  let i = 0;
  const isTableStart = (idx: number) =>
    TABLE_ROW_RE.test(lines[idx]) && idx + 1 < lines.length && TABLE_SEP_RE.test(lines[idx + 1]) && lines[idx + 1].includes("-");

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const h = line.match(HEADING_RE);
    if (h) { content.push({ type: "heading", attrs: { level: Math.min(h[1].length, 6) }, content: inlineNodes(h[2].trim()) }); i++; continue; }
    if (isTableStart(i)) {
      const header = splitCells(lines[i]);
      i += 2;
      const rows: ADFNode[] = [{ type: "tableRow", content: header.map((c) => ({ type: "tableHeader", content: [paragraphFromLines([c])] })) }];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        const cells = splitCells(lines[i]);
        rows.push({ type: "tableRow", content: cells.map((c) => ({ type: "tableCell", content: [paragraphFromLines([c])] })) });
        i++;
      }
      content.push({ type: "table", attrs: { isNumberColumnEnabled: false, layout: "default" }, content: rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      const items: ADFNode[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const raw = lines[i].match(LIST_RE)![1];
        const cb = raw.match(/^\[([ xX])\]\s+(.*)$/);
        const itemText = cb ? `${cb[1].trim() ? "☑" : "☐"} ${cb[2]}` : raw;
        items.push({ type: "listItem", content: [paragraphFromLines([itemText])] });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !HEADING_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !isTableStart(i)) {
      para.push(lines[i]); i++;
    }
    if (para.length) content.push(paragraphFromLines(para));
  }
  if (!content.length) content.push({ type: "paragraph", content: [] });
  return { type: "doc", version: 1, content };
}

// ADF → plain markdown-ish text (for importing a ticket's description into the
// editor / Gemini). Lossy but preserves headings, lists, tables, links, breaks.
export function adfToText(node: any): string {
  if (!node) return "";
  const walkInline = (nodes: any[]): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === "text") {
          const link = (n.marks ?? []).find((m: any) => m.type === "link");
          return link ? `[${n.text}](${link.attrs?.href ?? ""})` : n.text ?? "";
        }
        if (n.type === "hardBreak") return "\n";
        return "";
      })
      .join("");
  const block = (n: any): string => {
    switch (n.type) {
      case "heading": return `${"#".repeat(n.attrs?.level ?? 1)} ${walkInline(n.content)}`;
      case "paragraph": return walkInline(n.content);
      case "bulletList": return (n.content ?? []).map((li: any) => `- ${(li.content ?? []).map(block).join(" ")}`).join("\n");
      case "orderedList": return (n.content ?? []).map((li: any, idx: number) => `${idx + 1}. ${(li.content ?? []).map(block).join(" ")}`).join("\n");
      case "listItem": return (n.content ?? []).map(block).join(" ");
      case "table":
        return (n.content ?? [])
          .map((row: any) => `| ${(row.content ?? []).map((cell: any) => (cell.content ?? []).map(block).join(" ")).join(" | ")} |`)
          .join("\n");
      default: return (n.content ?? []).map(block).join("\n");
    }
  };
  if (node.type === "doc") return (node.content ?? []).map(block).join("\n\n").trim();
  return block(node);
}

/** Resolve the JIRA project key for a squad's board (agile board → location). */
export async function boardProjectKey(cfg: JiraConfigLike): Promise<string> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const boardId = await resolveBoardId(cfg, base);
  const res = await fetch(`${base}/rest/agile/1.0/board/${boardId}`, { headers: jiraHeaders(cfg) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA board lookup failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const key = data?.location?.projectKey;
  if (!key) throw new Error("Could not resolve a project key from the squad's board.");
  return String(key);
}

/** Resolve a JIRA accountId from an email (user search). Null if none/no perm. */
export async function findAccountIdByEmail(cfg: JiraConfigLike, email: string): Promise<string | null> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/rest/api/3/user/search?query=${encodeURIComponent(email)}`, {
    headers: jiraHeaders(cfg),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const arr: any[] = await res.json().catch(() => []);
  const exact = arr.find((u) => (u.emailAddress ?? "").toLowerCase() === email.toLowerCase());
  return (exact ?? arr[0])?.accountId ?? null;
}

export interface FortuneTicketRef { key: string; summary: string; issueType: string | null; }

/** Search the squad's board project by key or title (for the Import picker). */
export async function searchBoardIssues(cfg: JiraConfigLike, query: string): Promise<FortuneTicketRef[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const projectKey = await boardProjectKey(cfg);
  const q = query.trim().replace(/["\\]/g, " ");
  const isKey = /^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(q);
  const jql = q
    ? isKey
      ? `key = "${q}"`
      : `project = "${projectKey}" AND summary ~ "${q}*" ORDER BY updated DESC`
    : `project = "${projectKey}" ORDER BY updated DESC`;
  // Use the current /search/jql endpoint (legacy /search returns 410 Gone).
  const params = new URLSearchParams({ jql, maxResults: "15", fields: "summary,issuetype" });
  const res = await fetch(`${base}/rest/api/3/search/jql?${params.toString()}`, { headers: jiraHeaders(cfg) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return (data.issues ?? []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? issue.key,
    issueType: issue.fields?.issuetype?.name ?? null,
  }));
}

export interface FortuneImportedIssue { key: string; summary: string; description: string; issueType: string; url: string; }

/** Fetch one issue's summary + description(as text) + type, for Import mode. */
export async function getIssueForFortune(cfg: JiraConfigLike, issueKey: string): Promise<FortuneImportedIssue> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const params = new URLSearchParams({ fields: "summary,description,issuetype" });
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`, {
    headers: jiraHeaders(cfg),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA issue read failed for ${issueKey} (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const f = data.fields ?? {};
  return {
    key: data.key,
    summary: f.summary ?? "",
    description: f.description ? adfToText(f.description) : "",
    issueType: f.issuetype?.name ?? "Task",
    url: `${base}/browse/${data.key}`,
  };
}

export interface CreateIssueInput {
  projectKey: string;
  summary: string;
  description?: string; // markdown → ADF
  issueType: string;
  reporterAccountId?: string | null;
  parentKey?: string | null;
  labels?: string[];
}

/** Create an issue. POST /rest/api/3/issue. Returns key + browse url. */
export async function createIssue(cfg: JiraConfigLike, input: CreateIssueInput): Promise<{ key: string; url: string }> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    summary: input.summary,
    issuetype: { name: input.issueType },
  };
  if (input.description) fields.description = toADF(input.description);
  if (input.reporterAccountId) fields.reporter = { id: input.reporterAccountId };
  if (input.parentKey) fields.parent = { key: input.parentKey };
  if (input.labels?.length) fields.labels = input.labels;

  const res = await fetch(`${base}/rest/api/3/issue`, {
    method: "POST",
    headers: jiraHeaders(cfg),
    body: JSON.stringify({ fields }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = body?.errors ? JSON.stringify(body.errors) : (body?.errorMessages ?? []).join(", ") || res.statusText;
    throw new Error(`JIRA create failed (${res.status}): ${errs}`);
  }
  for (const k of jiraCache.keys()) jiraCache.delete(k);
  return { key: body.key, url: `${base}/browse/${body.key}` };
}

/** Update summary/description on an issue (Fortune import refine). */
export async function updateIssueContent(
  cfg: JiraConfigLike,
  issueKey: string,
  content: { summary?: string; description?: string },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (content.summary != null) fields.summary = content.summary;
  if (content.description != null) fields.description = toADF(content.description);
  await updateIssueFields(cfg, issueKey, fields);
}
