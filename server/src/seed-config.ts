import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./db.js";

// ---------------------------------------------------------------------------
// Bulk seed squads + team members from a JSON config file (idempotent).
//
//   npm run seed:config                       # reads ./dashboard-config-seed.json
//   npm run seed:config -- path/to/file.json  # custom path
//
// File shape (see dashboard-config-seed.example.json):
//   {
//     "squads": [{ name, boardId, spDefault, spFe, spBe, spQa,
//                  confluenceSpaceKey, confluenceParentId }],
//     "teams":  [{ name, fullName, squads: ["Athens", ...], position, jiraAccountId }]
//   }
// Squads are upserted by name; a member is upserted by (squad, name) so re-runs
// don't create duplicates. Empty strings are stored as null.
// ---------------------------------------------------------------------------

interface SquadCfg {
  name: string;
  boardId?: string;
  spDefault?: string;
  spFe?: string;
  spBe?: string;
  spQa?: string;
  confluenceSpaceKey?: string;
  confluenceParentId?: string;
}

interface TeamCfg {
  name: string;
  fullName?: string;
  squads?: string[];
  position?: string;
  jiraAccountId?: string;
}

interface Config {
  squads?: SquadCfg[];
  teams?: TeamCfg[];
}

/** "" / whitespace / undefined → null; otherwise the trimmed string. */
const orNull = (v?: string): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

async function main() {
  const file = resolve(process.cwd(), process.argv[2] ?? "dashboard-config-seed.json");
  let cfg: Config;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (e: any) {
    throw new Error(`Could not read/parse config file "${file}": ${e?.message ?? e}`);
  }

  const squads = cfg.squads ?? [];
  const teams = cfg.teams ?? [];

  // 1) Squads — upsert by unique name.
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
    console.log(`Squad ready: ${squad.name} (board ${squad.defaultBoardId ?? "—"})`);
  }

  // Ensure squads referenced by teams exist even if not listed under "squads".
  for (const t of teams) {
    for (const sq of t.squads ?? []) {
      if (byName.has(sq)) continue;
      const squad = await prisma.squad.upsert({
        where: { name: sq },
        create: { name: sq },
        update: {},
      });
      byName.set(squad.name, squad.id);
      console.log(`Squad ready: ${squad.name} (created from team reference)`);
    }
  }

  // 2) Team members — one row per (squad, member); upsert by (squadId, name).
  let created = 0;
  let updated = 0;
  for (const t of teams) {
    if (!t.name?.trim()) continue;
    const position = (t.position ?? "ALL").trim() || "ALL";
    for (const sq of t.squads ?? []) {
      const squadId = byName.get(sq);
      if (!squadId) {
        console.warn(`  ! Skipping ${t.name}: squad "${sq}" not found.`);
        continue;
      }
      const data = {
        fullName: orNull(t.fullName),
        position: position as any,
        jiraAccountId: orNull(t.jiraAccountId),
      };
      const existing = await prisma.teamMember.findFirst({
        where: { squadId, name: t.name.trim() },
      });
      if (existing) {
        await prisma.teamMember.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.teamMember.create({ data: { squadId, name: t.name.trim(), ...data } });
        created++;
      }
    }
  }

  console.log(`Members: ${created} created, ${updated} updated across ${byName.size} squad(s).`);
  console.log("Config seed complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
