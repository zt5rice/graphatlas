import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getDb, closeDb } from "../packages/db/src/index.ts";
import { searchDocuments, type RecallPath } from "../apps/api/src/services/search.ts";

type Question = {
  id: string;
  category: string;
  question: string;
  golden_answer: string;
  expected_entities: string[];
  expected_relations: string[];
  expected_sources: string[];
  expected_chunk_ids: string[];
};

type PerQuestion = {
  id: string;
  category: string;
  latency_ms: number;
  entity_recall_10: number | null;
  chunk_recall_10: number | null;
  top_chunk_ids: string[];
  evidence_entities: string[];
};

const MODE_PATHS: Record<string, RecallPath[]> = {
  hybrid: ["keyword", "vector", "graph"],
  "keyword-only": ["keyword"],
  "vector-only": ["vector"],
  "graph-only": ["graph"],
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx]!;
}

async function loadChunkFilenameMap(): Promise<Map<string, string>> {
  const sql = getDb();
  const rows = await sql<{ chunk_id: string; filename: string | null }[]>`
    SELECT c.id AS chunk_id, d.metadata->>'original_filename' AS filename
    FROM graphatlas.chunks c
    JOIN graphatlas.documents d ON d.id = c.document_id
  `;
  return new Map(rows.map((r) => [r.chunk_id, r.filename ?? ""]));
}

async function run(mode: string, limit: number, outPath: string) {
  const questions = JSON.parse(readFileSync("data/eval/golden_questions.json", "utf8")) as Question[];
  const selected = questions.slice(0, limit);
  const chunkFilename = await loadChunkFilenameMap();
  const perQuestion: PerQuestion[] = [];

  for (const q of selected) {
    const start = performance.now();
    const response = await searchDocuments({
      query: q.question,
      topK: 10,
      paths: MODE_PATHS[mode] ?? MODE_PATHS.hybrid,
    });
    const latencyMs = performance.now() - start;

    const evidenceEntities = new Set(response.evidence.entities.map((e) => e.name));
    const entityRecall =
      q.expected_entities.length === 0
        ? null
        : q.expected_entities.filter((name) => evidenceEntities.has(name)).length /
          q.expected_entities.length;

    const topChunkIds = response.results.slice(0, 10).map((r) => r.chunk_id);
    const topFilenames = new Set(
      topChunkIds.map((id) => chunkFilename.get(id)).filter((f): f is string => Boolean(f)),
    );
    const chunkRecall =
      q.expected_sources.length === 0
        ? null
        : q.expected_sources.filter((src) => topFilenames.has(src)).length / q.expected_sources.length;

    perQuestion.push({
      id: q.id,
      category: q.category,
      latency_ms: latencyMs,
      entity_recall_10: entityRecall,
      chunk_recall_10: chunkRecall,
      top_chunk_ids: topChunkIds,
      evidence_entities: response.evidence.entities.map((e) => e.name).slice(0, 20),
    });
  }

  const latencies = perQuestion.map((q) => q.latency_ms).sort((a, b) => a - b);
  const entityRecalls = perQuestion
    .map((q) => q.entity_recall_10)
    .filter((v): v is number => v !== null);
  const chunkRecalls = perQuestion
    .map((q) => q.chunk_recall_10)
    .filter((v): v is number => v !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const estTokens = selected.reduce(
    (sum, q) => sum + q.question.split(/\s+/).length,
    0,
  );
  const embeddingCalls = mode === "vector-only" || mode === "hybrid" ? selected.length : 0;

  const result = {
    run_id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}`,
    date: new Date().toISOString(),
    mode,
    questions_run: selected.length,
    metrics: {
      entity_recall_10: mean(entityRecalls),
      chunk_recall_10: mean(chunkRecalls),
      latency_p50_ms: percentile(latencies, 50),
      latency_p95_ms: percentile(latencies, 95),
      total_ms: latencies.reduce((a, b) => a + b, 0),
      est_query_tokens: estTokens,
      embedding_calls: embeddingCalls,
      cost_est_usd: embeddingCalls * 0.00002, // text-embedding-3-small $0.02/1M tokens, ~1k tokens/query
    },
    per_question: perQuestion,
    fusion: { method: "rrf", k: 60 },
    notes: "v1 retrieval metrics; Hit@1/5 + faithfulness require LLM judge (added in ZHA-77).",
  };

  mkdirSync(join("benchmark", "results"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(
    `[benchmark] mode=${mode} questions=${result.questions_run} ` +
      `entity_recall_10=${result.metrics.entity_recall_10.toFixed(3)} ` +
      `chunk_recall_10=${result.metrics.chunk_recall_10.toFixed(3)} ` +
      `p50=${result.metrics.latency_p50_ms.toFixed(0)}ms p95=${result.metrics.latency_p95_ms.toFixed(0)}ms ` +
      `-> ${outPath}`,
  );
}

function summary() {
  const dir = join("benchmark", "results");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("summary"));
  console.log("mode            | runs | ent_recall@10 | chunk_recall@10 | p50(ms) | p95(ms)");
  for (const file of files.sort()) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      mode: string;
      metrics: {
        entity_recall_10: number;
        chunk_recall_10: number;
        latency_p50_ms: number;
        latency_p95_ms: number;
      };
    };
    console.log(
      `${data.mode.padEnd(15)} |     1 | ${data.metrics.entity_recall_10.toFixed(3).padStart(12)} | ${data.metrics.chunk_recall_10.toFixed(3).padStart(14)} | ${String(data.metrics.latency_p50_ms.toFixed(0)).padStart(7)} | ${String(data.metrics.latency_p95_ms.toFixed(0)).padStart(6)}`,
    );
  }
}

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "hybrid" },
    limit: { type: "string", default: "50" },
    out: { type: "string" },
    summary: { type: "boolean", default: false },
  },
});

try {
  if (values.summary) {
    summary();
  } else {
    const mode = values.mode!;
    if (!(mode in MODE_PATHS)) {
      throw new Error(`unknown mode '${mode}' (expected ${Object.keys(MODE_PATHS).join(", ")})`);
    }
    const limit = Number(values.limit);
    const out =
      values.out ?? join("benchmark", "results", `${new Date().toISOString().slice(0, 10)}-${mode}.json`);
    await run(mode, limit, out);
  }
} finally {
  await closeDb();
}
