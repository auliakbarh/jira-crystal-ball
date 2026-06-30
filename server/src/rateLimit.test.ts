import { describe, it, expect } from "vitest";
import { assertNotLocked, recordFailure, recordSuccess } from "./rateLimit.js";

describe("rateLimit", () => {
  it("locks after 5 failures and clears on success", () => {
    const key = `user-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(() => assertNotLocked(key)).not.toThrow();
      recordFailure(key);
    }
    // 6th attempt is locked
    expect(() => assertNotLocked(key)).toThrow(/Too many failed attempts/);
  });

  it("a successful login resets the counter", () => {
    const key = `user-${Math.random()}`;
    recordFailure(key);
    recordFailure(key);
    recordSuccess(key);
    // back to clean: 4 more failures still allowed before lock
    for (let i = 0; i < 4; i++) {
      expect(() => assertNotLocked(key)).not.toThrow();
      recordFailure(key);
    }
    expect(() => assertNotLocked(key)).not.toThrow();
  });
});
