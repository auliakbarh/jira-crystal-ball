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
  let url: string;
  if (cfg.jql && cfg.jql.trim()) {
    const params = new URLSearchParams({
      jql: cfg.jql.trim(),
      maxResults: "100",
      fields,
    });
    url = `${base}/rest/api/3/search?${params.toString()}`;
  } else {
    const boardId = await resolveBoardId(cfg, base);
    const params = new URLSearchParams({ maxResults: "100", fields });
    url = `${base}/rest/agile/1.0/board/${boardId}/issue?${params.toString()}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const issues: any[] = data.issues ?? [];
  return issues.map((i) => mapIssue(base, i, spIds));
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

export interface JiraField {
  id: string;
  name: string;
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
