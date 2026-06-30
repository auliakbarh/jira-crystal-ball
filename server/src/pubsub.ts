import { PubSub } from "graphql-subscriptions";

export const pubsub = new PubSub();

// Event channel name for a sprint's standup/dashboard changes.
export const standupTopic = (sprintId: string) => `STANDUP_CHANGED:${sprintId}`;

// Publish a change so subscribers re-fetch. `kind` describes what changed.
export function publishStandupChange(sprintId: string, kind: string) {
  void pubsub.publish(standupTopic(sprintId), { standupChanged: { sprintId, kind } });
}
