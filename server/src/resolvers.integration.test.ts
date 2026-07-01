// Resolver-level integration tests. These hit a REAL Postgres, so they only run
// when TEST_DATABASE_URL is set (otherwise the whole suite is skipped — `npm test`
// stays green without a database).
//
//   createdb jcb_test
//   TEST_DATABASE_URL="postgresql://jcb:jcb_password@localhost:5432/jcb_test?schema=public" \
//     npx prisma db push --skip-generate   # once, to create the schema
//   TEST_DATABASE_URL="…" npm run test:integration
//
// Fixtures are created in beforeAll and removed in afterAll (squad delete cascades).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("resolver integration (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let squadId = "";
  let sprintId = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const squad = await prisma.squad.create({ data: { name: `itest-${Date.now()}` } });
    squadId = squad.id;
    const sprint = await prisma.sprint.create({
      data: {
        squadId,
        number: 1,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-05"),
      },
    });
    sprintId = sprint.id;
    // Two tickets, 8 pts committed; T-1 (5 pts) Done from day one, T-2 (3 pts) not.
    await prisma.standupEntry.createMany({
      data: [
        { sprintId, date: new Date("2026-01-01"), ticketKey: "T-1", ticketStatus: "Done", storyPoints: 5 },
        { sprintId, date: new Date("2026-01-01"), ticketKey: "T-2", ticketStatus: "In Progress", storyPoints: 3 },
      ],
    });
  });

  afterAll(async () => {
    if (prisma && squadId) await prisma.squad.delete({ where: { id: squadId } }).catch(() => undefined);
    await prisma?.$disconnect();
  });

  const ctx = () => ({ prisma, userId: "itest", userName: null }) as any;

  it("velocity sums committed vs completed points from entry snapshots", async () => {
    const { velocityResolvers } = await import("./resolvers/velocity.js");
    const rows = await velocityResolvers.Query.velocity(null, { squadId }, ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0].committedPoints).toBe(8);
    expect(rows[0].completedPoints).toBe(5);
    expect(rows[0].ticketCount).toBe(2);
    expect(rows[0].doneCount).toBe(1);
  });

  it("burndown returns one point per calendar day, remaining nets out done work", async () => {
    const { velocityResolvers } = await import("./resolvers/velocity.js");
    const pts = await velocityResolvers.Query.burndown(null, { sprintId }, ctx());
    expect(pts.length).toBe(5); // Jan 1..5 inclusive
    expect(pts[0].remainingPoints).toBe(3); // 8 committed − 5 done = 3
    expect(pts[pts.length - 1].idealPoints).toBe(0); // ideal line ends at zero
  });

  it("squads query lists the created squad", async () => {
    const { squadResolvers } = await import("./resolvers/squad.js");
    const squads = await squadResolvers.Query.squads(null, {}, ctx());
    expect(squads.some((s: any) => s.id === squadId)).toBe(true);
  });
});
