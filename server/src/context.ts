import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";
import { env } from "./env.js";

export interface Context {
  prisma: typeof prisma;
  userId: string | null;
  userName: string | null;
}

export function contextFromAuthHeader(header?: string | null): Context {
  let userId: string | null = null;
  let userName: string | null = null;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      userId = payload.userId;
      userName = payload.name ?? null;
    }
  }
  return { prisma, userId, userName };
}

export async function buildContext({ req }: { req: { headers: Record<string, any> } }): Promise<Context> {
  return contextFromAuthHeader(req.headers["authorization"] || req.headers["Authorization"]);
}

export function requireAuth(ctx: Context): string {
  if (!ctx.userId) throw new Error("Unauthorized: please log in");
  return ctx.userId;
}

export async function requireAdmin(ctx: Context): Promise<string> {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isAdmin) throw new Error("Forbidden: admin only");
  return userId;
}

/** True when the given user is the env super admin (matched by email). */
export function isSuperAdminUser(user: { email?: string | null; isAdmin?: boolean } | null): boolean {
  return !!user?.isAdmin && (user.email ?? "").toLowerCase() === env.superAdminEmail;
}

// Only the env super admin may manage admin accounts. Returns their user row.
export async function requireSuperAdmin(ctx: Context) {
  const userId = requireAuth(ctx);
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!isSuperAdminUser(user)) throw new Error("Forbidden: super admin only");
  return user!;
}
