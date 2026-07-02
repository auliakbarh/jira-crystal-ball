// Fortune — Gemini-powered JIRA ticket creator (single / epic breakdown /
// import-refine-update). Drafts + history are shared per-squad; deletes gated to
// creator or super-admin. All JIRA writes require a non-guest signed-in user.
import type { Context } from "../context.js";
import { requireAuth, requireAdmin, isSuperAdminUser } from "../context.js";
import { jiraCfgForBoard } from "./shared.js";
import { hasGeminiKey, env } from "../env.js";
import { generateJSON, listModels, DEFAULT_TEMPERATURE, type GeminiTurn, type GeminiUsage } from "../gemini.js";
import {
  boardProjectKey,
  findAccountIdByEmail,
  searchBoardIssues,
  getIssueForFortune,
  createIssue,
  updateIssueContent,
} from "../jira.js";

interface Turn { role: "user" | "model"; text: string; }
interface SingleDraft { summary: string; description: string; issuetype: string; }
interface Child { summary: string; description: string; issuetype: string; }
interface Plan { epic: { summary: string; description: string }; tasks: Child[]; }

// ── Auth: Fortune (JIRA writes + Gemini spend) is non-guest only ──
async function requireMember(ctx: Context): Promise<{ id: string; name: string }> {
  const userId = requireAuth(ctx);
  if (userId === "guest") throw new Error("Only signed-in members can use Fortune.");
  const u = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new Error("Only signed-in members can use Fortune.");
  return { id: u.id, name: u.name };
}

// Global Gemini sampling temperature — admin-set (AppSetting), else env default.
async function geminiTemperature(ctx: Context): Promise<number> {
  const row = await ctx.prisma.appSetting.findUnique({ where: { key: "geminiTemperature" } });
  const v = row ? Number(row.value) : DEFAULT_TEMPERATURE;
  return Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : DEFAULT_TEMPERATURE;
}

async function squadCfgOrThrow(ctx: Context, squadId: string) {
  const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
  if (!squad) throw new Error("Squad not found");
  const cfg = jiraCfgForBoard(squad);
  if (!cfg || !cfg.boardId) throw new Error("JIRA is not configured for this squad.");
  return { squad, cfg };
}

// Best-effort history log.
async function logFortune(
  ctx: Context,
  squadId: string,
  actor: { id: string; name: string },
  e: { action: string; mode: string; summary: string; jiraKey?: string | null; payload?: unknown; turns?: unknown; usage?: unknown },
) {
  try {
    await ctx.prisma.fortuneHistory.create({
      data: {
        squadId,
        actorId: actor.id,
        actorName: actor.name,
        action: e.action,
        mode: e.mode,
        summary: e.summary.slice(0, 500),
        jiraKey: e.jiraKey ?? null,
        payload: e.payload != null ? JSON.stringify(e.payload) : null,
        turns: e.turns != null ? JSON.stringify(e.turns) : null,
        usage: e.usage != null ? JSON.stringify(e.usage) : null,
      },
    });
  } catch {
    /* logging must not break the action */
  }
}

// ── Prompts (house Gherkin UAC template) ──
// A concrete few-shot exemplar: Gemini mimics THIS structure exactly. Kept compact
// (3 scenarios) to teach the pattern — headings, blank-line grouping, EN|ID tables,
// image placeholders — without blowing the token budget.
const FORMAT_EXAMPLE = `## Description

Overview: <1-3 sentences describing the feature and who uses it>.

Figma: TBD

PRD / Confluence: TBD

Postman: TBD

API contract & path: TBD

Catatan: <optional — open questions / blockers / assumptions; omit the line if none>.

## User Acceptance Criteria (UAC)

# 1. ACCESS THE FEATURE FROM THE PROFILE PAGE

GIVEN the user is logged in,
AND the user opens the Profile page,

WHEN the Profile page loads,

THEN a permanent banner is shown on the Profile page,
AND a menu entry appears in the Profile menu list.

WHEN the user taps the banner or the menu entry,

THEN the user is navigated to the feature detail page.

[image-or-design-ui-from-figma](https://example-image.com)

# 2. REDEEM — ENOUGH BALANCE

GIVEN the user is on the feature page,
AND the balance is at least the minimum,

WHEN the user taps the redeem button,

THEN a bottom sheet with the copy below is shown.

| EN | ID |
|---|---|
| Your Points Are Ready to Redeem! | Point Kamu Siap Ditukar! |

WHEN the user confirms with a correct PIN,

THEN the redemption is created with status "In Progress",
AND the balance decreases immediately.

[image-or-design-ui-from-figma](https://example-image.com)

# 3. ERROR HANDLING

GIVEN the user is on the feature page,

WHEN an API request fails (network or server error),

THEN an error state with a retry button is shown, using the copy below.

| EN | ID |
|---|---|
| Something went wrong. Please try again. | Terjadi kesalahan. Silakan coba lagi. |
| Retry | Coba Lagi |

[image-or-design-ui-from-figma](https://example-image.com)`;

