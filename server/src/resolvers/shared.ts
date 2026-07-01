// Shared helpers used across resolver domains.
import { GraphQLScalarType, Kind } from "graphql";
import type { Context } from "../context.js";
import { env, hasJiraCreds } from "../env.js";

export function clampPct(v: unknown): number {
  return typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

// A ticket status counts as "completed" for velocity/burndown. JIRA statuses
// vary per project; match the common terminal ones case-insensitively.
export function isDoneStatus(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "done" || s === "closed" || s === "resolved" || s === "complete" || s === "completed";
}

// A standup session is "live" while its heartbeat is recent; after this the lead
// is assumed gone (tab closed / logged out) and others may take over.
export const STANDUP_STALE_MS = 20_000;
export function sessionLive(s: { lastSeen: Date } | null): boolean {
  return !!s && Date.now() - new Date(s.lastSeen).getTime() < STANDUP_STALE_MS;
}

// Write a StandupLog row for a finishing session, then remove the session.
export async function finalizeStandup(ctx: Context, session: any, endedAt: Date) {
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

export async function isAdminUser(ctx: Context): Promise<boolean> {
  if (!ctx.userId || ctx.userId === "guest") return false;
  const u = await ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
  return !!u?.isAdmin;
}

// JIRA client config = global env credentials + a squad's board id + SP fields.
export function jiraCfgForBoard(
  squad?: {
    defaultBoardId?: string | null;
    spFieldDefault?: string | null;
    spFieldFE?: string | null;
    spFieldBE?: string | null;
    spFieldQA?: string | null;
  } | null,
) {
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

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export const DateScalar = new GraphQLScalarType({
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

// Shared field resolvers for log/date types (ISO string serialization).
export const fieldResolvers = {
  User: {
    // Derived, not stored: env super admin is matched by email. Guests → false.
    isSuperAdmin: (u: any) =>
      !!u?.isAdmin && (u.email ?? "").toLowerCase() === env.superAdminEmail,
    createdAt: (u: any) =>
      u?.createdAt instanceof Date ? u.createdAt.toISOString() : u?.createdAt ?? null,
  },
  Squad: {
    members: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.teamMember.findMany({ where: { squadId: s.id }, orderBy: { name: "asc" } }),
    sprints: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.sprint.findMany({ where: { squadId: s.id }, orderBy: { number: "desc" } }),
    holidays: (s: any, _a: unknown, ctx: Context) =>
      ctx.prisma.holiday.findMany({ where: { squadId: s.id }, orderBy: { date: "asc" } }),
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
