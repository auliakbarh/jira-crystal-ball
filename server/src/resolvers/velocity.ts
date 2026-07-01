// Velocity (per-sprint story-point throughput) + burndown (daily remaining vs
// ideal). Both derive from StandupEntry snapshots — no extra JIRA calls.
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { isDoneStatus } from "./shared.js";

const sp = (e: { storyPoints: number | null }) => (typeof e.storyPoints === "number" ? e.storyPoints : 0);

export const velocityResolvers = {
  Query: {
    velocity: async (_p: unknown, { squadId, limit }: { squadId: string; limit?: number }, ctx: Context) => {
      requireAuth(ctx);
      const sprints = await ctx.prisma.sprint.findMany({ where: { squadId }, orderBy: { number: "asc" } });
      const chosen = limit && limit > 0 ? sprints.slice(-limit) : sprints;
      const out = [];
      for (const s of chosen) {
        const entries = await ctx.prisma.standupEntry.findMany({
          where: { sprintId: s.id },
          orderBy: { date: "asc" },
        });
        // Latest snapshot per ticket (asc order → last write wins).
        const latest = new Map<string, (typeof entries)[number]>();
        for (const e of entries) latest.set(e.ticketKey, e);
        let committed = 0;
        let completed = 0;
        let doneCount = 0;
        for (const e of latest.values()) {
          committed += sp(e);
          if (isDoneStatus(e.ticketStatus)) {
            completed += sp(e);
            doneCount += 1;
          }
        }
        out.push({
          sprintId: s.id,
          number: s.number,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          committedPoints: Math.round(committed * 100) / 100,
          completedPoints: Math.round(completed * 100) / 100,
          ticketCount: latest.size,
          doneCount,
        });
      }
      return out;
    },

    burndown: async (_p: unknown, { sprintId }: { sprintId: string }, ctx: Context) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) return [];
      const entries = await ctx.prisma.standupEntry.findMany({
        where: { sprintId },
        orderBy: { date: "asc" },
      });
      if (entries.length === 0) return [];

      // Committed = total SP of distinct tickets (latest snapshot).
      const latest = new Map<string, (typeof entries)[number]>();
      for (const e of entries) latest.set(e.ticketKey, e);
      let committed = 0;
      for (const e of latest.values()) committed += sp(e);

      // Per-ticket ascending timeline, to find each ticket's status as-of a day.
      const byTicket = new Map<string, (typeof entries)[number][]>();
      for (const e of entries) {
        const arr = byTicket.get(e.ticketKey) ?? [];
        arr.push(e);
        byTicket.set(e.ticketKey, arr);
      }

      // Calendar days across the sprint range (UTC).
      const days: Date[] = [];
      for (let d = new Date(sprint.startDate); d <= sprint.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(new Date(d));
      }
      const n = days.length;

      return days.map((day, i) => {
        let doneSp = 0;
        for (const arr of byTicket.values()) {
          let snap: (typeof entries)[number] | null = null;
          for (const e of arr) {
            if (new Date(e.date) <= day) snap = e;
            else break;
          }
          if (snap && isDoneStatus(snap.ticketStatus)) doneSp += sp(snap);
        }
        const ideal = n > 1 ? committed * (1 - i / (n - 1)) : 0;
        return {
          date: day,
          remainingPoints: Math.max(0, Math.round((committed - doneSp) * 100) / 100),
          idealPoints: Math.round(ideal * 100) / 100,
        };
      });
    },
  },
};
