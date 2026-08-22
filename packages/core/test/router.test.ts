import { describe, expect, test } from "bun:test";
import { resolveMode } from "../src/retrieval/router";

describe("mode router", () => {
  test("relationship questions route to local", async () => {
    const decision = await resolveMode("Who does Ethan Brooks report to?");
    expect(decision.mode).toBe("local");
    expect(decision.source).toBe("rule");
  });

  test("aggregation questions route to global", async () => {
    const decision = await resolveMode("How many teams own projects?");
    expect(decision.mode).toBe("global");
    expect(decision.source).toBe("rule");
  });

  test("compound questions route to mix", async () => {
    const decision = await resolveMode("Who manages the most teams overall?");
    expect(decision.mode).toBe("mix");
    expect(decision.source).toBe("rule");
  });

  test("unknown questions fall back to mix", async () => {
    const decision = await resolveMode("What is the weather like today?");
    expect(decision.mode).toBe("mix");
    expect(decision.source).toBe("fallback");
  });

  test("LLM classifier overrides fallback when provided", async () => {
    const decision = await resolveMode("random wording here", {
      llmClassify: async () => "global",
    });
    expect(decision.mode).toBe("global");
    expect(decision.source).toBe("llm");
  });

  test("LLM classifier failure falls back to mix", async () => {
    const decision = await resolveMode("random wording here", {
      llmClassify: async () => {
        throw new Error("timeout");
      },
    });
    expect(decision.mode).toBe("mix");
    expect(decision.source).toBe("fallback");
  });
});
