import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./db.js";
import { seedFromConfig, type SeedConfig } from "./seedConfigCore.js";

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

async function main() {
  const file = resolve(process.cwd(), process.argv[2] ?? "dashboard-config-seed.json");
  let cfg: SeedConfig;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (e: any) {
    throw new Error(`Could not read/parse config file "${file}": ${e?.message ?? e}`);
  }

  const res = await seedFromConfig(prisma, cfg);
  console.log(
    `Config seed complete: ${res.squads} squad(s), ${res.membersCreated} member(s) created, ${res.membersUpdated} updated.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
