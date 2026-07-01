import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto.js";

describe("crypto (AES-256-GCM secret at rest)", () => {
  it("round-trips a token", () => {
    const enc = encryptSecret("my-secret-token", "passphrase");
    expect(enc).not.toContain("my-secret-token");
    expect(decryptSecret(enc, "passphrase")).toBe("my-secret-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("x", "k");
    const b = encryptSecret("x", "k");
    expect(a).not.toBe(b);
    expect(decryptSecret(a, "k")).toBe("x");
    expect(decryptSecret(b, "k")).toBe("x");
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptSecret("x", "right");
    expect(() => decryptSecret(enc, "wrong")).toThrow();
  });
});
