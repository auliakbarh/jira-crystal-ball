import { PubSub } from "graphql-subscriptions";

// Pub/sub backbone for GraphQL subscriptions.
//
// Default: in-memory `graphql-subscriptions` PubSub — fine for a single server
// process. Set REDIS_URL to fan events out across MULTIPLE instances (horizontal
// scale): subscriptions and presence events then reach clients on any node.
async function makePubSub(): Promise<any> {
  const url = process.env.REDIS_URL;
  if (!url) return new PubSub();
  try {
    const { RedisPubSub } = await import("graphql-redis-subscriptions");
    const Redis = (await import("ioredis")).default;
    const rps: any = new RedisPubSub({
      publisher: new Redis(url),
      subscriber: new Redis(url),
    });
    // graphql-ws calls `asyncIterableIterator`; older RedisPubSub exposes only
    // `asyncIterator`. Alias so resolvers can use one name regardless of backend.
    if (typeof rps.asyncIterableIterator !== "function" && typeof rps.asyncIterator === "function") {
      rps.asyncIterableIterator = rps.asyncIterator.bind(rps);
    }
    console.log("PubSub: Redis backend enabled (multi-instance).");
    return rps;
  } catch (e: any) {
    console.error("PubSub: Redis init failed, falling back to in-memory:", e?.message ?? e);
    return new PubSub();
  }
}

export const pubsub: any = await makePubSub();

// Event channel name for a sprint's standup/dashboard changes.
export const standupTopic = (sprintId: string) => `STANDUP_CHANGED:${sprintId}`;

// Publish a change so subscribers re-fetch. `kind` describes what changed.
export function publishStandupChange(sprintId: string, kind: string) {
  void pubsub.publish(standupTopic(sprintId), { standupChanged: { sprintId, kind } });
}

// --- Tarot (planning poker) room events ---------------------------------
export const tarotTopic = (roomId: string) => `TAROT_ROOM:${roomId}`;

// kind: join | leave | kick | vote | reveal | decided | round_start |
//       next_cycle | reset | synced | ended | deleted | presence | scale
export function publishTarotEvent(roomId: string, kind: string, actor?: string | null) {
  void pubsub.publish(tarotTopic(roomId), { tarotRoomChanged: { roomId, kind, actor: actor ?? null } });
}
