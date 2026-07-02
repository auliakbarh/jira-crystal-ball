// Moon Phase — per-member daily mood (1..5). memberMoods feeds the standup
// TeamPanel; sprintMoodHistory feeds the Moon Phase page (line + heatmap).
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { publishStandupChange } from "../pubsub.js";
import { sessionLive, isAdminUser, toISODate, parseISODate } from "./shared.js";

const MOOD_DEFAULT = 5; // happy — mirrors the client-side default
const clampMood = (m: unknown) => Math.min(5, Math.max(1, Math.round(Number(m) || 5)));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const moodResolvers = {
  Query: {
    memberMoods: (_p: unknown, { sprintId, date }: { sprintId: string; date: Date }, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.moodEntry.findMany({ where: { sprintId, date }, orderBy: { memberName: "asc" } });
    },

    sprintMoodHistory: async (
      _p: unknown,
      { squadId, limit }: { squadId: string; limit?: number },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const sprints = await ctx.prisma.sprint.findMany({ where: { squadId }, orderBy: { number: "desc" } });
      const chosen = limit && limit > 0 ? sprints.slice(0, limit) : sprints;
      const members = await ctx.prisma.teamMember.findMany({ where: { squadId }, orderBy: { name: "asc" } });

      const out = [];
      for (const s of chosen) {
        const moods = await ctx.prisma.moodEntry.findMany({ where: { sprintId: s.id } });
        // Explicit mood by member/date key.
        const explicit = new Map<string, number>();
        for (const e of moods) explicit.set(`${e.memberId}|${toISODate(e.date)}`, e.mood);

        // Day axis = dates that have mood rows. Moods are seeded (default 5) when a
        // standup is started, so only started days appear; days without a standup
        // never get mood rows and stay off the chart. Within a shown day, a member
        // with no explicit row still defaults to happy (5).
        const dateSet = new Set<string>();
        for (const e of moods) dateSet.add(toISODate(e.date));
        const dates = Array.from(dateSet).sort();

        const memberSeries = members.map((m) => {
          const points = dates.map((d) => ({ date: parseISODate(d), mood: explicit.get(`${m.id}|${d}`) ?? MOOD_DEFAULT }));
          return {
            memberId: m.id,
            memberName: m.name,
            position: m.position as string,
            points,
            average: points.length ? round1(points.reduce((a, p) => a + p.mood, 0) / points.length) : 0,
          };
        });
        const allVals = memberSeries.flatMap((g) => g.points.map((p) => p.mood));
        out.push({
          sprintId: s.id,
          number: s.number,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          teamAverage: allVals.length ? round1(allVals.reduce((a, b) => a + b, 0) / allVals.length) : 0,
          members: dates.length ? memberSeries : [],
        });
      }
      return out;
    },
  },

  Mutation: {
    setMood: async (
      _p: unknown,
      { sprintId, memberId, date, mood, leadKey }: { sprintId: string; memberId: string; date: Date; mood: number; leadKey?: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const sprint = await ctx.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new Error("Sprint not found");
      const member = await ctx.prisma.teamMember.findUnique({ where: { id: memberId } });
      if (!member || member.squadId !== sprint.squadId) throw new Error("Member not found");

      // Mood can only be set while a standup session is actively running: no
      // session (or ended) → blocked until it's started again. When live, only
      // the lead (or an admin) may write.
      const session = await ctx.prisma.standupSession.findUnique({ where: { sprintId } });
      if (!sessionLive(session)) {
        throw new Error("Standup is not running — start a standup to set moods.");
      }
      if (session!.leadKey !== leadKey && !(await isAdminUser(ctx))) {
        throw new Error(`Standup is being led by ${session!.leadName} — you can't edit now.`);
      }

      const value = clampMood(mood);
      const entry = await ctx.prisma.moodEntry.upsert({
        where: { sprintId_memberId_date: { sprintId, memberId, date } },
        create: { sprintId, memberId, memberName: member.name, date, mood: value },
        update: { mood: value, memberName: member.name },
      });
      publishStandupChange(sprintId, "mood");
      return entry;
    },
  },
};
