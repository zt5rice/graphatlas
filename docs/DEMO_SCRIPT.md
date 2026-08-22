# GraphAtlas Demo Script (5–8 min)

Record with any screen recorder (macOS: `Cmd+Shift+5`). Keep it under 8 minutes.
The API (:3001) and web (:5173) should be running: `bun run dev:all`.

## 0. Intro (~20s)
- Show the repo page (`github.com/zt5rice/graphatlas`) and say one line:
  "GraphAtlas is a multi-engine GraphRAG knowledge platform: it ingests documents,
  builds a knowledge graph with LLM extraction, and answers questions by fusing
  keyword, vector, and graph retrieval."

## 1. Ingest a document (~1 min)
- Open http://localhost:5173 (Upload / Jobs).
- Upload `data/corpus/01-org-chart.md`, click **Ingest**.
- Point at the job status: "queued → extracting → ETL → ready" and the timing line.

## 2. Graph explorer (~1.5 min)
- Open **Graph**.
- Search "Ethan Brooks" → click **Explore** → show the 1-hop neighborhood
  (Ethan → Liam O'Brien → Aurora Dynamics), node colors, edge labels.
- Click a node to expand.

## 3. Multi-engine QA (~2 min)
- Open **Chat**, ask: "Who does Ethan Brooks report to?"
- Narrate what streams: tool trace (search_hybrid → graph_neighbors → lookup_entity),
  evidence cards with chunk snippets, then the streamed answer with `[chunk:...]` citations.
- Ask one more: "How many people report to Grace Liu?" (global/aggregation).

## 4. Benchmark (~1 min)
- Show `bun benchmark --summary` in a terminal: the 4-mode table
  (hybrid Hit@5 0.840 vs vector-only 0.800 vs graph-only 0.240 vs keyword-only 0.000).
- Say: "All numbers come from my own 50-question benchmark; results JSON are in the repo."

## 5. Wrap-up (~15s)
- Point to the README honesty map (every resume claim maps to a file) and close.

## Tips
- If a step fails (e.g., LLM hiccup), just retry once; cut the failed take.
- Keep captions minimal; the UI text speaks for itself.
- Save as `docs/demo.mp4` and update the README link (or upload to YouTube and
  replace the URL).
