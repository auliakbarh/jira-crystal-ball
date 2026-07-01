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

// Purge ended tarot rooms past the retention window (default 30 days), so
// history doesn't accumulate forever. 0 disables. Cascades rounds/votes/results.
const TAROT_RETENTION_DAYS = Number(process.env.TAROT_ROOM_RETENTION_DAYS ?? "30");

async function purgeOldTarotRooms() {
  if (!Number.isFinite(TAROT_RETENTION_DAYS) || TAROT_RETENTION_DAYS <= 0) return;
  const cutoff = new Date(Date.now() - TAROT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const res = await prisma.tarotRoom.deleteMany({
      where: { status: "ENDED", endedAt: { lt: cutoff } },
    });
    if (res.count) console.log(`🧹 Purged ${res.count} ended tarot room(s) older than ${TAROT_RETENTION_DAYS}d`);
  } catch (e: any) {
    console.error("Tarot room purge failed:", e?.message ?? e);
  }
}

// Purge ActivityLog / StandupLog rows past the retention window. 0 (default)
// disables — keep everything. Both are audit/history tables that grow forever.
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? "0");

async function purgeOldLogs() {
  if (!Number.isFinite(LOG_RETENTION_DAYS) || LOG_RETENTION_DAYS <= 0) return;
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const act = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const std = await prisma.standupLog.deleteMany({ where: { endedAt: { lt: cutoff } } });
    if (act.count || std.count)
      console.log(`🧹 Purged ${act.count} activity + ${std.count} standup log(s) older than ${LOG_RETENTION_DAYS}d`);
  } catch (e: any) {
    console.error("Log purge failed:", e?.message ?? e);
  }
}

export function startScheduler() {
  // Tarot room retention runs regardless of Confluence config.
  setTimeout(() => void purgeOldTarotRooms(), 20_000);
  setInterval(() => void purgeOldTarotRooms(), 60 * 60 * 1000);
  console.log(
    TAROT_RETENTION_DAYS > 0
      ? `Scheduler: tarot room retention = ${TAROT_RETENTION_DAYS} days.`
      : "Scheduler: tarot room retention disabled.",
  );

  // Activity/standup log retention, same cadence.
  setTimeout(() => void purgeOldLogs(), 25_000);
  setInterval(() => void purgeOldLogs(), 60 * 60 * 1000);
  console.log(
    LOG_RETENTION_DAYS > 0
      ? `Scheduler: activity/standup log retention = ${LOG_RETENTION_DAYS} days.`
      : "Scheduler: activity/standup log retention disabled.",
  );

  if (!confluenceConfigured()) {
    console.log("Scheduler: Confluence not configured — auto-export disabled.");
    return;
  }
  // Run shortly after boot, then hourly.
  setTimeout(() => void tick(), 10_000);
  setInterval(() => void tick(), 60 * 60 * 1000);
  console.log("Scheduler: hourly Confluence auto-export enabled.");
}
