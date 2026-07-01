import { describe, it, expect } from "vitest";
import { presetValues, deckStrings, isOnline, voteStats, capRolePoint, TAROT_STALE_MS } from "./tarotLogic";

describe("presetValues", () => {
  it("returns the Fibonacci preset", () => {
    expect(presetValues("FIBONACCI")).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
  });
  it("returns the Scrum preset", () => {
    expect(presetValues("SCRUM")).toContain(0.5);
    expect(presetValues("SCRUM")).toContain(100);
  });
  it("parses CUSTOM JSON, dropping non-numbers", () => {
    expect(presetValues("CUSTOM", "[1,2,3,5,8]")).toEqual([1, 2, 3, 5, 8]);
    expect(presetValues("CUSTOM", '[1,"x",3]')).toEqual([1, 3]);
  });
  it("falls back to Fibonacci for an unknown type, and [] for bad CUSTOM", () => {
    expect(presetValues("NOPE")).toEqual(presetValues("FIBONACCI"));
    expect(presetValues("CUSTOM", "not json")).toEqual([]);
  });
});

describe("deckStrings", () => {
  it("stringifies numbers and always appends the special cards", () => {
    const deck = deckStrings("CUSTOM", "[1,2,3]");
    expect(deck).toEqual(["1", "2", "3", "?", "coffee"]);
  });
  it("keeps 0.5 readable", () => {
    expect(deckStrings("SCRUM")).toContain("0.5");
  });
});

describe("isOnline", () => {
  const now = 1_000_000;
  it("is online when seen recently and not left/kicked", () => {
    expect(isOnline({ leftAt: null, kicked: false, lastSeen: new Date(now - 1000) }, now)).toBe(true);
  });
  it("is offline when heartbeat is stale", () => {
    expect(isOnline({ leftAt: null, kicked: false, lastSeen: new Date(now - TAROT_STALE_MS - 1) }, now)).toBe(false);
  });
  it("is offline when left or kicked", () => {
    expect(isOnline({ leftAt: new Date(now), kicked: false, lastSeen: new Date(now) }, now)).toBe(false);
    expect(isOnline({ leftAt: null, kicked: true, lastSeen: new Date(now) }, now)).toBe(false);
  });
});

describe("voteStats", () => {
  it("computes sync % and the clear most-picked numeric suggestion", () => {
    const s = voteStats([{ value: "5" }, { value: "5" }, { value: "8" }]);
    expect(s.suggestion).toBe("5");
    expect(s.syncPercent).toBe(67); // 2 of 3
  });
  it("returns null suggestion on a numeric draw", () => {
    const s = voteStats([{ value: "3" }, { value: "5" }]);
    expect(s.suggestion).toBeNull();
    expect(s.syncPercent).toBe(50);
  });
  it("ignores special cards for the suggestion but counts them for sync %", () => {
    const s = voteStats([{ value: "?" }, { value: "?" }, { value: "5" }]);
    expect(s.suggestion).toBe("5"); // only numeric considered
    expect(s.syncPercent).toBe(67); // "?" is the top value (2 of 3)
  });
  it("handles an empty round", () => {
    expect(voteStats([])).toEqual({ syncPercent: null, suggestion: null });
  });
});

describe("capRolePoint", () => {
  it("passes through null/undefined", () => {
    expect(capRolePoint(null, 5, "FE")).toBeNull();
    expect(capRolePoint(undefined, 5, "FE")).toBeNull();
  });
  it("accepts a value within [0, effort]", () => {
    expect(capRolePoint(3, 5, "FE")).toBe(3);
    expect(capRolePoint(5, 5, "BE")).toBe(5);
    expect(capRolePoint(0, 5, "QA")).toBe(0);
  });
  it("throws when exceeding the effort", () => {
    expect(() => capRolePoint(8, 5, "FE")).toThrow(/cannot exceed the ticket effort \(5\)/);
  });
  it("throws on a negative or non-numeric value", () => {
    expect(() => capRolePoint(-1, 5, "QA")).toThrow(/Invalid QA point/);
    expect(() => capRolePoint("abc", 5, "BE")).toThrow(/Invalid BE point/);
  });
});
