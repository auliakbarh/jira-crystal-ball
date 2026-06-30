import { describe, it, expect } from "vitest";
import {
  formatDuration,
  isWeekend,
  workingDays,
  dayBreakdown,
  computeLeadSchedule,
  statusBucket,
  issueTypeRank,
  hiddenByDefaultStatus,
  isOnLeave,
} from "./helpers";

describe("formatDuration", () => {
  it("formats seconds/minutes/hours", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3725)).toBe("1h 02m 05s");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("isWeekend", () => {
  it("detects Sat/Sun", () => {
    expect(isWeekend("2026-06-27")).toBe(true); // Sat
    expect(isWeekend("2026-06-28")).toBe(true); // Sun
    expect(isWeekend("2026-06-29")).toBe(false); // Mon
  });
});

describe("workingDays / dayBreakdown", () => {
  it("excludes weekends and holidays", () => {
    // Mon 2026-06-29 .. Fri 2026-07-03 = 5 working, minus 1 holiday
    const days = workingDays("2026-06-29", "2026-07-03", new Set(["2026-07-01"]));
    expect(days).toEqual(["2026-06-29", "2026-06-30", "2026-07-02", "2026-07-03"]);
  });
  it("breaks a range into total/working/weekend/holiday", () => {
    const b = dayBreakdown("2026-06-29", "2026-07-05", new Set(["2026-07-01"]));
    expect(b.total).toBe(7);
    expect(b.weekend).toBe(2); // Jul 4-5
    expect(b.holiday).toBe(1);
    expect(b.working).toBe(4);
  });
});

describe("statusBucket", () => {
  it("buckets common statuses", () => {
    expect(statusBucket("Done")).toBe("Done");
    expect(statusBucket("In Review (QA)")).toBe("In QA");
    expect(statusBucket("In Progress")).toBe("In Progress");
    expect(statusBucket("To Do")).toBe("To Do");
    expect(statusBucket("backlog")).toBe("To Do");
  });
});

describe("issueTypeRank", () => {
  it("orders Epic > Story > Task > Sub-task > Spike", () => {
    const order = ["Spike", "Sub-task", "Task", "Story", "Epic"]
      .map((t) => ({ t, r: issueTypeRank(t) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.t);
    expect(order).toEqual(["Epic", "Story", "Task", "Sub-task", "Spike"]);
  });
});

describe("hiddenByDefaultStatus", () => {
  it("hides Done and Archived", () => {
    expect(hiddenByDefaultStatus("Done")).toBe(true);
    expect(hiddenByDefaultStatus("Archived")).toBe(true);
    expect(hiddenByDefaultStatus("In Progress")).toBe(false);
  });
});

describe("isOnLeave", () => {
  it("checks inclusive range", () => {
    expect(isOnLeave("2026-06-01", "2026-06-05", "2026-06-03")).toBe(true);
    expect(isOnLeave("2026-06-01", "2026-06-05", "2026-06-06")).toBe(false);
  });
});

describe("computeLeadSchedule", () => {
  const members = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
    { id: "3", name: "Cara" },
  ];
  it("rotates one lead per working day", () => {
    const s = computeLeadSchedule(members, new Set(), "2026-06-29", "2026-07-01"); // Mon-Wed
    expect(s.map((d) => d.leadName)).toEqual(["Alice", "Bob", "Cara"]);
  });
  it("excludes a member on CUTI (turn passes on)", () => {
    const m = [
      { id: "1", name: "Alice", leaves: [{ type: "CUTI", startDate: "2026-06-29", endDate: "2026-06-29" }] },
      { id: "2", name: "Bob" },
    ];
    const s = computeLeadSchedule(m, new Set(), "2026-06-29", "2026-06-29");
    expect(s[0].leadName).toBe("Bob");
  });
  it("covers SAKIT/IZIN and keeps the skipped member next (switch)", () => {
    const m = [
      { id: "1", name: "Alice", leaves: [{ type: "SAKIT", startDate: "2026-06-29", endDate: "2026-06-29" }] },
      { id: "2", name: "Bob" },
    ];
    const s = computeLeadSchedule(m, new Set(), "2026-06-29", "2026-06-30");
    expect(s[0].coveringForName).toBe("Alice"); // Bob covers day 1
    expect(s[0].leadName).toBe("Bob");
    expect(s[1].leadName).toBe("Alice"); // Alice leads next day
  });
});