const HOUSE_RULES = (lang: string) => `You write JIRA tickets in a strict in-house format. Follow the STRUCTURE of the example below EXACTLY (same sections, heading style, spacing, table style, image placeholders). Only the content changes — derive it from the requirement, never copy the example's wording.

Structure rules:
- Title line style (for the "summary"): "[feature][sub] short description" (sub optional). Do NOT put the title inside "description".
- "description" starts with a "## Description" section: bullet-free lines "Overview:", "Figma:", "PRD / Confluence:", "Postman:", "API contract & path:" — put "TBD" unless the input gives a real value (never invent URLs/links). Add a "Catatan:" line for open questions/blockers/assumptions, or omit it if there are none.
- Then a "## User Acceptance Criteria (UAC)" section. One scenario per "# N. TITLE IN UPPERCASE" heading (N from 1).
- Gherkin keywords are UPPERCASE ENGLISH (GIVEN/AND/WHEN/THEN). Keep consecutive clauses of the same step on adjacent lines (comma-terminated, last one a period). Separate the GIVEN block, each WHEN block, and each THEN block with ONE blank line. A scenario may contain several WHEN→THEN cycles.
- For EVERY user-facing text/label/message/copy, add a "| EN | ID |" markdown table right where it is referenced (one row per string, blank line before and after the table).
- End UI scenarios with a line: [image-or-design-ui-from-figma](https://example-image.com)
- Cover: happy path, alternative/entry points, permission/auth, loading state, error handling, and edge cases.
- Prose language: ${lang === "id" ? "Bahasa Indonesia" : "English"}. Keep the Gherkin keywords and the "EN"/"ID" table headers in English regardless.
- The "description" field MUST contain the COMPLETE body (## Description + the full ## UAC with every scenario, table and image placeholder) — never summarized or truncated.

=== FORMAT EXAMPLE (mimic this structure, replace the content) ===
${FORMAT_EXAMPLE}
=== END EXAMPLE ===`;

function singlePrompt(lang: string, issuetype: string, text: string): string {
  return `${HOUSE_RULES(lang)}

Issue type: ${issuetype}.
Return ONLY JSON: { "summary": "<title without leading # >", "description": "<full body>" }.

Requirement / source content:
${text || "(see attached files)"}`;
}
function epicPrompt(lang: string, text: string): string {
  return `${HOUSE_RULES(lang)}

Break the requirement into ONE Epic + 4-8 child issues. Each child's "description" must ALSO follow the full house template above (its own ## Description + ## UAC). Child issuetype is "Story" (user-facing) or "Task" (technical).
Return ONLY JSON: { "epic": { "summary": "[Feature] ...", "description": "<full body>" }, "tasks": [ { "summary": "...", "description": "<full body>", "issuetype": "Story" } ] }.

Requirement / source content:
${text || "(see attached files)"}`;
}

// Reconstruct Gemini turns from stored text turns (files are metadata-only, not replayed).
function toGeminiTurns(turns: Turn[]): GeminiTurn[] {
  return turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
}

function usageOut(u: GeminiUsage) {
  return { promptTokens: u.promptTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, model: u.model, estCostUSD: u.estCostUSD, estCostIDR: u.estCostIDR };
}

