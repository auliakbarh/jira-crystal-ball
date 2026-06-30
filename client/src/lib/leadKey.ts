// Per-tab identity for claiming the standup lock. Stored in sessionStorage so
// closing the tab drops it — the server then sees the heartbeat go stale and
// lets someone else take over.
function makeKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  }
}

let key = sessionStorage.getItem("jcb_leadkey");
if (!key) {
  key = makeKey();
  sessionStorage.setItem("jcb_leadkey", key);
}

export const LEAD_KEY: string = key;
