# GraphAtlas Benchmark

Measured results are produced by this repo's own runner (`benchmark/run.ts`) over the
50-question golden set (`data/eval/golden_questions.json`) on the Aurora Dynamics corpus
(`data/corpus/`). **Every number below traces to a JSON file in
`benchmark/results/`** — no preset figures.

## Methodology

- Corpus: 12 markdown docs + 2 CSVs (org chart, teams, projects, customers, vendors,
  runbooks, incidents, roadmap, hiring, security policy, OKRs, contracts, headcount,
  sales pipeline) ingested through the real pipeline (LightRAG extraction + ETL).
- Questions: 50 hand-authored (15 single-hop, 15 multi-hop, 10 global, 10 hard).
- Modes (ablation): `hybrid` (keyword + vector + graph + RRF), `keyword-only`,
  `vector-only`, `graph-only`.
- Judge: OpenAI-compatible LLM (temperature 0, fixed prompts). `Hit@k` = binary verdict
  whether the top-k evidence suffices to answer the golden question. `Faithfulness` =
  1–5 rating of how faithfully top-5 evidence reflects the golden answer.
- Run command: `bun --env-file=.env benchmark/run.ts --mode <mode> --limit 50
  --out benchmark/results/<date>-<mode>.json`; summary: `bun benchmark --summary`.

## Results (2026-08-22)

| Mode | Hit@1 | Hit@5 | EntityRecall@10 | ChunkRecall@10 | Faithfulness (1–5) | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| hybrid | 0.200 | **0.840** | 0.688 | 0.860 | 4.38 | 391 | 537 |
| keyword-only | 0.000 | 0.000 | 0.000 | 0.000 | 1.26 | 4 | 27 |
| vector-only | 0.620 | 0.800 | 0.688 | 0.860 | 4.36 | 360 | 616 |
| graph-only | 0.220 | 0.240 | 0.684 | 0.000 | 2.44 | 5 | 10 |

### Reading the results

- **Hybrid fusion improves answer coverage**: Hit@5 = 0.84 vs 0.80 vector-only
  (+4 pp) and 0.00 keyword-only / 0.24 graph-only. It also carries graph evidence
  (EntityRecall@10 = 0.69) at comparable latency.
- **Keyword-only is weak** on this corpus (whole-query `tsvector` matching requires
  every term in one chunk) — a real finding, not a tuned claim.
- **Graph-only recovers entities** but few source chunks (0.00 ChunkRecall@10),
  confirming graph evidence is a complement, not a replacement.
- Faithfulness (LLM-judged 1–5): hybrid 4.38 ≈ vector-only 4.36 > graph-only 2.44 >
  keyword-only 1.26.

All rows are computed by `benchmark/run.ts` from the 50-question golden set on
2026-08-22 and trace to `benchmark/results/2026-08-22-<mode>.json`.

## Rules

- Any number quoted on the README/resume must match the corresponding JSON result file.
- Reruns record the corpus + judge versions; no tuning on the golden set before a final run.
