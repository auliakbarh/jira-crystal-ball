import { PubSub } from "graphql-subscriptions";

export const pubsub = new PubSub();

// Event channel name for a sprint's standup/dashboard changes.
export const standupTopic = (sprintId: string) => `STANDUP_CHANGED:${sprintId}`;

// Publish a change so subscribers re-fetch. `kind` describes what changed.
export function publishStandupChange(sprintId: string, kind: string) {
  void pubsub.publish(standupTopic(sprintId), { standupChanged: { sprintId, kind } });
}

// --- Tarot (planning poker) room events ---------------------------------
export const tarotTopic = (roomId: string) => `TAROT_ROOM:${roomId}`;

// kind: join | leave | kick | vote | reveal | decided | round_start |
//       next_cycle | reset | synced | ended | deleted
export function publishTarotEvent(roomId: string, kind: string, actor?: string | null) {
  void pubsub.publish(tarotTopic(roomId), { tarotRoomChanged: { roomId, kind, actor: actor ?? null } });
}
