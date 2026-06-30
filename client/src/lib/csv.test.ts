import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins headers + rows and quotes fields with commas/quotes/newlines", () => {
    const csv = toCsv(["a", "b"], [
      ["plain", 1],
      ['has,comma', 'has "quote"'],
      ["line\nbreak", null],
    ]);
    expect(csv).toBe(
      'a,b\r\n' +
        "plain,1\r\n" +
        '"has,comma","has ""quote"""\r\n' +
        '"line\nbreak",',
    );
  });
});
