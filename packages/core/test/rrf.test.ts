import { describe, expect, test } from "bun:test";
import { buildDiagnostics, fuseCandidates, rrfScore } from "../src/retrieval/rrf";
import type { RecallCandidate } from "../src/retrieval/types";

function candidate(chunkId: string, rank: number, path: string, raw = 1): RecallCandidate {
  return {
    chunkId,
    documentId: "doc-1",
    text: `text ${chunkId}`,
    snippet: `text ${chunkId}`,
    matchTypes: [path],
    ranks: { [path]: rank },
    rawScores: { [path]: raw },
  };
}

describe("RRF fusion", () => {
  test("rrfScore sums 1/(k+rank)", () => {
    expect(rrfScore({ keyword: 1 }, 60)).toBeCloseTo(1 / 61, 10);
    expect(rrfScore({ keyword: 1, vector: 3 }, 60)).toBeCloseTo(1 / 61 + 1 / 63, 10);
  });

  test("chunk ranked top by both paths fuses to normalized 1.0", () => {
    const keyword = [candidate("c1", 1, "keyword"), candidate("c2", 2, "keyword")];
    const vector = [candidate("c1", 1, "vector:chunk"), candidate("c3", 1, "vector:chunk")];
    const fused = fuseCandidates([keyword, vector]);
    expect(fused[0]!.chunkId).toBe("c1");
    expect(fused[0]!.normalizedScore).toBeCloseTo(1, 10);
    expect(fused[0]!.matchTypes.sort()).toEqual(["keyword", "vector:chunk"]);
    expect(fused[0]!.rankDetails).toHaveLength(2);
  });

  test("minScore filters low-scoring candidates", () => {
    const keyword = [candidate("c1", 1, "keyword")];
    const vector = [candidate("c2", 5, "vector:chunk")];
    const fused = fuseCandidates([keyword, vector], { minScore: 0.99 });
    expect(fused.map((c) => c.chunkId)).toEqual(["c1"]);
  });
});

describe("diagnostics", () => {
  test("reports ok / skipped / failed per path", () => {
    const diagnostics = buildDiagnostics([
      { path: "keyword", candidates: [candidate("c1", 1, "keyword")] },
      { path: "vector", candidates: [] },
      { path: "graph", candidates: null },
    ]);
    expect(diagnostics).toEqual([
      { path: "keyword", status: "ok", candidates: 1 },
      { path: "vector", status: "skipped", candidates: 0 },
      { path: "graph", status: "failed", candidates: 0 },
    ]);
  });
});
