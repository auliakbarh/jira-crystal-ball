import { GraphQLScalarType, Kind } from "graphql";
import { Context, requireAuth, requireAdmin } from "./context.js";
import { hashPassword, verifyPassword, signToken } from "./auth.js";
import {
  fetchBoardIssues,
  fetchActiveSprintIssues,
  fetchActiveSprintInfo,
  testConnection,
  listFields,
} from "./jira.js";
import { env, hasJiraCreds } from "./env.js";
import { assertNotLocked, recordFailure, recordSuccess } from "./rateLimit.js";
import { pubsub, standupTopic, publishStandupChange } from "./pubsub.js";
import { createPage, updatePage, escapeHtml, confluenceConfigured } from "./confluence.js";

// Build a JIRA client config from the global env credentials plus a squad's
// board id (or the env fallback). Returns null when credentials are missing.
function clampPct(v: unknown): number {
  return typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

// A standup session is considered live if its heartbeat is recent. After this
// the lead is assumed gone (tab closed / logged out) and others may take over.
const STANDUP_STALE_MS = 20_000;
function sessionLive(s: { lastSeen: Date } | null): boolean {
  return !!s && Date.now() - new Date(s.lastSeen).getTime() < STANDUP_STALE_MS;
}

// Write a StandupLog row for a finishing session, then remove the session.
async function finalizeStandup(ctx: Context, session: any, endedAt: Date) {
  const sprint = await ctx.prisma.sprint.findUnique({ where: { id: session.sprintId } });
  const started = new Date(session.createdAt);
  const durationSec = Math.max(0, Math.round((endedAt.getTime() - started.getTime()) / 1000));
  if (sprint) {
    await ctx.prisma.standupLog.create({
      data: {
        squadId: sprint.squadId,
        sprintId: session.sprintId,
        leadName: session.leadName,
        startedAt: started,
        endedAt,
        durationSec,
      },
    });
  }
  await ctx.prisma.standupSession.deleteMany({ where: { sprintId: session.sprintId } });
}

async function isAdminUser(ctx: Context): Promise<boolean> {
  if (!ctx.userId || ctx.userId === "guest") return false;
  const u = await ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
  return !!u?.isAdmin;
}

function jiraCfgForBoard(squad?: { defaultBoardId?: string | null; spFieldDefault?: string | null; spFieldFE?: string | null; spFieldBE?: string | null; spFieldQA?: string | null } | null) {
  if (!hasJiraCreds()) return null;
  return {
    baseUrl: env.jira.baseUrl,
    email: env.jira.email,
    apiToken: env.jira.apiToken,
    boardId: (squad?.defaultBoardId && squad.defaultBoardId.trim()) || env.jira.defaultBoardId || "",
    jql: env.jira.jql || null,
    spFields: {
      default: squad?.spFieldDefault || env.jira.storyPointsField || null,
      fe: squad?.spFieldFE || null,
      be: squad?.spFieldBE || null,
      qa: squad?.spFieldQA || null,
    },
  };
}

// ---- Date scalar: serialize Date <-> "YYYY-MM-DD" -------------------------
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseISODate(s: string): Date {
  // Treat input as a calendar date (UTC midnight) to avoid TZ drift.
  return new Date(`${s}T00:00:00.000Z`);
}

const DateScalar = new GraphQLScalarType({
  name: "Date",
  description: "Calendar date in YYYY-MM-DD form",
  serialize(value) {
    if (value instanceof Date) return toISODate(value);
    if (typeof value === "string") return value.slice(0, 10);
    throw new Error("Date must be a Date or string");
  },
  parseValue(value) {
    if (typeof value !== "string") throw new Error("Date must be a string");
    return parseISODate(value);
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new Error("Date must be a string literal");
    return parseISODate(ast.value);
  },
});

export const resolvers = {
  Date: DateScalar,

  Query: {
    // Unauthenticated health/status check.
    health: async (_p: unknown, _a: unknown, ctx: Context) => {
      let database = false;
      try {
        await ctx.prisma.$queryRaw`SELECT 1`;
        database = true;
      } catch {
        database = false;
      }
      const jira = hasJiraCreds();
      return { ok: database, database, jira, time: new Date().toISOString() };
    },

    me: async (_p: unknown, _a: unknown, ctx: Context) => {
      if (!ctx.userId) return null;
      return ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
    },

    jiraEnv: (_p: unknown, _a: unknown, ctx: Context) => {
      requireAuth(ctx);
      return {
        configured: hasJiraCreds(),
        baseUrl: env.jira.baseUrl || null,
        email: env.jira.email || null,
        defaultBoardId: env.jira.defaultBoardId || null,
      };
    },

    squads: (_p: unknown, _a: unknown, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.squad.findMany({ orderBy: { name: "asc" } });
    },

    squad: (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.squad.findUnique({ where: { id } });
    },

    sprints: (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.sprint.findMany({
        where: { squadId },
        orderBy: { number: "desc" },
      });
    },

    currentSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const today = parseISODate(toISODate(new Date()));
      const active = await ctx.prisma.sprint.findFirst({
        where: { squadId, startDate: { lte: today }, endDate: { gte: today } },
        orderBy: { number: "desc" },
      });
      if (active) return active;
      // Fall back to the latest sprint.
      return ctx.prisma.sprint.findFirst({ where: { squadId }, orderBy: { number: "desc" } });
    },

    boardTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      // Board id is optional: with neither a board id nor a JQL there's nothing to query.
      if (!cfg.boardId && !cfg.jql) return [];
      return fetchBoardIssues(cfg, { force: !!refresh });
    },

    activeSprintTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return []; // active-sprint lookup needs a board id
      return fetchActiveSprintIssues(cfg, { force: !!refresh });
    },

    jiraActiveSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return null;
      return fetchActiveSprintInfo(cfg);
    },

    standupEntries: (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.standupEntry.findMany({
        where: { sprintId },
        orderBy: [{ date: "asc" }, { ticketKey: "asc" }],
      });
    },

    // Dashboard rows for a sprint+date. Merges the board's ACTIVE-sprint tickets
    // (so statuses match the board exactly) with any saved entries, so the lead
    // sees every ticket — even untouched ones.
    dashboard: async (
      _p: unknown,
      { sprintId, date }: { sprintId: string; date?: Date },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new Error("Sprint not found");
      const targetDate = date ?? parseISODate(toISODate(new Date()));

      const entries = await ctx.prisma.standupEntry.findMany({
        where: { sprintId, date: targetDate },
      });

      let tickets: Awaited<ReturnType<typeof fetchActiveSprintIssues>> = [];
      const squad = await ctx.prisma.squad.findUnique({ where: { id: sprint.squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (cfg && cfg.boardId) {
        try {
          // Pull the active sprint's issues so the dashboard reflects the board's
          // current sprint (all statuses: To Do / In Progress / Done / etc.).
          tickets = await fetchActiveSprintIssues(cfg);
        } catch {
          tickets = [];
        }
      } else if (cfg && cfg.jql) {
        try {
          tickets = await fetchBoardIssues(cfg);
        } catch {
          tickets = [];
        }
      }

      const byKey = new Map<string, any>();
      for (const t of tickets) byKey.set(t.key, { date: targetDate, ticket: t, entry: null });
      for (const e of entries) {
        const existing = byKey.get(e.ticketKey);
        if (existing) existing.entry = e;
        else byKey.set(e.ticketKey, { date: targetDate, ticket: null, entry: e });
      }
      return Array.from(byKey.values());
    },

    blockers: (
      _p: unknown,
      { squadId, includeResolved }: { squadId: string; includeResolved?: boolean },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      return ctx.prisma.blocker.findMany({
        where: { squadId, ...(includeResolved ? {} : { resolvedDate: null }) },
        orderBy: { foundDate: "desc" },
      });
    },

    activityLog: (
      _p: unknown,
      { squadId, limit, offset, search }: { squadId: string; limit?: number; offset?: number; search?: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const q = (search ?? "").trim();
      const like = { contains: q, mode: "insensitive" as const };
      return ctx.prisma.activityLog.findMany({
        where: {
          squadId,
          ...(q
            ? {
                OR: [
                  { actor: like },
                  { ticketKey: like },
                  { message: like },
                  { prevText: like },
                  { newText: like },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        skip: Math.max(0, offset ?? 0),
        take: Math.min(limit ?? 20, 100),
      });
    },

    activeStandup: async (_p: unknown, { sprintId, leadKey }: { sprintId: string; leadKey?: string }, ctx: Context) => {
      requireAuth(ctx);
      const s = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (!s) return null;
      if (!sessionLive(s)) {
        // Lead vanished (tab closed / crash) — log the session and clear it.
        await finalizeStandup(ctx, s, new Date(s.lastSeen));
        return null;
      }
      return {
        sprintId,
        leadName: s.leadName,
        active: true,
        isMine: !!leadKey && leadKey === s.leadKey,
        startedAt: new Date(s.createdAt).toISOString(),
      };
    },

    standupLogs: (_p: unknown, { squadId, limit, offset }: { squadId: string; limit?: number; offset?: number }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.standupLog.findMany({
        where: { squadId },
        orderBy: { startedAt: "desc" },
        skip: Math.max(0, offset ?? 0),
        take: Math.min(limit ?? 20, 100),
      });
    },

    exportHistory: (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.exportLog.findMany({ where: { sprintId }, orderBy: { createdAt: "desc" }, take: 50 });
    },

    jiraFields: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      return listFields(cfg);
    },
  },

  Mutation: {
    login: async (_p: unknown, { email, password }: { email: string; password: string }, ctx: Context) => {
      const key = email.toLowerCase().trim();
      assertNotLocked(key); // brute-force throttle
      const user = await ctx.prisma.user.findUnique({ where: { email: key } });
      const ok = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!ok) {
        recordFailure(key);
        throw new Error("Invalid email or password");
      }
      recordSuccess(key);
      return { token: signToken({ userId: user!.id, email: user!.email, name: user!.name }), user };
    },

    guestLogin: (_p: unknown, { name }: { name: string }, _ctx: Context) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      // No DB user; the token carries a synthetic guest identity (non-admin).
      const user = {
        id: "guest",
        email: "guest@local",
        name: trimmed,
        isAdmin: false,
        isGuest: true,
      };
      return { token: signToken({ userId: "guest", email: "guest@local", name: trimmed }), user };
    },

    createSquad: (_p: unknown, { name, defaultBoardId }: { name: string; defaultBoardId?: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.squad.create({ data: { name, defaultBoardId: defaultBoardId ?? null } });
    },

    updateSquad: async (_p: unknown, args: any, ctx: Context) => {
      requireAuth(ctx);
      const { id, name, defaultBoardId, spFieldDefault, spFieldFE, spFieldBE, spFieldQA } = args;
      const squad = await ctx.prisma.squad.findUnique({ where: { id } });
      if (!squad) throw new Error("Squad not found — it may have been deleted. Reselect a squad.");
      const trimOrNull = (v?: string) => (v !== undefined ? v.trim() || null : undefined);
      return ctx.prisma.squad.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(defaultBoardId !== undefined ? { defaultBoardId: trimOrNull(defaultBoardId) } : {}),
          ...(spFieldDefault !== undefined ? { spFieldDefault: trimOrNull(spFieldDefault) } : {}),
          ...(spFieldFE !== undefined ? { spFieldFE: trimOrNull(spFieldFE) } : {}),
          ...(spFieldBE !== undefined ? { spFieldBE: trimOrNull(spFieldBE) } : {}),
          ...(spFieldQA !== undefined ? { spFieldQA: trimOrNull(spFieldQA) } : {}),
        },
      });
    },

    deleteSquad: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.squad.delete({ where: { id } });
      return true;
    },

    testJiraConfig: async (_p: unknown, _a: unknown, ctx: Context) => {
      requireAuth(ctx);
      const cfg = jiraCfgForBoard(undefined);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      return testConnection(cfg);
    },

    addMember: (_p: unknown, { squadId, input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.teamMember.create({ data: { squadId, ...input } });
    },

    updateMember: (_p: unknown, { id, input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.teamMember.update({ where: { id }, data: input });
    },

    deleteMember: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.teamMember.delete({ where: { id } });
      return true;
    },

    addLeave: (_p: unknown, { input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.leave.create({ data: { ...input, type: input.type ?? "CUTI" } });
    },

    deleteLeave: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.leave.delete({ where: { id } });
      return true;
    },

    addHoliday: (_p: unknown, { squadId, input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.holiday.create({ data: { squadId, ...input } });
    },

    deleteHoliday: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.holiday.delete({ where: { id } });
      return true;
    },

    createSprint: (_p: unknown, { squadId, input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.sprint.create({ data: { squadId, ...input } });
    },

    updateSprint: (_p: unknown, { id, input }: any, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.sprint.update({ where: { id }, data: input });
    },

    deleteSprint: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.sprint.delete({ where: { id } });
      return true;
    },

    syncActiveSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      if (!squad) throw new Error("Squad not found");
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) throw new Error("This squad has no board id — set one in Settings.");

      const info = await fetchActiveSprintInfo(cfg, { force: true });
      if (!info) return null; // no active sprint on the board

      const number = info.number ?? info.id;
      const today = toISODate(new Date());
      const startDate = parseISODate(info.startDate ?? today);
      const endDate = parseISODate(info.endDate ?? today);

      // Upsert by (squad, number) so re-syncing refreshes dates/name.
      return ctx.prisma.sprint.upsert({
        where: { squadId_number: { squadId, number } },
        create: { squadId, number, name: info.name, startDate, endDate },
        update: { name: info.name, startDate, endDate },
      });
    },

    startStandup: async (_p: unknown, { sprintId, leadName, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const admin = await isAdminUser(ctx);
      const existing = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (existing && !sessionLive(existing)) {
        // Previous lead is gone — close out their session before claiming.
        await finalizeStandup(ctx, existing, new Date(existing.lastSeen));
      } else if (sessionLive(existing) && existing!.leadKey !== leadKey) {
        // Someone else is actively leading and we're not them.
        if (!admin) throw new Error(`Standup already led by ${existing!.leadName}`);
        // Admin takes over: log the previous lead's session first.
        await finalizeStandup(ctx, existing, new Date());
      }
      const now = new Date();
      const s = await ctx.prisma.standupSession.upsert({
        where: { sprintId },
        create: { sprintId, leadName, leadKey, lastSeen: now },
        update: { leadName, leadKey, lastSeen: now },
      });
      publishStandupChange(sprintId, "start");
      return { sprintId, leadName: s.leadName, active: true, isMine: true, startedAt: new Date(s.createdAt).toISOString() };
    },

    standupHeartbeat: async (_p: unknown, { sprintId, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const r = await ctx.prisma.standupSession.updateMany({
        where: { sprintId, leadKey },
        data: { lastSeen: new Date() },
      });
      return r.count > 0;
    },

    endStandup: async (_p: unknown, { sprintId, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const admin = await isAdminUser(ctx);
      const s = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (!s) return true;
      // Only the holder or an admin may end it.
      if (s.leadKey !== leadKey && !admin) return false;
      await finalizeStandup(ctx, s, new Date());
      publishStandupChange(sprintId, "end");
      return true;
    },

    // Upsert a standup cell-set and keep the Blocker section in sync.
    saveStandupEntry: async (_p: unknown, { input, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: input.sprintId } });
      if (!sprint) throw new Error("Sprint not found");

      // Standup lock: if a live session leads this sprint, only its holder (by
      // leadKey) or an admin may edit.
      const session = await ctx.prisma.standupSession.findUnique({ where: { sprintId: input.sprintId } });
      if (sessionLive(session) && session!.leadKey !== leadKey && !(await isAdminUser(ctx))) {
        throw new Error(`Standup is being led by ${session!.leadName} — you can't edit now.`);
      }

      // Capture the previous note to log what changed.
      const before = await ctx.prisma.standupEntry.findUnique({
        where: {
          sprintId_date_ticketKey: { sprintId: input.sprintId, date: input.date, ticketKey: input.ticketKey },
        },
      });
      const prevText = before?.updateText ?? "";

      const data = {
        sprintId: input.sprintId,
        date: input.date,
        ticketKey: input.ticketKey,
        ticketStatus: input.ticketStatus ?? null,
        ticketSummary: input.ticketSummary ?? null,
        ticketAssignee: input.ticketAssignee ?? null,
        issueType: input.issueType ?? null,
        storyPoints: typeof input.storyPoints === "number" ? input.storyPoints : null,
        epicKey: input.epicKey ?? null,
        epicName: input.epicName ?? null,
        parentKey: input.parentKey ?? null,
        parentName: input.parentName ?? null,
        carryOverCount: input.carryOverCount ?? null,
        carryOverFrom: input.carryOverFrom ?? null,
        feAssignee: input.feAssignee ?? null,
        beAssignee: input.beAssignee ?? null,
        qaAssignee: input.qaAssignee ?? null,
        feProgress: clampPct(input.feProgress),
        beProgress: clampPct(input.beProgress),
        qaProgress: clampPct(input.qaProgress),
        updateText: input.updateText ?? "",
        progress: clampPct(input.progress),
        blockerNote: input.blockerNote ?? "",
      };

      const entry = await ctx.prisma.standupEntry.upsert({
        where: {
          sprintId_date_ticketKey: {
            sprintId: input.sprintId,
            date: input.date,
            ticketKey: input.ticketKey,
          },
        },
        create: data,
        update: data,
      });

      // --- Blocker sync ---
      const note = (data.blockerNote ?? "").trim();
      const linked = await ctx.prisma.blocker.findUnique({ where: { sourceEntryId: entry.id } });
      if (note) {
        const payload = {
          squadId: sprint.squadId,
          sprintId: input.sprintId,
          description: note,
          jiraTicket: input.ticketKey,
          note: `Auto-synced from standup ${toISODate(input.date)}`,
          sourceEntryId: entry.id,
        };
        if (linked) {
          await ctx.prisma.blocker.update({
            where: { id: linked.id },
            data: { description: note, jiraTicket: input.ticketKey },
          });
        } else {
          await ctx.prisma.blocker.create({ data: { ...payload, foundDate: input.date } });
        }
      } else if (linked && !linked.resolvedDate) {
        // Note cleared -> mark the auto-created blocker resolved.
        await ctx.prisma.blocker.update({
          where: { id: linked.id },
          data: { resolvedDate: input.date },
        });
      }

      // --- Activity log ---
      const parts: string[] = [`${data.progress}%`];
      if (note) parts.push("🚧 blocker");
      const roles = [
        data.feAssignee && `FE ${data.feAssignee}`,
        data.beAssignee && `BE ${data.beAssignee}`,
        data.qaAssignee && `QA ${data.qaAssignee}`,
      ].filter(Boolean);
      if (roles.length) parts.push(roles.join(", "));
      const newText = data.updateText ?? "";
      const noteChanged = newText.trim() !== prevText.trim();
      await ctx.prisma.activityLog.create({
        data: {
          squadId: sprint.squadId,
          sprintId: input.sprintId,
          actor: ctx.userName || "Someone",
          ticketKey: input.ticketKey,
          message: `updated ${input.ticketKey} — ${parts.join(" · ")}`,
          prevText: noteChanged ? prevText : null,
          newText: noteChanged ? newText : null,
        },
      });

      publishStandupChange(input.sprintId, "entry");
      return entry;
    },

    upsertBlocker: async (_p: unknown, { squadId, id, input }: any, ctx: Context) => {
      requireAuth(ctx);
      if (id) {
        return ctx.prisma.blocker.update({ where: { id }, data: input });
      }
      return ctx.prisma.blocker.create({ data: { squadId, ...input } });
    },

    deleteBlocker: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.blocker.delete({ where: { id } });
      return true;
    },

    resetDatabase: async (_p: unknown, { reseedDefaults }: { reseedDefaults?: boolean }, ctx: Context) => {
      await requireAdmin(ctx);
      // Deleting squads cascades to members, leaves, holidays, sprints,
      // standup entries and blockers. Users are preserved.
      await ctx.prisma.squad.deleteMany({});
      if (reseedDefaults) {
        const defaults = [
          { name: "Athens", defaultBoardId: "ATH" },
          { name: "Berlin", defaultBoardId: "BER" },
          { name: "Cairo", defaultBoardId: "CAI" },
        ];
        for (const s of defaults) {
          await ctx.prisma.squad.create({ data: s });
        }
      }
      return true;
    },

    exportSprintToConfluence: async (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      if (!confluenceConfigured()) throw new Error("CONFLUENCE_NOT_CONFIGURED");
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new Error("Sprint not found");
      const squad = await ctx.prisma.squad.findUnique({ where: { id: sprint.squadId } });

      const entries = await ctx.prisma.standupEntry.findMany({
        where: { sprintId },
        orderBy: [{ date: "asc" }, { ticketKey: "asc" }],
      });

      // Ticket list is synced from the JIRA board's active sprint (live source of
      // truth); standup updates across the whole sprint range are consolidated
      // onto each ticket below.
      const byKey = new Map<string, any>();
      const cfg = jiraCfgForBoard(squad);
      if (cfg && cfg.boardId) {
        try {
          const board = await fetchActiveSprintIssues(cfg);
          for (const j of board) {
            byKey.set(j.key, {
              key: j.key,
              summary: j.summary,
              status: j.status,
              issueType: j.issueType,
              storyPoints: j.storyPoints,
              spFE: j.storyPointsFE,
              spBE: j.storyPointsBE,
              spQA: j.storyPointsQA,
              parentKey: j.parentKey ?? j.epicKey ?? null,
              parentName: j.parentName ?? j.epicName ?? null,
              fromBoard: true,
              updates: [] as any[],
              blockers: [] as any[],
            });
          }
        } catch {
          /* board unavailable → fall back to entry-derived tickets only */
        }
      }

      // Overlay/append the standup entries (also covers tickets not on the board).
      for (const e of entries) {
        let t = byKey.get(e.ticketKey);
        if (!t) {
          t = { key: e.ticketKey, updates: [], blockers: [] };
          byKey.set(e.ticketKey, t);
        }
        t.summary = t.summary ?? e.ticketSummary;
        t.status = t.status ?? e.ticketStatus;
        t.issueType = t.issueType ?? e.issueType;
        if (t.storyPoints == null && e.storyPoints != null) t.storyPoints = e.storyPoints;
        t.parentKey = t.parentKey ?? e.parentKey;
        t.parentName = t.parentName ?? e.parentName;
        t.progress = e.progress; // entries are date-asc → ends on latest
        if (e.feAssignee) t.fe = e.feAssignee;
        if (e.beAssignee) t.be = e.beAssignee;
        if (e.qaAssignee) t.qa = e.qaAssignee;
        t.feProg = e.feProgress;
        t.beProg = e.beProgress;
        t.qaProg = e.qaProgress;
        if ((e.updateText ?? "").trim()) t.updates.push({ date: toISODate(e.date), text: e.updateText });
        if ((e.blockerNote ?? "").trim()) t.blockers.push({ date: toISODate(e.date), text: e.blockerNote });
      }
      const tickets = Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));

      const done = tickets.filter((t) => /done|closed|resolved/i.test(t.status ?? "")).length;
      const total = tickets.length;
      const carryOver = total - done;
      const jiraBase = env.jira.baseUrl.replace(/\/+$/, "");

      // Confluence "status" lozenge macro, coloured by status bucket.
      const statusLozenge = (status?: string | null) => {
        const s = (status ?? "").toLowerCase();
        let colour = "Grey";
        if (/done|closed|resolved/.test(s)) colour = "Green";
        else if (/qa|review|test/.test(s)) colour = "Yellow";
        else if (/progress|doing|develop/.test(s)) colour = "Blue";
        if (!status) return "";
        return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${escapeHtml(status)}</ac:parameter></ac:structured-macro>`;
      };

      // Merged "Ticket" cell: a native Jira issue macro renders the issue's
      // type icon, key, status and summary live (works on the same Atlassian
      // Cloud site / linked Jira). Falls back to a styled cell when no base URL.
      // Story points merged into the ticket cell: a "N SP" lozenge plus a
      // per-role breakdown (FE/BE/QA) when role fields are configured.
      const spTag = (t: any) => {
        const lines: string[] = [];
        if (t.storyPoints != null) lines.push(`<strong>Story Point:</strong> ${t.storyPoints} SP`);
        if (t.spFE != null) lines.push(`<strong>FE Story Point:</strong> ${t.spFE} SP`);
        if (t.spBE != null) lines.push(`<strong>BE Story Point:</strong> ${t.spBE} SP`);
        if (t.spQA != null) lines.push(`<strong>QA Story Point:</strong> ${t.spQA} SP`);
        if (lines.length === 0) return "";
        return `<p style="color:#6b778c;font-size:12px;">${lines.join("<br/>")}</p>`;
      };
      const ticketCell = (t: any) => {
        if (jiraBase) {
          return `<ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">${escapeHtml(t.key)}</ac:parameter></ac:structured-macro>${spTag(t)}`;
        }
        return `<p><strong>${escapeHtml(t.key)}</strong> ${escapeHtml(t.issueType ?? "")} ${statusLozenge(t.status)}</p><p>${escapeHtml(t.summary ?? "")}</p>${spTag(t)}`;
      };

      // A Done ticket counts as 100% regardless of the logged value.
      const effProgress = (t: any) =>
        /done|closed|resolved/i.test(t.status ?? "") ? 100 : Math.max(0, Math.min(100, t.progress ?? 0));

      const progressCell = (t: any) => {
        const v = effProgress(t);
        const colour = v >= 100 ? "Green" : v >= 50 ? "Blue" : v > 0 ? "Yellow" : "Grey";
        return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${v}%</ac:parameter></ac:structured-macro>`;
      };

      const row = (t: any, n: number) => {
        const updates = t.updates.map((u: any) => `<p><strong>${escapeHtml(u.date.slice(5))}</strong> ${escapeHtml(u.text)}</p>`).join("") || "—";
        const blockers = t.blockers.map((b: any) => `<p>🚧 <strong>${escapeHtml(b.date.slice(5))}</strong> ${escapeHtml(b.text)}</p>`).join("") || "—";
        const pctTag = (p?: number) => (typeof p === "number" ? ` (${p}%)` : "");
        const assignees =
          [
            t.fe && `FE: ${escapeHtml(t.fe)}${pctTag(t.feProg)}`,
            t.be && `BE: ${escapeHtml(t.be)}${pctTag(t.beProg)}`,
            t.qa && `QA: ${escapeHtml(t.qa)}${pctTag(t.qaProg)}`,
          ]
            .filter(Boolean)
            .join("<br/>") || "—";
        return `<tr>
          <td><p>${n}</p></td>
          <td>${ticketCell(t)}</td>
          <td>${assignees}</td>
          <td>${progressCell(t)}</td>
          <td>${updates}</td>
          <td>${blockers}</td>
        </tr>`;
      };

      // Group tickets by parent/story; a ticket with no parent forms its own group.
      const groupsMap = new Map<string, { key: string; parentKey: string | null; tickets: any[] }>();
      for (const t of tickets) {
        const gk = t.parentKey ?? t.key;
        if (!groupsMap.has(gk)) groupsMap.set(gk, { key: gk, parentKey: t.parentKey ?? null, tickets: [] });
        groupsMap.get(gk)!.tickets.push(t);
      }
      const groups = Array.from(groupsMap.values()).sort((a, b) => a.key.localeCompare(b.key));

      const groupHeader = (g: any) => {
        const label = g.parentKey
          ? `<ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">${escapeHtml(g.parentKey)}</ac:parameter></ac:structured-macro>`
          : "<em>No parent</em>";
        return `<tr><td colspan="6" data-highlight-colour="#deebff"><strong>📂 ${label}</strong> <span style="color:#6b778c;">(${g.tickets.length})</span></td></tr>`;
      };

      let rowNo = 0;
      const bodyRows = groups
        .map((g) => groupHeader(g) + g.tickets.map((t: any) => row(t, ++rowNo)).join(""))
        .join("");

      // --- Sprint status distribution ---
      const bucket = (s?: string | null) => {
        const x = (s ?? "").toLowerCase();
        if (/done|closed|resolved/.test(x)) return "Done";
        if (/qa|review|test/.test(x)) return "In QA";
        if (/progress|doing|develop/.test(x)) return "In Progress";
        return "To Do";
      };
      const dist: Record<string, number> = { Done: 0, "In QA": 0, "In Progress": 0, "To Do": 0 };
      for (const t of tickets) dist[bucket(t.status)]++;

      // Story points: total, done, and per-member (attributed to each assignee).
      const sp = (t: any) => (typeof t.storyPoints === "number" ? t.storyPoints : 0);
      const totalSP = tickets.reduce((s: number, t: any) => s + sp(t), 0);
      const doneSP = tickets.filter((t) => bucket(t.status) === "Done").reduce((s: number, t: any) => s + sp(t), 0);
      // Per-member SP: use the role-specific field for that member's role when
      // configured; fall back to the ticket's default SP otherwise.
      const num = (x: any) => (typeof x === "number" ? x : 0);
      const spByMember = new Map<string, number>();
      const addSP = (name: string | undefined, pts: number) => {
        if (!name || !pts) return;
        spByMember.set(name, (spByMember.get(name) ?? 0) + pts);
      };
      for (const t of tickets) {
        addSP(t.fe, t.spFE != null ? num(t.spFE) : sp(t));
        addSP(t.be, t.spBE != null ? num(t.spBE) : sp(t));
        addSP(t.qa, t.spQA != null ? num(t.spQA) : sp(t));
      }

      // --- Manpower (leave) summary within the sprint range ---
      const members = await ctx.prisma.teamMember.findMany({
        where: { squadId: sprint.squadId },
        include: { leaves: { include: { substitute: true } } },
      });
      const holidays = await ctx.prisma.holiday.findMany({ where: { squadId: sprint.squadId } });
      const holidaySet = new Set(holidays.map((h) => toISODate(h.date)));
      const startISO = toISODate(sprint.startDate);
      const endISO = toISODate(sprint.endDate);
      const workingDays = (aISO: string, bISO: string): number => {
        let n = 0;
        const cur = new Date(`${aISO}T00:00:00.000Z`);
        const end = new Date(`${bISO}T00:00:00.000Z`);
        for (let i = 0; i < 400 && cur <= end; i++) {
          const iso = cur.toISOString().slice(0, 10);
          const dow = cur.getUTCDay();
          if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) n++;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        return n;
      };
      const LEAVE_LABEL: Record<string, string> = { CUTI: "Annual Leave", SAKIT: "Sick", IZIN: "Permission" };
      const LEAVE_COLOUR: Record<string, string> = { CUTI: "Red", SAKIT: "Yellow", IZIN: "Blue" };
      const manpower = { CUTI: 0, SAKIT: 0, IZIN: 0 };
      let availableCount = 0;
      const sprintDays = workingDays(startISO, endISO);

      // Per-member roster row: position + leave status (within the sprint range).
      const rosterRows: string[] = [];
      for (const m of members) {
        const overlapping = m.leaves.filter((l) => {
          const ls = toISODate(l.startDate);
          const le = toISODate(l.endDate);
          return !(ls > endISO || le < startISO);
        });
        let statusCell: string;
        if (overlapping.length === 0) {
          availableCount++;
          statusCell = `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Green</ac:parameter><ac:parameter ac:name="title">Available</ac:parameter></ac:structured-macro>`;
        } else {
          const parts: string[] = [];
          for (const l of overlapping) {
            const ls = toISODate(l.startDate);
            const le = toISODate(l.endDate);
            const os = ls > startISO ? ls : startISO;
            const oe = le < endISO ? le : endISO;
            const days = workingDays(os, oe);
            const type = (l.type as string) ?? "CUTI";
            if (type in manpower) (manpower as any)[type] += 1;
            const sub = type === "CUTI" && l.substitute ? ` · cover: <strong>${escapeHtml(l.substitute.name)}</strong>` : "";
            parts.push(
              `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${LEAVE_COLOUR[type] ?? "Grey"}</ac:parameter><ac:parameter ac:name="title">${LEAVE_LABEL[type] ?? type}</ac:parameter></ac:structured-macro> ${days}d${sub}`,
            );
          }
          statusCell = parts.join("<br/>");
        }
        const memberSP = spByMember.get(m.name) ?? 0;
        rosterRows.push(
          `<tr><td><strong>${escapeHtml(m.name)}</strong></td><td>${escapeHtml(m.position)}</td><td>${memberSP} SP</td><td>${statusCell}</td></tr>`,
        );
      }

      // Sprint progress: average of ticket progress.
      const avgProgress = total
        ? Math.round(tickets.reduce((s: number, t: any) => s + effProgress(t), 0) / total)
        : 0;

      const html = `
        <h2>${escapeHtml(squad?.name ?? "Squad")} — Sprint ${sprint.number}${sprint.name ? ` (${escapeHtml(sprint.name)})` : ""}</h2>
        <p><strong>Range:</strong> ${startISO} → ${endISO} &nbsp;·&nbsp; ${sprintDays} working days</p>
        <table data-table-width="760">
          <colgroup><col style="width: 90.0px"/><col style="width: 80.0px"/><col style="width: 80.0px"/><col style="width: 110.0px"/><col style="width: 80.0px"/><col style="width: 100.0px"/><col style="width: 110.0px"/><col style="width: 110.0px"/></colgroup>
          <tbody>
            <tr>
              <th>Tickets</th><th>Done</th><th>In QA</th><th>In Progress</th><th>To Do</th>
              <th>Carry-over</th><th>Avg Progress</th><th>Story Points</th>
            </tr>
            <tr>
              <td><strong>${total}</strong> tickets</td>
              <td>${dist.Done} tickets</td>
              <td>${dist["In QA"]} tickets</td>
              <td>${dist["In Progress"]} tickets</td>
              <td>${dist["To Do"]} tickets</td>
              <td>${carryOver} tickets</td>
              <td><strong>${avgProgress}%</strong></td>
              <td><strong>${doneSP}</strong> / ${totalSP} SP</td>
            </tr>
          </tbody>
        </table>
        <p><em>Counts are ticket counts · <strong>Avg Progress</strong> = average ticket progress percentage (mean of each ticket's % done) · <strong>Story Points</strong> = done / total SP · <strong>Carry-over</strong> = tickets not Done (roll to next sprint).</em></p>

        <h3>📈 Sprint progress</h3>
        ${(() => {
          const LEGEND: Record<string, string> = {
            Done: "Green",
            "In QA": "Yellow",
            "In Progress": "Blue",
            "To Do": "Grey",
          };
          const segs = [
            { label: "Done", n: dist.Done, colour: "#36b37e" },
            { label: "In QA", n: dist["In QA"], colour: "#ffab00" },
            { label: "In Progress", n: dist["In Progress"], colour: "#4c9aff" },
            { label: "To Do", n: dist["To Do"], colour: "#c1c7d0" },
          ].filter((s) => s.n > 0);
          if (!total || segs.length === 0) return "<p>No tickets.</p>";
          const pct = (n: number) => Math.round((n / total) * 100);
          // Proportional bar in PIXELS (Confluence ignores % col widths).
          const BAR_W = 680;
          const cols = segs.map((s) => `<col style="width: ${Math.max(Math.round((s.n / total) * BAR_W), 8)}.0px" />`).join("");
          const cells = segs.map((s) => `<td data-highlight-colour="${s.colour}"><p>&nbsp;</p></td>`).join("");
          // Legend on one line below the bar.
          const legend = segs
            .map(
              (s) =>
                `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${LEGEND[s.label]}</ac:parameter><ac:parameter ac:name="title">${escapeHtml(s.label)} ${s.n} (${pct(s.n)}%)</ac:parameter></ac:structured-macro>`,
            )
            .join(" ");
          return `<table data-table-width="680"><colgroup>${cols}</colgroup><tbody><tr>${cells}</tr></tbody></table>
            <p>${legend}</p>
            <p>Average ticket progress: <strong>${avgProgress}%</strong></p>`;
        })()}

        <h3>👥 Man-power (this sprint)</h3>
        <p>Available <strong>${availableCount}</strong> · Annual Leave <strong>${manpower.CUTI}</strong> · Sick <strong>${manpower.SAKIT}</strong> · Permission <strong>${manpower.IZIN}</strong> · of ${members.length} member(s)</p>
        ${
          members.length
            ? `<table data-table-width="760">
                 <colgroup><col style="width: 230.0px"/><col style="width: 90.0px"/><col style="width: 110.0px"/><col style="width: 330.0px"/></colgroup>
                 <tbody>
                   <tr><th>Member</th><th>Role</th><th>Story Points</th><th>Status (this sprint)</th></tr>
                   ${rosterRows.join("")}
                 </tbody>
               </table>`
            : "<p>No team members configured.</p>"
        }
        <h3>📋 Tickets</h3>
        <table data-table-width="800">
          <colgroup><col style="width: 40.0px"/><col style="width: 170.0px"/><col style="width: 120.0px"/><col style="width: 95.0px"/><col style="width: 245.0px"/><col style="width: 130.0px"/></colgroup>
          <tbody>
            <tr>
              <th>No</th><th>Ticket</th><th>Assignees</th><th>Progress</th><th>Updates</th><th>Blockers</th>
            </tr>
            ${bodyRows}
          </tbody>
        </table>
        <p><em>Generated by JIRA Crystal Ball — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.</em></p>`;

      // Clean title "<Squad> - Sprint (<Sprint name>)". Re-export updates the same
      // page (title kept). On first create, if the title already exists in the
      // space, retry once with a timestamp suffix to stay unique.
      const sprintLabel = sprint.name ? `Sprint (${sprint.name})` : `Sprint ${sprint.number}`;
      const title = `${squad?.name ?? "Squad"} - ${sprintLabel}`;

      const isUpdate = !!sprint.confluencePageId;
      let page;
      if (isUpdate) {
        page = await updatePage(sprint.confluencePageId!, title, html);
      } else {
        try {
          page = await createPage(title, html);
        } catch (e: any) {
          if (/title|already exists|400|409/i.test(e?.message ?? "")) {
            const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
            page = await createPage(`${title} - ${stamp}`, html);
          } else {
            throw e;
          }
        }
      }

      await ctx.prisma.sprint.update({
        where: { id: sprintId },
        data: {
          confluencePageId: page.id,
          confluenceUrl: page.url,
          confluenceExportedAt: new Date(),
        },
      });
      await ctx.prisma.exportLog.create({
        data: {
          sprintId,
          squadId: sprint.squadId,
          pageId: page.id,
          url: page.url,
          action: isUpdate ? "update" : "create",
          actor: ctx.userName ?? null,
        },
      });
      return page;
    },
  },

  Subscription: {
    standupChanged: {
      subscribe: (_p: unknown, { sprintId }: { sprintId: string }) =>
        pubsub.asyncIterableIterator(standupTopic(sprintId)),
    },
  },

  // ---- Field resolvers ----
  Squad: {
    members: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.teamMember.findMany({ where: { squadId: s.id }, orderBy: { name: "asc" } }),
    sprints: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.sprint.findMany({ where: { squadId: s.id }, orderBy: { number: "desc" } }),
    holidays: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.holiday.findMany({ where: { squadId: s.id }, orderBy: { date: "asc" } }),
    // Credentials are global (env); a squad is "configured" when env creds exist.
    jiraConfigured: () => hasJiraCreds(),
  },

  ActivityLog: {
    createdAt: (l: any) => (l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt),
  },

  StandupLog: {
    startedAt: (l: any) => (l.startedAt instanceof Date ? l.startedAt.toISOString() : l.startedAt),
    endedAt: (l: any) => (l.endedAt instanceof Date ? l.endedAt.toISOString() : l.endedAt),
  },

  ExportLog: {
    createdAt: (l: any) => (l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt),
  },

  Sprint: {
    confluenceExportedAt: (s: any) =>
      s.confluenceExportedAt instanceof Date ? s.confluenceExportedAt.toISOString() : s.confluenceExportedAt ?? null,
  },

  TeamMember: {
    leaves: (m: any, _a: unknown, ctx: Context) =>
      ctx.prisma.leave.findMany({ where: { memberId: m.id }, orderBy: { startDate: "desc" } }),
  },

  Leave: {
    member: (l: any, _a: unknown, ctx: Context) =>
      ctx.prisma.teamMember.findUnique({ where: { id: l.memberId } }),
    substitute: (l: any, _a: unknown, ctx: Context) =>
      l.substituteId ? ctx.prisma.teamMember.findUnique({ where: { id: l.substituteId } }) : null,
  },
};