export const fortuneResolvers = {
  Query: {
    fortuneModels: async (_p: unknown, _a: unknown, ctx: Context) => {
      await requireMember(ctx);
      if (!hasGeminiKey()) return [];
      try {
        return await listModels();
      } catch {
        return [env.gemini.defaultModel];
      }
    },

    fortuneSearchTickets: async (_p: unknown, { squadId, query, issueType }: { squadId: string; query: string; issueType?: string }, ctx: Context) => {
      await requireMember(ctx);
      const { cfg } = await squadCfgOrThrow(ctx, squadId);
      return searchBoardIssues(cfg, query, issueType);
    },

    fortuneDrafts: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      await requireMember(ctx);
      const rows = await ctx.prisma.fortuneDraft.findMany({ where: { squadId }, orderBy: { updatedAt: "desc" } });
      const me = ctx.userId ? await ctx.prisma.user.findUnique({ where: { id: ctx.userId } }) : null;
      const isSuper = isSuperAdminUser(me);
      return rows.map((r) => ({ ...r, canDelete: isSuper || r.createdById === ctx.userId }));
    },

    fortuneHistory: async (_p: unknown, { squadId, limit }: { squadId: string; limit?: number }, ctx: Context) => {
      await requireMember(ctx);
      return ctx.prisma.fortuneHistory.findMany({
        where: { squadId },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit ?? 50, 1), 200),
      });
    },

    geminiSettings: async (_p: unknown, _a: unknown, ctx: Context) => {
      await requireMember(ctx);
      return {
        temperature: await geminiTemperature(ctx),
        defaultTemperature: DEFAULT_TEMPERATURE,
        model: env.gemini.defaultModel,
        configured: hasGeminiKey(),
      };
    },
  },

  Mutation: {
    fortuneGenerate: async (
      _p: unknown,
      { squadId, mode, lang, issuetype, model, text, files }: { squadId: string; mode: string; lang?: string; issuetype?: string; model?: string; text?: string; files?: { name: string; mimeType: string; data: string }[] },
      ctx: Context,
    ) => {
      const actor = await requireMember(ctx);
      if (!hasGeminiKey()) throw new Error("Gemini is not configured on the server.");
      const useModel = model || env.gemini.defaultModel;
      const temp = await geminiTemperature(ctx);
      const seed = (text ?? "").trim();
      const fileParts = (files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } }));
      const promptText = mode === "epic" ? epicPrompt(lang ?? "en", seed) : singlePrompt(lang ?? "en", issuetype || "Story", seed);
      const turns: GeminiTurn[] = [{ role: "user", parts: [{ text: promptText }, ...fileParts] }];

      let payload: any;
      let summary: string;
      let usage: GeminiUsage;
      if (mode === "epic") {
        const { data, usage: u } = await generateJSON<{ epic: { summary: string; description: string }; tasks: Child[] }>(turns, useModel, temp);
        const plan: Plan = {
          epic: { summary: data.epic?.summary ?? "Epic", description: data.epic?.description ?? "" },
          tasks: (data.tasks ?? []).map((t) => ({ summary: t.summary, description: t.description ?? "", issuetype: t.issuetype === "Task" ? "Task" : "Story" })),
        };
        payload = { plan };
        summary = plan.epic.summary;
        usage = u;
      } else {
        const { data, usage: u } = await generateJSON<{ summary: string; description: string }>(turns, useModel, temp);
        const single: SingleDraft = { summary: data.summary ?? "Untitled", description: data.description ?? "", issuetype: issuetype || "Story" };
        payload = { single };
        summary = single.summary;
        usage = u;
      }

      const seedLabel = seed || (files ?? []).map((f) => f.name).join(", ") || "(attached files)";
      const outTurns: Turn[] = [
        { role: "user", text: seedLabel },
        { role: "model", text: `Drafted: ${summary}` },
      ];
      await logFortune(ctx, squadId, actor, { action: "generated", mode, summary, payload, turns: outTurns, usage: usageOut(usage) });
      return { mode, payload: JSON.stringify(payload), turns: JSON.stringify(outTurns), usage: usageOut(usage) };
    },

    fortuneRefine: async (
      _p: unknown,
      { squadId, mode, model, instruction, payload, turns }: { squadId: string; mode: string; model?: string; instruction: string; payload: string; turns: string },
      ctx: Context,
    ) => {
      await requireMember(ctx);
      if (!hasGeminiKey()) throw new Error("Gemini is not configured on the server.");
      const useModel = model || env.gemini.defaultModel;
      const temp = await geminiTemperature(ctx);
      const prior: Turn[] = JSON.parse(turns || "[]");
      const cur = JSON.parse(payload || "{}");
      const shape = mode === "epic"
        ? `{ "epic": { "summary","description" }, "tasks": [ { "summary","description","issuetype" } ] }`
        : `{ "summary","description" }`;
      const refineText = `Here is the current ticket draft as JSON:\n${JSON.stringify(mode === "epic" ? cur.plan : cur.single)}\n\nApply this change: ${instruction}\n\nReturn ONLY the full updated JSON in the same shape ${shape}. Preserve the existing house format EXACTLY — same "## Description" + "## User Acceptance Criteria (UAC)" structure, "# N. TITLE" scenario headings, UPPERCASE GIVEN/WHEN/THEN keywords with blank lines between GIVEN/WHEN/THEN blocks, "| EN | ID |" tables for UI copy, and [image-or-design-ui-from-figma](https://example-image.com) placeholders. Keep the same prose language as the current draft. Do not summarize or drop any scenario unless the change explicitly asks to.`;
      const gTurns: GeminiTurn[] = [...toGeminiTurns(prior), { role: "user", parts: [{ text: refineText }] }];

      let outPayload: any;
      let summary: string;
      let usage: GeminiUsage;
      if (mode === "epic") {
        const { data, usage: u } = await generateJSON<{ epic: { summary: string; description: string }; tasks: Child[] }>(gTurns, useModel, temp);
        const plan: Plan = { epic: { summary: data.epic?.summary ?? cur.plan?.epic?.summary ?? "Epic", description: data.epic?.description ?? "" }, tasks: (data.tasks ?? []).map((t) => ({ summary: t.summary, description: t.description ?? "", issuetype: t.issuetype === "Task" ? "Task" : "Story" })) };
        outPayload = { plan }; summary = plan.epic.summary; usage = u;
      } else {
        const { data, usage: u } = await generateJSON<{ summary: string; description: string }>(gTurns, useModel, temp);
        const single: SingleDraft = { summary: data.summary ?? cur.single?.summary ?? "Untitled", description: data.description ?? "", issuetype: cur.single?.issuetype ?? "Story" };
        outPayload = { single }; summary = single.summary; usage = u;
      }
      const outTurns: Turn[] = [...prior, { role: "user", text: instruction }, { role: "model", text: `Refined: ${summary}` }];
      return { mode, payload: JSON.stringify(outPayload), turns: JSON.stringify(outTurns), usage: usageOut(usage) };
    },

    fortuneImport: async (_p: unknown, { squadId, ticketKey }: { squadId: string; ticketKey: string }, ctx: Context) => {
      await requireMember(ctx);
      const { cfg } = await squadCfgOrThrow(ctx, squadId);
      const issue = await getIssueForFortune(cfg, ticketKey);
      const single: SingleDraft = { summary: issue.summary, description: issue.description, issuetype: issue.issueType };
      const turnsArr: Turn[] = [
        { role: "user", text: `Imported ${issue.key}: ${issue.summary}` },
        { role: "model", text: "Loaded ticket detail." },
      ];
      const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, model: env.gemini.defaultModel, estCostUSD: 0, estCostIDR: 0 };
      return {
        mode: "import",
        payload: JSON.stringify({ single }),
        turns: JSON.stringify(turnsArr),
        usage,
        ticketKey: issue.key,
        prev: JSON.stringify({ single }),
      };
    },

    fortuneCreate: async (
      _p: unknown,
      { squadId, mode, payload, reporterEmail }: { squadId: string; mode: string; payload: string; reporterEmail?: string },
      ctx: Context,
    ) => {
      const actor = await requireMember(ctx);
      const { cfg } = await squadCfgOrThrow(ctx, squadId);
      const projectKey = await boardProjectKey(cfg);

      // Resolve reporter (best-effort: unresolved → create anyway + warn).
      let reporterAccountId: string | null = null;
      let reporterWarning: string | null = null;
      if (reporterEmail?.trim()) {
        reporterAccountId = await findAccountIdByEmail(cfg, reporterEmail.trim()).catch(() => null);
        if (!reporterAccountId) reporterWarning = `Reporter "${reporterEmail.trim()}" not found in JIRA — created without a reporter.`;
      }

      const parsed = JSON.parse(payload || "{}");
      if (mode === "epic") {
        const plan: Plan = parsed.plan;
        let epicRes: { key: string; url: string };
        try {
          epicRes = await createIssue(cfg, { projectKey, summary: plan.epic.summary, description: plan.epic.description, issueType: "Epic", reporterAccountId });
        } catch (e) {
          // Retry once without reporter if reporter was the likely culprit.
          if (reporterAccountId) {
            reporterWarning = `Could not set reporter — created without it. (${(e as Error).message})`;
            epicRes = await createIssue(cfg, { projectKey, summary: plan.epic.summary, description: plan.epic.description, issueType: "Epic" });
            reporterAccountId = null;
          } else throw e;
        }
        const children: any[] = [];
        for (const c of plan.tasks) {
          try {
            const r = await createIssue(cfg, { projectKey, summary: c.summary, description: c.description, issueType: c.issuetype || "Task", reporterAccountId, parentKey: epicRes.key });
            children.push({ status: "created", key: r.key, url: r.url, input: c.summary });
          } catch (e) {
            children.push({ status: "failed", input: c.summary, error: (e as Error).message });
          }
        }
        await logFortune(ctx, squadId, actor, { action: "created", mode, summary: plan.epic.summary, jiraKey: epicRes.key, payload: parsed });
        return { mode, epic: JSON.stringify(epicRes), children: JSON.stringify(children), reporterWarning };
      }

      const single: SingleDraft = parsed.single;
      let created: { key: string; url: string };
      try {
        created = await createIssue(cfg, { projectKey, summary: single.summary, description: single.description, issueType: single.issuetype || "Story", reporterAccountId });
      } catch (e) {
        if (reporterAccountId) {
          reporterWarning = `Could not set reporter — created without it. (${(e as Error).message})`;
          created = await createIssue(cfg, { projectKey, summary: single.summary, description: single.description, issueType: single.issuetype || "Story" });
        } else throw e;
      }
      await logFortune(ctx, squadId, actor, { action: "created", mode, summary: single.summary, jiraKey: created.key, payload: parsed });
      return { mode, created: JSON.stringify(created), reporterWarning };
    },

    fortuneUpdate: async (_p: unknown, { squadId, ticketKey, payload }: { squadId: string; ticketKey: string; payload: string }, ctx: Context) => {
      const actor = await requireMember(ctx);
      const { cfg } = await squadCfgOrThrow(ctx, squadId);
      const parsed = JSON.parse(payload || "{}");
      const single: SingleDraft = parsed.single;
      await updateIssueContent(cfg, ticketKey, { summary: single.summary, description: single.description });
      await logFortune(ctx, squadId, actor, { action: "updated", mode: "import", summary: single.summary, jiraKey: ticketKey, payload: parsed });
      return true;
    },

    fortuneUndo: async (_p: unknown, { squadId, ticketKey, prev }: { squadId: string; ticketKey: string; prev: string }, ctx: Context) => {
      const actor = await requireMember(ctx);
      const { cfg } = await squadCfgOrThrow(ctx, squadId);
      const parsed = JSON.parse(prev || "{}");
      const single: SingleDraft = parsed.single;
      await updateIssueContent(cfg, ticketKey, { summary: single.summary, description: single.description });
      await logFortune(ctx, squadId, actor, { action: "reverted", mode: "import", summary: single.summary, jiraKey: ticketKey });
      return true;
    },

    saveFortuneDraft: async (
      _p: unknown,
      { squadId, id, mode, summary, payload, requirementText, turns, usage }: { squadId: string; id?: string; mode: string; summary: string; payload: string; requirementText?: string; turns?: string; usage?: string },
      ctx: Context,
    ) => {
      const actor = await requireMember(ctx);
      const data = { mode, summary: summary.slice(0, 500), payload, requirementText: requirementText ?? null, turns: turns ?? null, usage: usage ?? null };
      let row;
      if (id) {
        const existing = await ctx.prisma.fortuneDraft.findUnique({ where: { id } });
        if (!existing) throw new Error("Draft not found");
        row = await ctx.prisma.fortuneDraft.update({ where: { id }, data });
      } else {
        row = await ctx.prisma.fortuneDraft.create({ data: { ...data, squadId, createdById: actor.id, createdByName: actor.name } });
      }
      const me = await ctx.prisma.user.findUnique({ where: { id: actor.id } });
      return { ...row, canDelete: isSuperAdminUser(me) || row.createdById === actor.id };
    },

    setGeminiTemperature: async (_p: unknown, { value }: { value: number }, ctx: Context) => {
      await requireAdmin(ctx);
      const v = Math.min(2, Math.max(0, Number(value)));
      if (!Number.isFinite(v)) throw new Error("Temperature must be a number between 0 and 2.");
      await ctx.prisma.appSetting.upsert({
        where: { key: "geminiTemperature" },
        create: { key: "geminiTemperature", value: String(v) },
        update: { value: String(v) },
      });
      return v;
    },

    deleteFortuneDraft: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      const userId = await requireAuth(ctx);
      const row = await ctx.prisma.fortuneDraft.findUnique({ where: { id } });
      if (!row) return false;
      const me = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!isSuperAdminUser(me) && row.createdById !== userId) throw new Error("Forbidden: only the creator or a super admin can delete this draft.");
      await ctx.prisma.fortuneDraft.delete({ where: { id } });
      return true;
    },
  },

  FortuneDraftEntry: {
    createdAt: (d: any) => (d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt),
    updatedAt: (d: any) => (d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt),
  },
  FortuneHistoryEntry: {
    byId: (h: any) => h.actorId,
    byName: (h: any) => h.actorName,
    createdAt: (h: any) => (h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt),
  },
};
