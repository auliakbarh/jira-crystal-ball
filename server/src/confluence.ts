// Minimal Confluence Cloud client (v2 REST). Reuses the Atlassian email + API
// token configured for JIRA. Creates a page in a space under a parent.
import { env } from "./env.js";

function base(): string {
  return env.confluence.baseUrl.replace(/\/+$/, "");
}

function authHeader(): string {
  const token = Buffer.from(`${env.jira.email}:${env.jira.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function headers() {
  return { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" };
}

export function confluenceConfigured(): boolean {
  return Boolean(base() && env.jira.email && env.jira.apiToken);
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Resolve the numeric space id from its key (v2 needs the id). */
async function getSpaceId(key: string): Promise<string> {
  const res = await fetch(`${base()}/wiki/api/v2/spaces?keys=${encodeURIComponent(key)}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Confluence space lookup failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const id = data.results?.[0]?.id;
  if (!id) throw new Error(`Confluence space "${key}" not found`);
  return String(id);
}

export interface CreatedPage {
  id: string;
  url: string;
  title: string;
}

function pageUrl(data: any): string {
  const webui = data._links?.webui ?? "";
  return webui ? `${base()}/wiki${webui}` : `${base()}/wiki`;
}

/**
 * Create a page (storage-format body). Space key + parent id default to the
 * global env config but can be overridden per-squad via the optional opts.
 */
export async function createPage(
  title: string,
  storageHtml: string,
  opts: { spaceKey?: string; parentId?: string } = {},
): Promise<CreatedPage> {
  if (!confluenceConfigured()) throw new Error("CONFLUENCE_NOT_CONFIGURED");
  const spaceKey = opts.spaceKey || env.confluence.spaceKey;
  const parentId = opts.parentId || env.confluence.parentId;
  const spaceId = await getSpaceId(spaceKey);

  const payload: Record<string, unknown> = {
    spaceId,
    status: "current",
    title,
    body: { representation: "storage", value: storageHtml },
  };
  if (parentId) payload.parentId = parentId;

  const res = await fetch(`${base()}/wiki/api/v2/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Confluence page create failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return { id: String(data.id), url: pageUrl(data), title: data.title ?? title };
}

/** Update an existing page in place (bumps the version). */
export async function updatePage(pageId: string, title: string, storageHtml: string): Promise<CreatedPage> {
  if (!confluenceConfigured()) throw new Error("CONFLUENCE_NOT_CONFIGURED");
  // Current version is required and must be incremented.
  const cur = await fetch(`${base()}/wiki/api/v2/pages/${pageId}`, { headers: headers() });
  if (!cur.ok) {
    const body = await cur.text().catch(() => "");
    throw new Error(`Confluence page read failed (${cur.status}): ${body.slice(0, 200)}`);
  }
  const curData: any = await cur.json();
  const nextVersion = (curData.version?.number ?? 1) + 1;

  const res = await fetch(`${base()}/wiki/api/v2/pages/${pageId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      id: pageId,
      status: "current",
      title,
      body: { representation: "storage", value: storageHtml },
      version: { number: nextVersion, message: "Updated by JIRA Crystal Ball" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Confluence page update failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return { id: String(data.id), url: pageUrl(data), title: data.title ?? title };
}
