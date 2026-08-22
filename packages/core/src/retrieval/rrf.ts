import type { RecallCandidate } from "./types";

export const DEFAULT_RRF_K = 60;
const EPS = 1e-9;

export type FusedCandidate = RecallCandidate & {
  fusionScore: number;
  normalizedScore: number;
  rankDetails: { path: string; rank: number; rawScore: number }[];
};

export type RrfOptions = {
  k?: number;
  minScore?: number;
};

export type PathDiagnostics = {
  path: string;
  status: "ok" | "skipped" | "failed";
  candidates: number;
};

export function rrfScore(ranks: Record<string, number>, k = DEFAULT_RRF_K): number {
  return Object.values(ranks).reduce((sum, rank) => sum + 1 / (k + rank), 0);
}

/**
 * Reciprocal Rank Fusion over multiple per-path candidate lists (keyed by
 * chunk id). Each path contributes rank details; scores are normalized to the
 * top fusion score of this query.
 */
export function fuseCandidates(
  pathResults: RecallCandidate[][],
  opts: RrfOptions = {},
): FusedCandidate[] {
  const k = opts.k ?? DEFAULT_RRF_K;
  const byChunk = new Map<string, RecallCandidate>();

  for (const results of pathResults) {
    for (const candidate of results) {
      const existing = byChunk.get(candidate.chunkId);
      if (!existing) {
        byChunk.set(candidate.chunkId, {
          ...candidate,
          matchTypes: [...candidate.matchTypes],
          ranks: { ...candidate.ranks },
          rawScores: { ...candidate.rawScores },
        });
        continue;
      }
      existing.ranks = { ...existing.ranks, ...candidate.ranks };
      existing.rawScores = { ...existing.rawScores, ...candidate.rawScores };
      existing.matchTypes = Array.from(
        new Set([...existing.matchTypes, ...candidate.matchTypes]),
      );
    }
  }

  const scored = [...byChunk.values()].map((candidate) => ({
    ...candidate,
    fusionScore: rrfScore(candidate.ranks, k),
  }));
  scored.sort((a, b) => b.fusionScore - a.fusionScore);

  const maxScore = scored.length > 0 ? scored[0]!.fusionScore : 0;
  const fused: FusedCandidate[] = scored
    .filter((c) => {
      if (opts.minScore === undefined || opts.minScore <= 0) return true;
      return maxScore > 0 && c.fusionScore / maxScore + EPS >= opts.minScore;
    })
    .map(({ fusionScore, ...candidate }) => ({
      ...candidate,
      fusionScore,
      normalizedScore: maxScore > 0 ? fusionScore / maxScore : 0,
      rankDetails: Object.entries(candidate.ranks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, rank]) => ({
          path,
          rank,
          rawScore: candidate.rawScores[path] ?? 0,
        })),
    }));

  return fused;
}

export function buildDiagnostics(
  paths: { path: string; candidates: RecallCandidate[] | null }[],
): PathDiagnostics[] {
  return paths.map(({ path, candidates }) => ({
    path,
    status: candidates === null ? "failed" : candidates.length === 0 ? "skipped" : "ok",
    candidates: candidates?.length ?? 0,
  }));
}
