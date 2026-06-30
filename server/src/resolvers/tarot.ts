// Tarot — planning poker. One ACTIVE room per squad; host runs sessions,
// guests join and vote. Live presence + votes pushed over `tarotRoomChanged`.
import type { Context } from "../context.js";
import { requireAuth } from "../context.js";
import { pubsub, tarotTopic, publishTarotEvent } from "../pubsub.js";
import { jiraCfgForBoard, isAdminUser, toISODate } from "./shared.js";
import {
  fetchNextSprintIssues,
  fetchNextSprintInfo,
  resolveSquadSpIds,
  getIssueFieldValues,
  updateIssueFields,
} from "../jira.js";

// Presence: a participant is "online" while their heartbeat is recent.
const TAROT_STALE_MS = 15_000;
const SPECIAL_CARDS = ["?", "coffee"];

const PRESETS: Record<string, number[]> = {
  FIBONACCI: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
  SCRUM: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100],
};

function presetValues(scaleType: string, scaleValues?: string | null): number[] {
  if (scaleType === "CUSTOM") {
    try {
      const arr = JSON.parse(scaleValues ?? "[]");
      if (Array.isArray(arr)) return arr.map(Number).filter((n) => Number.isFinite(n));
    } catch {
      /* fall through */
    }
    return [];
  }
  return PRESETS[scaleType] ?? PRESETS.FIBONACCI;
}

// The full deck shown to players: numeric cards (as strings) + special cards.
function deckStrings(scaleType: string, scaleValues?: string | null): string[] {
  return [...presetValues(scaleType, scaleValues).map((n) => String(n)), ...SPECIAL_CARDS];
}

function isOnline(p: { leftAt: Date | null; kicked: boolean; lastSeen: Date }): boolean {
  return !p.leftAt && !p.kicked && Date.now() - new Date(p.lastSeen).getTime() < TAROT_STALE_MS;
}

// Vote statistics for a revealed round.
function voteStats(votes: { value: string }[]) {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
  const total = votes.length;
  let topCount = 0;
  for (const c of counts.values()) topCount = Math.max(topCount, c);
  const syncPercent = total > 0 ? Math.round((topCount / total) * 100) : null;

  // Suggestion = single most-picked NUMERIC value; null on draw or no numbers.
  const numeric = [...counts.entries()].filter(([k]) => !SPECIAL_CARDS.includes(k));
  let suggestion: string | null = null;
  if (numeric.length) {
    const max = Math.max(...numeric.map(([, c]) => c));
    const tops = numeric.filter(([, c]) => c === max);
    suggestion = tops.length === 1 ? tops[0][0] : null;
  }
  return { syncPercent, suggestion };
}

async function loadRoomOrThrow(ctx: Context, roomId: string) {
  const room = await ctx.prisma.tarotRoom.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("Room not found");
  return room;
}

function assertHost(room: { hostKey: string }, key: string) {
  if (room.hostKey !== key) throw new Error("Forbidden: host only");
}

async function assertHostOrAdmin(ctx: Context, room: { hostKey: string }, key: string) {
  if (room.hostKey === key) return;
  if (await isAdminUser(ctx)) return;
  throw new Error("Forbidden: host or admin only");
}

