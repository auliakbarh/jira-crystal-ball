// Presence sweep: detects when a tarot participant goes offline (heartbeat went
// stale) and pushes a `presence` event so other clients update the roster live,
// instead of waiting for their next poll.
import { prisma } from "./db.js";
import { publishTarotEvent } from "./pubsub.js";

const STALE_MS = 15_000;
const SWEEP_MS = 5_000;

// Last-known set of online participant ids per active room.
const lastOnline = new Map<string, string>();

function onlineKey(ids: string[]): string {
  return ids.sort().join(",");
}

async function sweep() {
  const rooms = await prisma.tarotRoom.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const activeIds = new Set(rooms.map((r) => r.id));
  // Drop snapshots for rooms that ended/were deleted.
  for (const id of lastOnline.keys()) if (!activeIds.has(id)) lastOnline.delete(id);

  const now = Date.now();
  for (const room of rooms) {
    const parts = await prisma.tarotParticipant.findMany({
      where: { roomId: room.id, leftAt: null, kicked: false },
      select: { id: true, lastSeen: true },
    });
    const online = parts.filter((p) => now - new Date(p.lastSeen).getTime() < STALE_MS).map((p) => p.id);
    const key = onlineKey(online);
    const prev = lastOnline.get(room.id);
    if (prev !== undefined && prev !== key) publishTarotEvent(room.id, "presence", null);
    lastOnline.set(room.id, key);
  }
}

export function startTarotPresenceSweep() {
  setInterval(() => void sweep().catch(() => undefined), SWEEP_MS);
  console.log("Tarot: presence sweep enabled.");
}
