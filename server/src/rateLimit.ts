// In-memory failed-login throttle. Per key (email): after MAX_FAILS failures
// within WINDOW_MS, lock further attempts for LOCK_MS. Successful login resets.
// Good enough for a single-process deployment; swap for Redis if you scale out.

const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60_000; // failures counted within 5 minutes
const LOCK_MS = 10 * 60_000; // lockout duration after too many failures

interface Entry {
  fails: number;
  first: number; // window start
  lockedUntil: number;
}

const store = new Map<string, Entry>();

function now() {
  return Date.now();
}

/** Throw if the key is currently locked out. Call before checking the password. */
export function assertNotLocked(key: string): void {
  const e = store.get(key);
  if (e && e.lockedUntil > now()) {
    const mins = Math.ceil((e.lockedUntil - now()) / 60_000);
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }
}

/** Record a failed attempt; locks the key once it exceeds the threshold. */
export function recordFailure(key: string): void {
  const t = now();
  let e = store.get(key);
  if (!e || t - e.first > WINDOW_MS) {
    e = { fails: 0, first: t, lockedUntil: 0 };
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = t + LOCK_MS;
    e.fails = 0;
    e.first = t;
  }
  store.set(key, e);
}

/** Clear state on success. */
export function recordSuccess(key: string): void {
  store.delete(key);
}