// Assemble the full room view (participants + current round + results) for a
// given requester `key`. Vote values are hidden until the round is revealed.
async function buildRoom(ctx: Context, roomId: string, key?: string | null) {
  const room = await ctx.prisma.tarotRoom.findUnique({ where: { id: roomId } });
  if (!room) return null;

  const parts = await ctx.prisma.tarotParticipant.findMany({
    where: { roomId },
    orderBy: { joinedAt: "asc" },
  });

  let currentRound: any = null;
  if (room.currentRoundId) {
    const round = await ctx.prisma.tarotRound.findUnique({ where: { id: room.currentRoundId } });
    if (round) {
      const votes = await ctx.prisma.tarotVote.findMany({
        where: { roundId: round.id, confirmed: true },
      });
      const revealed = round.status === "REVEALED" || round.status === "DECIDED";
      const stats = revealed ? voteStats(votes) : { syncPercent: null, suggestion: null };
      const sorted = [...votes].sort((a, b) => Number(a.value) - Number(b.value));
      currentRound = {
        id: round.id,
        ticketKey: round.ticketKey,
        ticketSummary: round.ticketSummary,
        ticketType: round.ticketType,
        ticketPriority: round.ticketPriority,
        ticketUrl: round.ticketUrl,
        status: round.status,
        cycle: round.cycle,
        voteCount: votes.length,
        revealed,
        votes: revealed
          ? sorted.map((v) => ({ participantId: v.participantId, name: v.participantName, value: v.value }))
          : [],
        syncPercent: stats.syncPercent,
        suggestion: stats.suggestion,
      };
    }
  }

  // hasVoted is per current round (confirmed).
  const confirmedIds = new Set<string>();
  if (room.currentRoundId) {
    const cv = await ctx.prisma.tarotVote.findMany({
      where: { roundId: room.currentRoundId, confirmed: true },
      select: { participantId: true },
    });
    for (const v of cv) confirmedIds.add(v.participantId);
  }

  // Active room → live roster (online + host). Ended room → full attendance log
  // (everyone who joined, online or not), so the session record is complete.
  const ended = room.status === "ENDED";
  const participants = parts
    .filter((p) => ended || isOnline(p) || p.isHost)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      online: isOnline(p),
      hasVoted: confirmedIds.has(p.id),
      joinedAt: p.joinedAt.toISOString(),
    }));

  const results = await ctx.prisma.tarotResult.findMany({
    where: { roomId },
    orderBy: { decidedAt: "asc" },
  });

  const viewer = key ? parts.find((p) => p.key === key) : null;

  return {
    id: room.id,
    squadId: room.squadId,
    name: room.name ?? `Sprint Planning #${room.seq}`,
    hostName: room.hostName,
    status: room.status,
    scaleType: room.scaleType,
    scaleValues: deckStrings(room.scaleType, room.scaleValues),
    sprintName: room.sprintName,
    createdAt: room.createdAt.toISOString(),
    endedAt: room.endedAt ? room.endedAt.toISOString() : null,
    isHost: !!key && room.hostKey === key,
    viewerKicked: !!viewer?.kicked,
    participants,
    currentRound,
    results: results.map(mapResult),
  };
}

function mapResult(r: any) {
  return {
    ticketKey: r.ticketKey,
    ticketSummary: r.ticketSummary,
    parentKey: r.parentKey,
    parentName: r.parentName,
    effort: r.effort,
    pointFE: r.pointFE,
    pointBE: r.pointBE,
    pointQA: r.pointQA,
    decidedAt: r.decidedAt instanceof Date ? r.decidedAt.toISOString() : r.decidedAt,
    syncedAt: r.syncedAt ? (r.syncedAt instanceof Date ? r.syncedAt.toISOString() : r.syncedAt) : null,
  };
}

// Online non-host participants — the voters whose confirmations gate a reveal.
async function onlineVoters(ctx: Context, roomId: string) {
  const parts = await ctx.prisma.tarotParticipant.findMany({ where: { roomId, isHost: false } });
  return parts.filter(isOnline);
}

