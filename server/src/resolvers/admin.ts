// Admin account management. All operations are restricted to the env "super
// admin" (SEED_ADMIN_EMAIL). Regular admins can use the app but cannot create,
// edit, delete, or reset the password of admin accounts.
import type { Context } from "../context.js";
import { requireSuperAdmin, isSuperAdminUser, requireAdmin } from "../context.js";
import { hashPassword } from "../auth.js";
import { seedFromConfig, type SeedConfig } from "../seedConfigCore.js";

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

// The super admin may only manage OTHER admins — never itself (prevents lockout
// / self-deletion). Password self-reset is handled separately (allowed).
async function loadManageableTarget(ctx: Context, id: string) {
  const target = await ctx.prisma.user.findUnique({ where: { id } });
  if (!target || !target.isAdmin) throw new Error("Admin not found");
  if (isSuperAdminUser(target)) throw new Error("The env super admin cannot be modified.");
  return target;
}

export const adminResolvers = {
  Query: {
    admins: async (_p: unknown, _a: unknown, ctx: Context) => {
      await requireSuperAdmin(ctx);
      return ctx.prisma.user.findMany({ where: { isAdmin: true }, orderBy: { createdAt: "asc" } });
    },
  },

  Mutation: {
    seedConfig: async (_p: unknown, { json }: { json: string }, ctx: Context) => {
      await requireAdmin(ctx);
      let cfg: SeedConfig;
      try {
        cfg = JSON.parse(json);
      } catch (e: any) {
        throw new Error(`Invalid JSON: ${e?.message ?? e}`);
      }
      if (typeof cfg !== "object" || cfg === null || (!cfg.squads && !cfg.teams)) {
        throw new Error('Config must be an object with "squads" and/or "teams" arrays.');
      }
      return seedFromConfig(ctx.prisma, cfg);
    },

    createAdmin: async (
      _p: unknown,
      { email, name, password }: { email: string; name: string; password: string },
      ctx: Context,
    ) => {
      await requireSuperAdmin(ctx);
      const key = normEmail(email);
      if (!key) throw new Error("Email is required");
      if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Name is required");
      const existing = await ctx.prisma.user.findUnique({ where: { email: key } });
      if (existing) throw new Error("A user with that email already exists");
      return ctx.prisma.user.create({
        data: { email: key, name: trimmedName, passwordHash: await hashPassword(password), isAdmin: true },
      });
    },

    updateAdmin: async (
      _p: unknown,
      { id, email, name }: { id: string; email?: string; name?: string },
      ctx: Context,
    ) => {
      await requireSuperAdmin(ctx);
      await loadManageableTarget(ctx, id);
      const data: { email?: string; name?: string } = {};
      if (email !== undefined) {
        const key = normEmail(email);
        if (!key) throw new Error("Email is required");
        const clash = await ctx.prisma.user.findUnique({ where: { email: key } });
        if (clash && clash.id !== id) throw new Error("A user with that email already exists");
        data.email = key;
      }
      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) throw new Error("Name is required");
        data.name = trimmedName;
      }
      return ctx.prisma.user.update({ where: { id }, data });
    },

    changeAdminPassword: async (
      _p: unknown,
      { id, password }: { id: string; password: string },
      ctx: Context,
    ) => {
      await requireSuperAdmin(ctx);
      await loadManageableTarget(ctx, id);
      if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
      await ctx.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
      return true;
    },

    deleteAdmin: async (_p: unknown, { id }: { id: string }, ctx: Context) => {
      await requireSuperAdmin(ctx);
      await loadManageableTarget(ctx, id);
      await ctx.prisma.user.delete({ where: { id } });
      return true;
    },
  },
};
