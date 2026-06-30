// Minimal JIRA Cloud REST client. Uses Basic auth (email:apiToken).
// Fetches issues from an Agile board, optionally filtered by JQL.

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
  carryOver: boolean; // issue was in at least one earlier (closed) sprint
  carryOverCount: number; // how many completed sprints it has rolled through
  carryOverSprints: string[]; // names of those completed sprints
}

interface JiraConfigLike {
  baseUrl: string;
  email: string;
  apiToken: string;
  boardId: string;
  jql?: string | null;
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

function mapIssue(base: string, issue: any): JiraTicket {
  const f = issue.fields ?? {};
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
export async function fetchBoardIssues(cfg: JiraConfigLike): Promise<JiraTicket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);

  const fields = "summary,status,assignee,issuetype,parent,epic,priority,closedSprints";
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
  return issues.map((i) => mapIssue(base, i));
}

/**
 * Fetch issues belonging to the board's ACTIVE sprint(s) only.
 * Resolves active sprint ids from the agile API, then pulls their issues —
 * board-scoped, so it won't leak other projects' sprints the way a bare
 * `sprint in openSprints()` JQL would.
 */
export async function fetchActiveSprintIssues(cfg: JiraConfigLike): Promise<JiraTicket[]> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const headers = jiraHeaders(cfg);
  const boardId = await resolveBoardId(cfg, base);

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
  const fields = "summary,status,assignee,issuetype,parent,epic,priority,closedSprints";
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
        all.push(mapIssue(base, issue));
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
export async function fetchActiveSprintInfo(cfg: JiraConfigLike): Promise<JiraSprintInfo | null> {
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
