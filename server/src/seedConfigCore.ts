// Bulk-seed squads + team members from a config object (idempotent). Shared by
// the CLI (seed-config.ts) and the admin GraphQL mutation (resolvers/admin.ts).
import type { prisma as Prisma } from "./db.js";

export interface SquadCfg {
  name: string;
  boardId?: string;
  spDefault?: string;
  spFe?: string;
  spBe?: string;
  spQa?: string;
  confluenceSpaceKey?: string;
  confluenceParentId?: string;
}
export interface TeamCfg {
  name: string;
  fullName?: string;
  squads?: string[];
  position?: string;
  jiraAccountId?: string;
}
export interface SeedConfig {
  squads?: SquadCfg[];
  teams?: TeamCfg[];
}
export interface SeedResult {
  squads: number;
  membersCreated: number;
  membersUpdated: number;
}

const orNull = (v?: string): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function seedFromConfig(prisma: typeof Prisma, cfg: SeedConfig): Promise<SeedResult> {
  const squads = cfg.squads ?? [];
  const teams = cfg.teams ?? [];

  const byName = new Map<string, string>(); // squad name → id
  for (const s of squads) {
    if (!s.name?.trim()) continue;
    const data = {
      defaultBoardId: orNull(s.boardId),
      spFieldDefault: orNull(s.spDefault),
      spFieldFE: orNull(s.spFe),
      spFieldBE: orNull(s.spBe),
      spFieldQA: orNull(s.spQa),
      confluenceSpaceKey: orNull(s.confluenceSpaceKey),
      confluenceParentId: orNull(s.confluenceParentId),
    };
    const squad = await prisma.squad.upsert({
      where: { name: s.name.trim() },
      create: { name: s.name.trim(), ...data },
      update: data,
    });
    byName.set(squad.name, squad.id);
  }

  // Ensure squads referenced by teams exist even if not listed under "squads".
  for (const t of teams) {
    for (const sq of t.squads ?? []) {
      if (byName.has(sq)) continue;
      const squad = await prisma.squad.upsert({ where: { name: sq }, create: { name: sq }, update: {} });
      byName.set(squad.name, squad.id);
    }
  }

  let membersCreated = 0;
  let membersUpdated = 0;
  for (const t of teams) {
    if (!t.name?.trim()) continue;
    const position = (t.position ?? "ALL").trim() || "ALL";
    for (const sq of t.squads ?? []) {
      const squadId = byName.get(sq);
      if (!squadId) continue;
      const data = { fullName: orNull(t.fullName), position: position as any, jiraAccountId: orNull(t.jiraAccountId) };
      const existing = await prisma.teamMember.findFirst({ where: { squadId, name: t.name.trim() } });
      if (existing) {
        await prisma.teamMember.update({ where: { id: existing.id }, data });
        membersUpdated++;
      } else {
        await prisma.teamMember.create({ data: { squadId, name: t.name.trim(), ...data } });
        membersCreated++;
      }
    }
  }

  return { squads: byName.size, membersCreated, membersUpdated };
}
