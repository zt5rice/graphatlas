import { getDb, embedTexts } from "@graphatlas/db";
import {
  buildDiagnostics,
  fuseCandidates,
  graphRecall,
  keywordRecall,
  resolveMode,
  vectorRecall,
  type FusedCandidate,
  type GraphEntity,
  type GraphRelation,
  type QueryMode,
} from "@graphatlas/core";

export type SearchInput = {
  query: string;
  mode?: QueryMode;
  topK: number;
  minScore?: number;
  documentIds?: string[];
  /** Ablation control: restrict which recall paths run (benchmark). */
  paths?: RecallPath[];
};

export type RecallPath = "keyword" | "vector" | "graph";

export type SearchResponse = {
  query: string;
  mode: QueryMode;
  mode_source: string;
  results: {
    chunk_id: string;
    document_id: string;
    snippet: string;
    text: string;
    score: number;
    match_types: string[];
    rank_details: { path: string; rank: number; raw_score: number }[];
  }[];
  evidence: {
    entities: { id: string; name: string; type: string; description: string }[];
    relations: { id: string; src: string; tgt: string; keywords: string; description: string }[];
  };
  diagnostics: { path: string; status: string; candidates: number }[];
  fusion: { method: string; k: number };
};

export const searchDeps: { embed?: (text: string) => Promise<number[]> } = {};

const MODES: QueryMode[] = ["local", "global", "mix"];

async function defaultEmbed(query: string): Promise<number[]> {
  const vectors = await embedTexts([query]);
  return vectors[0]!;
}

function serializeResult(candidate: FusedCandidate) {
  return {
    chunk_id: candidate.chunkId,
    document_id: candidate.documentId,
    snippet: candidate.snippet,
    text: candidate.text,
    score: candidate.normalizedScore,
    match_types: candidate.matchTypes,
    rank_details: candidate.rankDetails.map((d) => ({
      path: d.path,
      rank: d.rank,
      raw_score: d.rawScore,
    })),
  };
}

export async function searchDocuments(input: SearchInput): Promise<SearchResponse> {
  const sql = getDb();
  const query = input.query.trim();
  const topK = input.topK;
  const documentIds = input.documentIds ?? [];
  const paths = input.paths ?? (["keyword", "vector", "graph"] as RecallPath[]);
  const want = (path: RecallPath) => paths.includes(path);

  const modeDecision =
    input.mode && MODES.includes(input.mode)
      ? { mode: input.mode, source: "request" as const }
      : await resolveMode(query);

  const keywordCandidates = want("keyword")
    ? await keywordRecall(sql, query, { limit: topK, documentIds })
    : [];

  const vectorResult = want("vector")
    ? await vectorRecall(sql, searchDeps.embed ?? defaultEmbed, query, {
        limit: topK,
        model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
        dim: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
        documentIds,
      })
    : { chunks: [], entities: [], relations: [] };

  const mentionRows = await sql<{ name: string }[]>`
    SELECT name FROM graphatlas.entities
    WHERE ${query} ILIKE '%' || name || '%'
    LIMIT 10
  `;
  const mentionSeeds = mentionRows.map((r) => r.name);
  const vectorSeeds = want("vector") ? vectorResult.entities.slice(0, 5).map((e) => e.name) : [];
  const uniqueSeeds = Array.from(
    new Set([...mentionSeeds, ...vectorSeeds].filter((name) => name.length > 0)),
  );

  const graphResult = want("graph")
    ? await graphRecall(sql, uniqueSeeds, { maxHop: 2 })
    : { seeds: [], entities: [], relations: [], chunkIds: [] };

  const graphChunkRows =
    graphResult.chunkIds.length > 0
      ? await sql<{ chunk_id: string; document_id: string; text: string }[]>`
          SELECT id AS chunk_id, document_id, text
          FROM graphatlas.chunks
          WHERE id = ANY(${graphResult.chunkIds})
        `
      : [];
  const graphCandidates = graphChunkRows.map((row, index) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    text: row.text,
    snippet: row.text.slice(0, 220),
    matchTypes: ["graph"],
    ranks: { graph: index + 1 },
    rawScores: { graph: 1 / (index + 1) },
  })).filter((c) => documentIds.length === 0 || documentIds.includes(c.documentId));

  const fused = fuseCandidates([keywordCandidates, vectorResult.chunks, graphCandidates], {
    minScore: input.minScore,
  });
  const results = fused.slice(0, topK).map(serializeResult);

  const evidenceEntities = new Map<string, { id: string; name: string; type: string; description: string }>();
  for (const e of vectorResult.entities) {
    evidenceEntities.set(e.name, { id: e.id, name: e.name, type: "UNKNOWN", description: "" });
  }
  for (const e of graphResult.entities) {
    evidenceEntities.set(e.name, {
      id: e.id,
      name: e.name,
      type: (e as GraphEntity).entityType,
      description: (e as GraphEntity).description,
    });
  }
  const evidenceRelations = new Map<string, { id: string; src: string; tgt: string; keywords: string; description: string }>();
  for (const r of graphResult.relations) {
    const rel = r as GraphRelation;
    evidenceRelations.set(rel.id, {
      id: rel.id,
      src: rel.srcId,
      tgt: rel.tgtId,
      keywords: rel.keywords,
      description: rel.description,
    });
  }

  return {
    query,
    mode: modeDecision.mode,
    mode_source: modeDecision.source,
    results,
    evidence: {
      entities: [...evidenceEntities.values()].slice(0, 20),
      relations: [...evidenceRelations.values()].slice(0, 30),
    },
    diagnostics: buildDiagnostics([
      { path: "keyword", candidates: keywordCandidates },
      { path: "vector", candidates: vectorResult.chunks },
      { path: "graph", candidates: graphCandidates },
    ]),
    fusion: { method: "rrf", k: 60 },
  };
}
