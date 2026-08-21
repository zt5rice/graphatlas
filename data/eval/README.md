# Golden Question Set (GraphAtlas)

50 hand-authored English questions over the Aurora Dynamics corpus
(`data/corpus/`). This file is the ground truth for the benchmark runner
(ZHA-70) and the measured results that go into the README.

## Schema

```json
{
  "id": "q001",
  "category": "single_hop | multi_hop | global | hard",
  "question": "...",
  "golden_answer": "...",
  "expected_entities": ["Entity A", "Entity B"],
  "expected_relations": ["Entity A <relation> Entity B"],
  "expected_sources": ["01-org-chart.md"],
  "expected_chunk_ids": [],
  "notes": "..."
}
```

## Category balance

| Category | Count | Purpose |
|---|---|---|
| `single_hop` | 15 | Answer lives in one document/fact |
| `multi_hop` | 15 | Requires joining relations across documents |
| `global` | 10 | Aggregation / overview questions |
| `hard` | 10 | Cross-doc joins, near-duplicate names, out-of-scope negatives |

## Metric mapping

- `expected_entities` → `EntityRecall@k` (retrieved evidence entities)
- `expected_relations` → `RelationRecall@k`
- `expected_sources` → `ChunkRecall@k` (top-k evidence must include chunks from each
  expected source file; `expected_chunk_ids` is populated post-ingestion when chunk ids are known)
- `golden_answer` → `Hit@1` / `Hit@5` (LLM-as-judge) and faithfulness scoring

## Rules

- No tuning on this set before the final measured run; record corpus + judge versions in
  each `benchmark/results/*.json`.
- Any README/resume number must trace back to a result JSON produced from this file.