export const tarotResolvers = {
  Query: {
    tarotRooms: async (_p: unknown, { squadId }: { squadId: string }, ctx: Context) => {
      requireAuth(ctx);
      const rooms = await ctx.prisma.tarotRoom.findMany({
        where: { squadId },
        orderBy: { createdAt: "desc" },
      });
      const out = [];
      for (const r of rooms) {
        const count = await ctx.prisma.tarotParticipant.count({
          where: { roomId: r.id, leftAt: null, kicked: false },
        });
        out.push({
          id: r.id,
          name: r.name ?? `Sprint Planning #${r.seq}`,
          hostName: r.hostName,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          endedAt: r.endedAt ? r.endedAt.toISOString() : null,
          participantCount: count,
        });
      }
      return out;
    },

    tarotRoom: async (_p: unknown, { id, key }: { id: string; key?: string }, ctx: Context) => {
      requireAuth(ctx);
      return buildRoom(ctx, id, key);
    },

    tarotTickets: async (_p: unknown, { roomId, refresh }: { roomId: string; refresh?: boolean }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: room.squadId } });
      const cfg = jiraCfgForBoard(squad);
      const results = await ctx.prisma.tarotResult.findMany({ where: { roomId } });
      const byKey = new Map(results.map((r) => [r.ticketKey, r]));
      if (!cfg || !cfg.boardId) return [];

      // JIRA can be briefly unreachable mid-planning. Don't break gameplay — fall
      // back to ticket rows built from already-decided results so the host still
      // sees points; they can ↻ Reload once JIRA is back.
      let tickets;
      try {
        tickets = await fetchNextSprintIssues(cfg, { force: !!refresh });
      } catch {
        return results.map((r) => ({
          key: r.ticketKey,
          summary: r.ticketSummary,
          issueType: null,
          priority: null,
          status: null,
          url: `${(cfg.baseUrl || "").replace(/\/+$/, "")}/browse/${r.ticketKey}`,
          parentKey: null,
          parentName: null,
          result: mapResult(r),
        }));
      }
      return tickets.map((t) => ({
        key: t.key,
        summary: t.summary,
        issueType: t.issueType,
        priority: t.priority,
        status: t.status,
        url: t.url,
        parentKey: t.parentKey,
        parentName: t.parentName,
        result: byKey.has(t.key) ? mapResult(byKey.get(t.key)) : null,
      }));
    },
  },

  Mutation: {
    createTarotRoom: async (
      _p: unknown,
      { squadId, hostName, hostKey }: { squadId: string; hostName: string; hostKey: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const existing = await ctx.prisma.tarotRoom.findFirst({ where: { squadId, status: "ACTIVE" } });
      if (existing) throw new Error("An active room already exists for this squad.");
      const squad = await ctx.prisma.squad.findUnique({ where: { id: squadId } });
      if (!squad) throw new Error("Squad not found");

      const scaleType = squad.tarotScaleType ?? "FIBONACCI";
      const values = presetValues(scaleType, squad.tarotScaleValues);

      // Best-effort next-sprint name for display.
      let sprintName: string | null = null;
      try {
        const cfg = jiraCfgForBoard(squad);
        if (cfg?.boardId) {
          const info = await fetchNextSprintInfo(cfg);
          sprintName = info?.name ?? null;
        }
      } catch {
        /* ignore — name is cosmetic */
      }

      // Per-squad incrementing planning number → "<Squad> - Sprint Planning #N - <date>".
      const last = await ctx.prisma.tarotRoom.findFirst({
        where: { squadId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (last?.seq ?? 0) + 1;
      const name = `${squad.name} - Sprint Planning #${seq} - ${toISODate(new Date())}`;

      const room = await ctx.prisma.tarotRoom.create({
        data: {
          squadId,
          name,
          seq,
          hostName: hostName.trim() || "Host",
          hostKey,
          scaleType: scaleType as any,
          scaleValues: JSON.stringify(values),
          sprintName,
        },
      });
      await ctx.prisma.tarotParticipant.create({
        data: { roomId: room.id, name: hostName.trim() || "Host", key: hostKey, isHost: true },
      });
      publishTarotEvent(room.id, "join", hostName);
      return buildRoom(ctx, room.id, hostKey);
    },

    joinTarotRoom: async (
      _p: unknown,
      { roomId, name, key }: { roomId: string; name: string; key: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      if (room.status !== "ACTIVE") throw new Error("This room has ended.");
      const isHost = room.hostKey === key;
      // Upsert (not findUnique+create) so concurrent joins — e.g. React StrictMode's
      // double-invoke or a quick remount — can't race the (roomId, key) unique index.
      const cleanName = name.trim() || "Guest";
      await ctx.prisma.tarotParticipant.upsert({
        where: { roomId_key: { roomId, key } },
        create: { roomId, name: cleanName, key, isHost },
        update: { name: cleanName, lastSeen: new Date(), leftAt: null, kicked: false },
      });
      publishTarotEvent(roomId, "join", name);
      return buildRoom(ctx, roomId, key);
    },

    leaveTarotRoom: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const p = await ctx.prisma.tarotParticipant.findUnique({ where: { roomId_key: { roomId, key } } });
      if (p) {
        await ctx.prisma.tarotParticipant.update({ where: { id: p.id }, data: { leftAt: new Date() } });
        publishTarotEvent(roomId, "leave", p.name);
      }
      return true;
    },

    tarotHeartbeat: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      await ctx.prisma.tarotParticipant.updateMany({
        where: { roomId, key },
        data: { lastSeen: new Date() },
      });
      return true;
    },

    kickTarotParticipant: async (
      _p: unknown,
      { roomId, key, participantId }: { roomId: string; key: string; participantId: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      assertHost(room, key);
      const p = await ctx.prisma.tarotParticipant.findUnique({ where: { id: participantId } });
      if (!p || p.roomId !== roomId) throw new Error("Participant not found");
      if (p.isHost) throw new Error("Cannot kick the host");
      await ctx.prisma.tarotParticipant.update({
        where: { id: participantId },
        data: { kicked: true, leftAt: new Date() },
      });
      publishTarotEvent(roomId, "kick", p.name);
      return true;
    },

    setTarotScale: async (
      _p: unknown,
      { roomId, key, scaleType, scaleValues, setDefault }: any,
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      assertHost(room, key);
      const type = String(scaleType).toUpperCase();
      if (!["FIBONACCI", "SCRUM", "CUSTOM"].includes(type)) throw new Error("Invalid scale type");
      let values: number[];
      if (type === "CUSTOM") {
        values = (scaleValues ?? []).map(Number).filter((n: number) => Number.isFinite(n));
        if (values.length === 0) throw new Error("Custom scale needs at least one number.");
      } else {
        values = PRESETS[type];
      }
      await ctx.prisma.tarotRoom.update({
        where: { id: roomId },
        data: { scaleType: type as any, scaleValues: JSON.stringify(values) },
      });
      if (setDefault) {
        await ctx.prisma.squad.update({
          where: { id: room.squadId },
          data: { tarotScaleType: type as any, tarotScaleValues: JSON.stringify(values) },
        });
      }
      publishTarotEvent(roomId, "scale", null);
      return buildRoom(ctx, roomId, key);
    },

    startTarotRound: async (
      _p: unknown,
      { roomId, key, ticketKey }: { roomId: string; key: string; ticketKey: string },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      assertHost(room, key);
      if (room.status !== "ACTIVE") throw new Error("This room has ended.");

      // Snapshot ticket info from the next-sprint list.
      const squad = await ctx.prisma.squad.findUnique({ where: { id: room.squadId } });
      const cfg = jiraCfgForBoard(squad);
      let snap: any = { ticketKey };
      if (cfg?.boardId) {
        const tickets = await fetchNextSprintIssues(cfg).catch(() => []);
        const t = tickets.find((x) => x.key === ticketKey);
        if (t)
          snap = {
            ticketKey,
            ticketSummary: t.summary,
            ticketType: t.issueType,
            ticketPriority: t.priority,
            ticketUrl: t.url,
            parentKey: t.parentKey,
            parentName: t.parentName,
          };
      }
      const prior = await ctx.prisma.tarotRound.findFirst({
        where: { roomId, ticketKey },
        orderBy: { cycle: "desc" },
      });
      const round = await ctx.prisma.tarotRound.create({
        data: { roomId, ...snap, cycle: (prior?.cycle ?? 0) + 1, status: "VOTING" },
      });
      await ctx.prisma.tarotRoom.update({ where: { id: roomId }, data: { currentRoundId: round.id } });
      publishTarotEvent(roomId, "round_start", ticketKey);
      const built = await buildRoom(ctx, roomId, key);
      return built!.currentRound;
    },

    castTarotVote: async (
      _p: unknown,
      { roomId, key, value, confirmed }: { roomId: string; key: string; value: string; confirmed: boolean },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      if (!room.currentRoundId) throw new Error("No active round");
      const round = await ctx.prisma.tarotRound.findUnique({ where: { id: room.currentRoundId } });
      if (!round || round.status !== "VOTING") throw new Error("Voting is closed for this round");
      const p = await ctx.prisma.tarotParticipant.findUnique({ where: { roomId_key: { roomId, key } } });
      if (!p) throw new Error("Join the room first");
      if (p.isHost) throw new Error("The host does not vote");

      await ctx.prisma.tarotVote.upsert({
        where: { roundId_participantId: { roundId: round.id, participantId: p.id } },
        create: { roundId: round.id, participantId: p.id, participantName: p.name, value, confirmed },
        update: { value, participantName: p.name, confirmed },
      });
      publishTarotEvent(roomId, "vote", p.name);

      // Reveal once every online voter has confirmed.
      if (confirmed) {
        const voters = await onlineVoters(ctx, roomId);
        const confirmedVotes = await ctx.prisma.tarotVote.findMany({
          where: { roundId: round.id, confirmed: true },
        });
        const confirmedSet = new Set(confirmedVotes.map((v) => v.participantId));
        const allIn = voters.length > 0 && voters.every((v) => confirmedSet.has(v.id));
        if (allIn) {
          await ctx.prisma.tarotRound.update({ where: { id: round.id }, data: { status: "REVEALED" } });
          publishTarotEvent(roomId, "reveal", null);
        }
      }
      return true;
    },

    nextTarotCycle: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      assertHost(room, key);
      if (!room.currentRoundId) throw new Error("No active round");
      const round = await ctx.prisma.tarotRound.findUnique({ where: { id: room.currentRoundId } });
      if (!round) throw new Error("No active round");
      const next = await ctx.prisma.tarotRound.create({
        data: {
          roomId,
          ticketKey: round.ticketKey,
          ticketSummary: round.ticketSummary,
          ticketType: round.ticketType,
          ticketPriority: round.ticketPriority,
          ticketUrl: round.ticketUrl,
          parentKey: round.parentKey,
          parentName: round.parentName,
          cycle: round.cycle + 1,
          status: "VOTING",
        },
      });
      await ctx.prisma.tarotRoom.update({ where: { id: roomId }, data: { currentRoundId: next.id } });
      publishTarotEvent(roomId, "next_cycle", round.ticketKey);
      const built = await buildRoom(ctx, roomId, key);
      return built!.currentRound;
    },

    decideTarotPoint: async (
      _p: unknown,
      { roomId, key, effort, pointFE, pointBE, pointQA }: any,
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      assertHost(room, key);
      if (!room.currentRoundId) throw new Error("No active round");
      const round = await ctx.prisma.tarotRound.findUnique({ where: { id: room.currentRoundId } });
      if (!round) throw new Error("No active round");
      if (round.status !== "REVEALED") throw new Error("Reveal the cards before deciding");

      const e = Number(effort);
      if (!Number.isFinite(e) || e < 0) throw new Error("Invalid effort");
      const cap = (v: any, label: string) => {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${label} point`);
        if (n > e) throw new Error(`${label} point cannot exceed the ticket effort (${e})`);
        return n;
      };
      const fe = cap(pointFE, "FE");
      const be = cap(pointBE, "BE");
      const qa = cap(pointQA, "QA");

      const result = await ctx.prisma.tarotResult.upsert({
        where: { roomId_ticketKey: { roomId, ticketKey: round.ticketKey } },
        create: {
          roomId,
          ticketKey: round.ticketKey,
          ticketSummary: round.ticketSummary,
          parentKey: round.parentKey,
          parentName: round.parentName,
          effort: e,
          pointFE: fe,
          pointBE: be,
          pointQA: qa,
        },
        update: { effort: e, pointFE: fe, pointBE: be, pointQA: qa, decidedAt: new Date() },
      });
      await ctx.prisma.tarotRound.update({ where: { id: round.id }, data: { status: "DECIDED" } });
      await ctx.prisma.tarotRoom.update({ where: { id: roomId }, data: { currentRoundId: null } });
      publishTarotEvent(roomId, "decided", round.ticketKey);
      return mapResult(result);
    },

    resetTarotPoints: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      await assertHostOrAdmin(ctx, room, key);
      await ctx.prisma.tarotResult.deleteMany({ where: { roomId } });
      await ctx.prisma.tarotRound.deleteMany({ where: { roomId } });
      await ctx.prisma.tarotRoom.update({ where: { id: roomId }, data: { currentRoundId: null } });
      publishTarotEvent(roomId, "reset", null);
      return true;
    },

    endTarotRoom: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      await assertHostOrAdmin(ctx, room, key);
      if (room.status !== "ACTIVE") return true;

      // Every next-sprint ticket must have a decided point.
      const squad = await ctx.prisma.squad.findUnique({ where: { id: room.squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (cfg?.boardId) {
        const tickets = await fetchNextSprintIssues(cfg).catch(() => []);
        const results = await ctx.prisma.tarotResult.findMany({ where: { roomId } });
        const done = new Set(results.map((r) => r.ticketKey));
        const missing = tickets.filter((t) => !done.has(t.key)).map((t) => t.key);
        if (missing.length)
          throw new Error(`Cannot end: ${missing.length} ticket(s) still need a story point — ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
      }
      await ctx.prisma.tarotRoom.update({
        where: { id: roomId },
        data: { status: "ENDED", endedAt: new Date(), currentRoundId: null },
      });
      publishTarotEvent(roomId, "ended", null);
      return true;
    },

    deleteTarotRoom: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      if (room.status === "ENDED") {
        if (!(await isAdminUser(ctx))) throw new Error("Ended rooms can only be deleted by an admin.");
      } else {
        await assertHostOrAdmin(ctx, room, key);
      }
      await ctx.prisma.tarotRoom.delete({ where: { id: roomId } });
      publishTarotEvent(roomId, "deleted", null);
      return true;
    },

    syncTarotToJira: async (
      _p: unknown,
      { roomId, key, fields }: { roomId: string; key: string; fields: string[] },
      ctx: Context,
    ) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      await assertHostOrAdmin(ctx, room, key);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: room.squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg || !cfg.boardId) throw new Error("JIRA_NOT_CONFIGURED");

      const ids = await resolveSquadSpIds(cfg);
      // Map requested logical fields → resolved JIRA custom field ids.
      const want = new Set(fields.map((f) => f.toLowerCase()));
      const mapping: { logical: string; fieldId: string; pick: (r: any) => number | null }[] = [];
      if (want.has("point") && ids.default) mapping.push({ logical: "point", fieldId: ids.default, pick: (r) => r.effort });
      if (want.has("fe") && ids.fe) mapping.push({ logical: "fe", fieldId: ids.fe, pick: (r) => r.pointFE });
      if (want.has("be") && ids.be) mapping.push({ logical: "be", fieldId: ids.be, pick: (r) => r.pointBE });
      if (want.has("qa") && ids.qa) mapping.push({ logical: "qa", fieldId: ids.qa, pick: (r) => r.pointQA });
      if (mapping.length === 0) throw new Error("Select at least one field that is configured for this squad.");

      const results = await ctx.prisma.tarotResult.findMany({ where: { roomId } });
      const fieldIds = mapping.map((m) => m.fieldId);
      const touched: string[] = [];
      for (const r of results) {
        // Snapshot prior values once so a reset can restore them.
        const prev = await getIssueFieldValues(cfg, r.ticketKey, fieldIds).catch(() => ({}));
        const payload: Record<string, unknown> = {};
        for (const m of mapping) {
          const v = m.pick(r);
          if (v !== null && v !== undefined) payload[m.fieldId] = v;
        }
        if (Object.keys(payload).length === 0) continue;
        await updateIssueFields(cfg, r.ticketKey, payload);
        await ctx.prisma.tarotResult.update({
          where: { id: r.id },
          data: { jiraPrevValues: JSON.stringify(prev), syncedAt: new Date() },
        });
        touched.push(r.ticketKey);
      }
      publishTarotEvent(roomId, "synced", null);
      return { updated: touched.length, tickets: touched };
    },

    resetTarotSync: async (_p: unknown, { roomId, key }: { roomId: string; key: string }, ctx: Context) => {
      requireAuth(ctx);
      const room = await loadRoomOrThrow(ctx, roomId);
      await assertHostOrAdmin(ctx, room, key);
      const squad = await ctx.prisma.squad.findUnique({ where: { id: room.squadId } });
      const cfg = jiraCfgForBoard(squad);
      if (!cfg || !cfg.boardId) throw new Error("JIRA_NOT_CONFIGURED");

      const results = await ctx.prisma.tarotResult.findMany({
        where: { roomId, NOT: { jiraPrevValues: null } },
      });
      for (const r of results) {
        let prev: Record<string, unknown> = {};
        try {
          prev = JSON.parse(r.jiraPrevValues ?? "{}");
        } catch {
          prev = {};
        }
        // Restore previous values (null clears the field in JIRA).
        await updateIssueFields(cfg, r.ticketKey, prev).catch(() => undefined);
        await ctx.prisma.tarotResult.update({
          where: { id: r.id },
          data: { jiraPrevValues: null, syncedAt: null },
        });
      }
      publishTarotEvent(roomId, "synced", null);
      return true;
    },
  },

  Subscription: {
    tarotRoomChanged: {
      subscribe: (_p: unknown, { roomId }: { roomId: string }) =>
        pubsub.asyncIterableIterator(tarotTopic(roomId)),
    },
  },
};
