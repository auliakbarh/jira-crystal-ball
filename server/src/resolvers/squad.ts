// Auth, squads, sprints, members, leaves, holidays, and JIRA board queries.
import type { Context } from "../context.js";
import { requireAuth, requireAdmin } from "../context.js";
import { verifyPassword, signToken } from "../auth.js";
import { env, hasJiraCreds } from "../env.js";
import { assertNotLocked, recordFailure, recordSuccess } from "../rateLimit.js";
import {
  fetchBoardIssues,
  fetchActiveSprintIssues,
  fetchActiveSprintInfo,
  fetchNextSprintIssues,
  fetchNextSprintInfo,
  testConnection,
  listFields,
  listUsers,
} from "../jira.js";
import { jiraCfgForBoard, toISODate, parseISODate } from "./shared.js";

export const squadResolvers = {
  Query: {
    health: async (_p: unknown, _a: unknown, ctx: Context) => {
      let database = false;
      try {
        await ctx.prisma.$queryRaw`SELECT 1`;
        database = true;
      } catch {
        database = false;
      }
      return { ok: database, database, jira: hasJiraCreds(), time: new Date().toISOString() };
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
      return ctx.prisma.sprint.findMany({ where: { squadId }, orderBy: { number: "desc" } });
    },

    currentSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const today = parseISODate(toISODate(new Date()));
      const active = await ctx.prisma.sprint.findFirst({
        where: { squadId, startDate: { lte: today }, endDate: { gte: today } },
        orderBy: { number: "desc" },
      });
      if (active) return active;
      return ctx.prisma.sprint.findFirst({ where: { squadId }, orderBy: { number: "desc" } });
    },

    boardTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId && !cfg.jql) return [];
      return fetchBoardIssues(cfg, { force: !!refresh });
    },

    activeSprintTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return [];
      return fetchActiveSprintIssues(cfg, { force: !!refresh });
    },

    nextSprintTickets: async (_p: unknown, { squadId, refresh }: { squadId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return [];
      return fetchNextSprintIssues(cfg, { force: !!refresh });
    },

    jiraActiveSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return null;
      return fetchActiveSprintInfo(cfg);
    },

    jiraNextSprint: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      if (!cfg.boardId) return null;
      return fetchNextSprintInfo(cfg);
    },

    jiraFields: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      return listFields(cfg);
    },

    jiraUsers: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg) throw new Error("JIRA_NOT_CONFIGURED");
      return listUsers(cfg);
    },

    // Public (no auth): distinct member names across all squads, for the
    // guest-login name suggestion. Deduped by name, full name kept for context.
    memberSuggestions: async (_p: unknown, _a: unknown, ctx: Context) => {
      const members = await ctx.prisma.teamMember.findMany({
        select: { name: true, fullName: true },
        orderBy: { name: "asc" },
      });
      const seen = new Set<string>();
      const out: { name: string; fullName: string | null }[] = [];
      for (const m of members) {
        const key = m.name.trim();
        if (!key || seen.has(key.toLowerCase())) continue;
        seen.add(key.toLowerCase());
        out.push({ name: key, fullName: m.fullName });
      }
      return out;
    },
  },

  Mutation: {
    login: async (_p: unknown, { email, password }: { email: string; password: string }, ctx: Context) => {
      const key = email.toLowerCase().trim();
      assertNotLocked(key);
      const user = await ctx.prisma.user.findUnique({ where: { email: key } });
      const ok = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!ok) {
        recordFailure(key);
        throw new Error("Invalid email or password");
      }
      recordSuccess(key);
      return { token: signToken({ userId: user!.id, email: user!.email, name: user!.name }), user };
    },

    guestLogin: (_p: unknown, { name }: { name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const user = { id: "guest", email: "guest@local", name: trimmed, isAdmin: false, isGuest: true };
      return { token: signToken({ userId: "guest", email: "guest@local", name: trimmed }), user };
    },

    createSquad: (_p: unknown, { name, defaultBoardId }: { name: string; defaultBoardId?: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.squad.create({ data: { name, defaultBoardId: defaultBoardId ?? null } });
    },

    updateSquad: async (_p: unknown, args: any, ctx: Context) => {
      requireAuth(ctx);
      const { id, name, defaultBoardId, spFieldDefault, spFieldFE, spFieldBE, spFieldQA, confluenceSpaceKey, confluenceParentId, tarotScaleType, tarotScaleValues } = args;
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
          ...(confluenceSpaceKey !== undefined ? { confluenceSpaceKey: trimOrNull(confluenceSpaceKey) } : {}),
          ...(confluenceParentId !== undefined ? { confluenceParentId: trimOrNull(confluenceParentId) } : {}),
          ...(tarotScaleType !== undefined ? { tarotScaleType: (trimOrNull(tarotScaleType) as any) } : {}),
          ...(tarotScaleValues !== undefined ? { tarotScaleValues: trimOrNull(tarotScaleValues) } : {}),
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
      if (!info) return null;
      const number = info.number ?? info.id;
      const today = toISODate(new Date());
      const startDate = parseISODate(info.startDate ?? today);
      const endDate = parseISODate(info.endDate ?? today);
      return ctx.prisma.sprint.upsert({
        where: { squadId_number: { squadId, number } },
        create: { squadId, number, name: info.name, startDate, endDate },
        update: { name: info.name, startDate, endDate },
      });
    },

    resetDatabase: async (_p: unknown, { reseedDefaults }: { reseedDefaults?: boolean }, ctx: Context) => {
      await requireAdmin(ctx);
      await ctx.prisma.squad.deleteMany({});
      if (reseedDefaults) {
        for (const s of [
          { name: "Athens", defaultBoardId: "ATH" },
          { name: "Berlin", defaultBoardId: "BER" },
          { name: "Cairo", defaultBoardId: "CAI" },
        ]) {
          await ctx.prisma.squad.create({ data: s });
        }
      }
      return true;
    },
  },
};
