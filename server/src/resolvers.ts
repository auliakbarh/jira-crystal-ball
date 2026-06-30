import { GraphQLScalarType, Kind } from "graphql";
import { Context, requireAuth, requireAdmin } from "./context.js";
import { hashPassword, verifyPassword, signToken } from "./auth.js";
import {
  fetchBoardIssues,
  fetchActiveSprintIssues,
  fetchActiveSprintInfo,
  testConnection,
} from "./jira.js";
import { env, hasJiraCreds } from "./env.js";
import { assertNotLocked, recordFailure, recordSuccess } from "./rateLimit.js";
import { pubsub, standupTopic, publishStandupChange } from "./pubsub.js";

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

function jiraCfgForBoard(boardId?: string | null) {
  if (!hasJiraCreds()) return null;
  return {
    baseUrl: env.jira.baseUrl,
    email: env.jira.email,
    apiToken: env.jira.apiToken,
    boardId: (boardId && boardId.trim()) || env.jira.defaultBoardId || "",
    jql: env.jira.jql || null,
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
      const cfg = jiraCfgForBoard(squad?.defaultBoardId);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      // Board id is optional: with neither a board id nor a JQL there's nothing to query.
      if (!cfg.boardId && !cfg.jql) return [];
      return fetchBoardIssues(cfg, { force: !!refresh });
    },

    activeSprintTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad?.defaultBoardId);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return []; // active-sprint lookup needs a board id
      return fetchActiveSprintIssues(cfg, { force: !!refresh });
    },

    jiraActiveSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad?.defaultBoardId);
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
      const cfg = jiraCfgForBoard(squad?.defaultBoardId);
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

    updateSquad: async (
      _p: unknown,
      { id, name, defaultBoardId }: { id: string; name?: string; defaultBoardId?: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id } });
      if (!squad) throw new Error("Squad not found — it may have been deleted. Reselect a squad.");
      return ctx.prisma.squad.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          // Empty string clears the board id (it's optional).
          ...(defaultBoardId !== undefined ? { defaultBoardId: defaultBoardId.trim() || null } : {}),
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
      const cfg = jiraCfgForBoard(null);
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
      const cfg = jiraCfgForBoard(squad.defaultBoardId);
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
