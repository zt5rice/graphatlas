import { describe, expect, test } from "bun:test";
import { compactQuery, snippet } from "../src/retrieval/snippet";

describe("retrieval helpers", () => {
  test("compactQuery removes whitespace", () => {
    expect(compactQuery("search  tools")).toBe("searchtools");
    expect(compactQuery("liam o'brien")).toBe("liamo'brien");
  });

  test("snippet centers on the first query match", () => {
    const text = "Aurora Dynamics builds enterprise search and knowledge tools.";
    const s = snippet(text, "search");
    expect(s).toContain("search");
    expect(s.length).toBeLessThanOrEqual(220);
  });

  test("snippet falls back to the start when there is no match", () => {
    expect(snippet("hello world", "zzz")).toBe("hello world");
  });
});
