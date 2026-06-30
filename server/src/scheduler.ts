import { prisma } from "./db.js";
import { resolvers } from "./resolvers.js";
import { confluenceConfigured } from "./confluence.js";
import type { Context } from "./context.js";

// System context for automated exports (bypasses the login requirement).
const systemCtx: Context = { prisma, userId: "system", userName: "Automation" };

// Auto-export to Confluence once a sprint has ended and hasn't been exported yet.
async function tick() {
  if (!confluenceConfigured()) return;
  const today = new Date().toISOString().slice(0, 10);
  const pending = await prisma.sprint.findMany({ where: { confluencePageId: null } });
  for (const s of pending) {
    const end = s.endDate.toISOString().slice(0, 10);
    if (end >= today) continue; // not ended yet
    try {
      await (resolvers as any).Mutation.exportSprintToConfluence(null, { sprintId: s.id }, systemCtx);
      console.log(`📄 Auto-exported sprint ${s.number} to Confluence`);
    } catch (e: any) {
      console.error(`Auto-export failed for sprint ${s.id}:`, e?.message ?? e);
    }
  }
}

export function startScheduler() {
  if (!confluenceConfigured()) {
    console.log("Scheduler: Confluence not configured — auto-export disabled.");
    return;
  }
  // Run shortly after boot, then hourly.
  setTimeout(() => void tick(), 10_000);
  setInterval(() => void tick(), 60 * 60 * 1000);
  console.log("Scheduler: hourly Confluence auto-export enabled.");
}
