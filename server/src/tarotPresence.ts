// Presence sweep: detects when a tarot participant goes offline (heartbeat went
// stale) and pushes a `presence` event so other clients update the roster live,
// instead of waiting for their next poll.
//
// Multi-instance: with N server processes (REDIS_URL set) every instance would
// otherwise run the sweep and publish the same offline event up to N times
// (harmless refetch, but wasteful). We elect a single leader via a short Redis
// lease so only one instance sweeps at a time. Without Redis (single instance)
// there's nothing to dedupe, so the sweep always runs.
import { prisma } from "./db.js";
import { publishTarotEvent } from "./pubsub.js";

const STALE_MS = 15_000;
const SWEEP_MS = 5_000;
// Lease must outlive a couple of sweep intervals so a busy tick doesn't drop it.
const LEASE_MS = SWEEP_MS * 2 + 1_000;
const LEADER_KEY = "jcb:presence:leader";
const INSTANCE_ID = `${process.pid}-${Math.floor(process.uptime() * 1000)}`;

// Last-known set of online participant ids per active room.
const lastOnline = new Map<string, string>();

// Lazily-created Redis client (only when REDIS_URL is set). null → single instance.
let redis: any = null;
let redisReady = false;
async function ensureRedis(): Promise<void> {
  if (redisReady) return;
  redisReady = true;
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const Redis = (await import("ioredis")).default;
    redis = new Redis(url);
  } catch (e: any) {
    console.error("Presence sweep: Redis init failed, running unclustered:", e?.message ?? e);
    redis = null;
  }
}

// True if this instance may run the sweep this tick. Acquires or renews a short
// lease; other instances see the held key and skip. Fails open (returns true) if
// Redis errors, so presence keeps working rather than silently stopping.
async function acquireLeadership(): Promise<boolean> {
  if (!redis) return true;
  try {
    const ok = await redis.set(LEADER_KEY, INSTANCE_ID, "PX", LEASE_MS, "NX");
    if (ok === "OK") return true;
    const cur = await redis.get(LEADER_KEY);
    if (cur === INSTANCE_ID) {
      await redis.pexpire(LEADER_KEY, LEASE_MS); // renew our lease
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function onlineKey(ids: string[]): string {
  return ids.sort().join(",");
}

async function sweep() {
  await ensureRedis();
  if (!(await acquireLeadership())) return;

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
  console.log(
    process.env.REDIS_URL
      ? "Tarot: presence sweep enabled (leader-elected across instances)."
      : "Tarot: presence sweep enabled.",
  );
}
