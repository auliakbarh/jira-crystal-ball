// Standup entries, dashboard, blockers, activity log, and the session lock.
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { fetchActiveSprintIssues, fetchBoardIssues } from "../jira.js";
import { pubsub, standupTopic, publishStandupChange } from "../pubsub.js";
import { jiraCfgForBoard, toISODate, parseISODate, clampPct, sessionLive, finalizeStandup, isAdminUser } from "./shared.js";

export const standupResolvers = {
  Query: {
    standupEntries: (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.standupEntry.findMany({
        where: { sprintId },
        orderBy: [{ date: "asc" }, { ticketKey: "asc" }],
      });
    },

    // Merges the board's active-sprint tickets (live statuses) with saved entries.
    dashboard: async (_p: unknown, { sprintId, date }: { sprintId: string; date?: Date }, ctx: Context) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new Error("Sprint not found");
      const targetDate = date ?? parseISODate(toISODate(new Date()));

      const entries = await ctx.prisma.standupEntry.findMany({ where: { sprintId, date: targetDate } });

      let tickets: Awaited<ReturnType<typeof fetchActiveSprintIssues>> = [];
      const squad = await ctx.prisma.squad.findUnique({ where: { id: sprint.squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (cfg && cfg.boardId) {
        try {
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

    blockers: (_p: unknown, { squadId, includeResolved }: { squadId: string; includeResolved?: boolean }, ctx: Context) => {
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
          ...(q ? { OR: [{ actor: like }, { ticketKey: like }, { message: like }, { prevText: like }, { newText: like }] } : {}),
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
    startStandup: async (_p: unknown, { sprintId, leadName, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const admin = await isAdminUser(ctx);
      const existing = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (existing && !sessionLive(existing)) {
        await finalizeStandup(ctx, existing, new Date(existing.lastSeen));
      } else if (sessionLive(existing) && existing!.leadKey !== leadKey) {
        if (!admin) throw new Error(`Standup already led by ${existing!.leadName}`);
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
      const r = await ctx.prisma.standupSession.updateMany({ where: { sprintId, leadKey }, data: { lastSeen: new Date() } });
      return r.count > 0;
    },

    endStandup: async (_p: unknown, { sprintId, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const admin = await isAdminUser(ctx);
      const s = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (!s) return true;
      if (s.leadKey !== leadKey && !admin) return false;
      await finalizeStandup(ctx, s, new Date());
      publishStandupChange(sprintId, "end");
      return true;
    },

    // Upsert a standup cell-set and keep the Blocker section + activity log in sync.
    saveStandupEntry: async (_p: unknown, { input, leadKey }: any, ctx: Context) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: input.sprintId } });
      if (!sprint) throw new Error("Sprint not found");

      const session = await ctx.prisma.standupSession.findUnique({ where: { sprintId: input.sprintId } });
      if (sessionLive(session) && session!.leadKey !== leadKey && !(await isAdminUser(ctx))) {
        throw new Error(`Standup is being led by ${session!.leadName} — you can't edit now.`);
      }

      const before = await ctx.prisma.standupEntry.findUnique({
        where: { sprintId_date_ticketKey: { sprintId: input.sprintId, date: input.date, ticketKey: input.ticketKey } },
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
        where: { sprintId_date_ticketKey: { sprintId: input.sprintId, date: input.date, ticketKey: input.ticketKey } },
        create: data,
        update: data,
      });

      // Blocker sync
      const note = (data.blockerNote ?? "").trim();
      const linked = await ctx.prisma.blocker.findUnique({ where: { sourceEntryId: entry.id } });
      if (note) {
        if (linked) {
          await ctx.prisma.blocker.update({ where: { id: linked.id }, data: { description: note, jiraTicket: input.ticketKey } });
        } else {
          await ctx.prisma.blocker.create({
            data: {
              squadId: sprint.squadId,
              sprintId: input.sprintId,
              description: note,
              jiraTicket: input.ticketKey,
              note: `Auto-synced from standup ${toISODate(input.date)}`,
              sourceEntryId: entry.id,
              foundDate: input.date,
            },
          });
        }
      } else if (linked && !linked.resolvedDate) {
        await ctx.prisma.blocker.update({ where: { id: linked.id }, data: { resolvedDate: input.date } });
      }

      // Activity log
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
      if (id) return ctx.prisma.blocker.update({ where: { id }, data: input });
      return ctx.prisma.blocker.create({ data: { squadId, ...input } });
    },
    deleteBlocker: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.blocker.delete({ where: { id } });
      return true;
    },
  },

  Subscription: {
    standupChanged: {
      subscribe: (_p: unknown, { sprintId }: { sprintId: string }) => pubsub.asyncIterableIterator(standupTopic(sprintId)),
    },
  },
};
