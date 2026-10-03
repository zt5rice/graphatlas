# GraphAtlas — MCP Server (v1.1) Plan

> Source of truth for the MCP work. Mirrors Linear epic **ZHA-166** and issues **ZHA-167 / ZHA-174 .. ZHA-184**.
> Companion doc to `docs/LINEAR_PLAN.md` (same conventions, same project).

## 1. Goal & non-goals

**Goal.** GraphAtlas currently exposes only an HTTP entry point (Hono/Bun API) plus a hand-written tool-calling agent, with tool definitions hardcoded in `apps/api/src/agent/tools.ts`. Expose the existing four retrieval capabilities over **MCP (Model Context Protocol)** — and optionally let the agent consume them over MCP — closing a real `server -> stdio/HTTP -> client` loop. This is the gap deliberately marked out-of-scope in `PLAN.md` §8.2.

**Non-goals (do not drift into these).**

- Multi-tenant / per-user authorization — single-user local tool; do not pretend enterprise multi-tenancy
- Write/mutation tools (`capture` / `put`) — read-only retrieval only
- Replacing the hand-written agent loop with LangChain — keep the "no LangChain" honest narrative
- Re-implementing retrieval logic inside the MCP layer — it must call `@graphatlas/core` / `packages/db`
- Hosting a public remote MCP service

## 2. Architecture decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | **Single source of truth for tools** — extract `packages/tools`; both the HTTP agent and the MCP server import from it | Copying `tools.ts` for MCP would inevitably drift; a parity test alone is a weaker guarantee than one shared module |
| D2 | **Separate `apps/mcp` workspace** — not a folder inside `apps/api` | The stdio server must be independently startable; story = "one core, two entry points" (same idea as `ff-companybrain` modules) |
| D3 | **Transport: stdio first, HTTP optional** | stdio covers the mainstream Claude Code / Claude Desktop / Codex usage with zero auth complexity; HTTP is only needed for remote/multi-client |
| D4 | **Schema strategy: zod is the single source**; derive OpenAI JSON Schema. Fallback: hand-written JSON Schema + parity test | Defaults to less duplication; the fallback exists because DeepSeek/OpenCode gateways sometimes reject derived schemas (`$schema`, `anyOf`) |
| D5 | **Agent over MCP behind a feature flag** — `AGENT_TOOLS_SOURCE=local\|mcp`, default `local` | Guarantees zero regression on the existing chat path and on CI; the switch is a separate ticket |

**Schema decision note.** If the LLM gateway rejects derived schemas, do **not** silently ship both representations — record the outcome in `docs/adr/0001-mcp-tool-schema-source.md` and enforce alignment with `apps/mcp/test/parity.test.ts`.

## 3. Target structure

```
apps/mcp (@graphatlas/mcp)                 apps/api (@graphatlas/api)
  src/server.ts   registerTool(...)          src/agent/agent.ts    (loop unchanged)
  src/main.ts     StdioServerTransport       src/agent/tools.ts    -> thin re-export
  src/errors.ts   ok()/fail()                src/agent/mcpClient.ts (MCP-09)
        \                                            /
         \                                          /
          -> packages/tools (@graphatlas/tools) <- single source of truth
                   TOOLS + executeTool + searchDocuments
                          |
              packages/core + packages/db
```

## 4. Tickets overview

Estimates use a 1/2/3/5/8 scale (S=2, M=3, L=5). All issues belong to Linear project
`GraphAtlas — Multi-Engine GraphRAG Enterprise Knowledge Platform` and are sub-issues of epic **ZHA-166**.

| ID | Linear | Title | Size | Est | PRs | Depends on |
|---|---|---|---|---|---|---|
| MCP-01 | ZHA-167 | Extract shared tool layer into `packages/tools` (refactor only) | M | 3 | 1 | — |
| MCP-02 | ZHA-168 | Scaffold `apps/mcp` + stdio server with `search_hybrid` | S | 2 | 1 | MCP-01 |
| MCP-03 | ZHA-174 | Complete MCP tool surface (`graph_neighbors`, `get_document`, `lookup_entity`) | M | 3 | 1 | MCP-02 |
| MCP-04 | ZHA-175 | MCP integration tests (in-memory + stdio smoke) + schema parity | M | 3 | 1 | MCP-03 |
| MCP-05 | ZHA-176 | Structured MCP errors + input validation | S | 2 | 1 | MCP-03 |
| MCP-06 | ZHA-177 | Run scripts + env config + quick start | S | 2 | 1 | MCP-03 |
| MCP-07 | ZHA-178 | `docs/MCP.md` + README / architecture / honesty map | M | 3 | 1 | MCP-03, MCP-06 |
| MCP-08 | ZHA-179 | CI wiring for the MCP workspace | S | 2 | 1 | MCP-04 |
| MCP-09 | ZHA-180 | MCP client adapter + `AGENT_TOOLS_SOURCE=mcp` flag | L | 5 | 1–2 | MCP-04 |
| MCP-10 | ZHA-181 | E2E scenario D — chat answered through MCP tools | M | 3 | 1 | MCP-09 |
| MCP-11 | ZHA-182 | *(optional)* Streamable HTTP transport + bearer auth | M | 3 | 1–2 | MCP-05 |
| MCP-12 | ZHA-183 | Measured tool latency — local vs MCP (results JSON) | S | 2 | 1 | MCP-04, MCP-07 |
| MCP-13 | ZHA-184 | README demo segment + `v1.1` tag + release notes | S | 2 | 1 | MCP-12 |

**Total: 35 points.** Core path MCP-01 → MCP-10 = **28 points** (the rest is optional polish).

## 5. Dependency graph

```
167 (01) -> 168 (02) -> 174 (03) -+-> 175 (04) -+-> 179 (08)
                                  |              +-> 180 (09) -> 181 (10)
                                  |              +-> 183 (12) -> 184 (13)
                                  +-> 176 (05) ----> 182 (11)  [optional]
                                  +-> 177 (06) -> 178 (07) -> 183 (12)
```

Execution order: **01 → 02 → 03 → {04, 05, 06} → {07, 08, 09, 11} → {10, 12} → 13**.

## 6. Ticket details

### MCP-01 — Extract shared tool layer into `packages/tools` (ZHA-167)

- **Why:** tool specs (OpenAI JSON Schema) and execution logic are mixed in `apps/api/src/agent/tools.ts`, and `executeTool` depends on `apps/api/src/services/search.ts`. Duplicating either for MCP guarantees drift.
- **Scope:** new `packages/tools` with `src/types.ts` (`ToolDef`, `ToolName`), `src/search.ts` (moved `searchDocuments` / `searchDeps` / `SearchInput` / `SearchResponse` / `RecallPath`), `src/tools.ts` (`TOOLS`, `executeTool`, `summarizeToolOutput`), `src/index.ts`. Turn `apps/api/src/agent/tools.ts`, `apps/api/src/services/search.ts`, `apps/api/src/agent/types.ts` into thin re-exports. Add `@graphatlas/tools` path mapping to `apps/api/tsconfig.json`. Add the missing explicit workspace deps to `apps/api/package.json`. Write `docs/adr/0001-mcp-tool-schema-source.md`.
- **Acceptance:** `bun run typecheck` green; `bun test` green with `apps/api/test/{agent,search}.test.ts` **unmodified**; `git diff --stat` shows a move, not a rewrite; `searchDeps` stays a module singleton.
- **Branch:** `refactor/ZHA-167-shared-tool-layer`

### MCP-02 — Scaffold `apps/mcp` + stdio server (ZHA-168)

- **Why:** prove the protocol path before widening the tool surface.
- **Scope:** new `apps/mcp` workspace (`@modelcontextprotocol/sdk@1.29.0`, `zod`), `src/server.ts` with `McpServer` + `registerTool("search_hybrid", ...)`, `src/main.ts` with `StdioServerTransport`, `ok()`/`fail()` wrappers. Root `package.json` gains `mcp` / `dev:mcp` scripts and a `typecheck` entry. Minimal `apps/mcp/test/server.test.ts` using `Client` + `InMemoryTransport`.
- **Acceptance:** `bun run --cwd apps/mcp typecheck` green; in-memory `listTools()` contains `search_hybrid`; a real stdio process completes `initialize` + `tools/list`; **no non-protocol bytes on stdout**.
- **Branch:** `feat/ZHA-168-mcp-stdio-scaffold`

### MCP-03 — Complete MCP tool surface (ZHA-174)

- **Scope:** register `graph_neighbors`, `get_document`, `lookup_entity` with zod schemas aligned to the agent-side JSON Schema; model-facing `description` per tool; all output through `executeTool` + `summarizeToolOutput` (keep the 2000-char truncation); declare the list once in `TOOL_SPECS`.
- **Acceptance:** four tools listable and callable; happy path + not-found path asserted per tool; names/required params match `packages/tools`.
- **Branch:** `feat/ZHA-174-mcp-tool-surface`

### MCP-04 — Integration tests + parity (ZHA-175)

- **Scope:** `test/server.test.ts` (Client + `InMemoryTransport.createLinkedPair()`, seeded fixture, `afterAll` cleanup), `test/parity.test.ts` (MCP tool names/required fields == agent `TOOLS`), `test/stdio-smoke.test.ts` (spawn the real process, capture stderr, enforce timeout, assert child exited — model on `assertChildExited` in `ff-companybrain/deploy/compose/verify-external-mcp.ts`).
- **Acceptance:** `bun test` covers and passes them; adding a stray `console.log` to `server.ts` makes the stdio smoke fail; CI executes them (no silent skip).
- **Branch:** `test/ZHA-175-mcp-integration-tests`

### MCP-05 — Structured errors (ZHA-176)

- **Scope:** `src/errors.ts` with `ok()` / `fail()` returning `{content:[{type:"text",text}], isError?}`; map `invalid_input` / `not_found` / `internal_error`; never leak stack traces; single `tool<Args>(handler)` wrapper.
- **Acceptance:** one unit test per error class; bad args -> `isError:true`; missing entity/document -> `not_found`.
- **Branch:** `feat/ZHA-176-mcp-errors`

### MCP-06 — Run scripts + env config (ZHA-177)

- **Scope:** root `mcp` / `dev:mcp` scripts; `.env.example` gains `MCP_TRANSPORT` (stdio\|http) and `MCP_HTTP_PORT`; fail-fast env validation at startup; README quick start.
- **Acceptance:** fresh clone can start MCP from the README; missing `DATABASE_URL` names the missing variable.
- **Branch:** `chore/ZHA-177-mcp-run-scripts`

### MCP-07 — Docs + honesty map (ZHA-178)

- **Scope:** new `docs/MCP.md` (what MCP is; tool reference table; how to start; how to connect from Claude Code / Claude Desktop / Codex / MCP Inspector; security notes; troubleshooting). README gains a feature bullet, an honesty-map row, and an MCP node in the mermaid diagram. `PLAN.md` §8.2 and `PLAN-cn.md` §8.2 move MCP from "excluded" to "implemented in v1.1".
- **Acceptance:** connecting from scratch works following the doc (attach evidence in the PR); every honesty-map claim points at a file.
- **Branch:** `docs/ZHA-178-mcp-docs`

### MCP-08 — CI wiring (ZHA-179)

- **Scope:** add `packages/tools` + `apps/mcp` typecheck to the root `typecheck` chain; ensure `bun test` reaches `apps/mcp/test`; confirm the pgvector service and env are sufficient for MCP-04's DB-backed tests.
- **Acceptance:** PR CI green; CI logs show the MCP tests ran.
- **Branch:** `ci/ZHA-179-mcp-ci`

### MCP-09 — MCP client adapter + flag (ZHA-180)

- **Scope (1–2 PRs):** `apps/api/src/agent/mcpClient.ts` (connect; `listTools()` -> `ToolDef`; `callTool()` -> tool result) then wire `AGENT_TOOLS_SOURCE=local\|mcp` (default `local`) into `agent.ts`. Connection lifetime binds to request/session and closes cleanly.
- **Acceptance:** both modes yield an identical SSE event sequence; flag documented; no child-process leaks.
- **Branch:** `feat/ZHA-180-agent-over-mcp`

### MCP-10 — E2E scenario D (ZHA-181)

- **Scope:** `scripts/e2e.sh` scenario D with `AGENT_TOOLS_SOURCE=mcp` and `E2E_MODE` fakes; assert `tool_call` -> `evidence` -> `done` and a `[chunk:<id>]` citation; update `docs/DEMO_SCRIPT.md`.
- **Acceptance:** `bun run e2e` green for A/B/C/D with explicit assertions.
- **Branch:** `test/ZHA-181-mcp-e2e`

### MCP-11 — *(optional)* Streamable HTTP transport (ZHA-182)

- **Scope:** `MCP_TRANSPORT=stdio\|http`; `StreamableHTTPServerTransport` on `MCP_HTTP_PORT`; bearer auth reusing `API_TOKEN` (401 when missing); `/health`; document session management; tests for HTTP + unauthorized.
- **Acceptance:** HTTP MCP client can connect and call tools; unauthorized returns 401; stdio does not regress.
- **Branch:** `feat/ZHA-182-mcp-http`

### MCP-12 — Measured latency (ZHA-183)

- **Scope:** `benchmark/mcp-latency.ts` comparing `AGENT_TOOLS_SOURCE=local` vs stdio MCP over the same question set (N runs), recording p50/p95 and cold-start vs reused-connection; write `benchmark/results/mcp-latency-<date>.json`.
- **Acceptance:** every published number traces to JSON; no measurement, no claim.
- **Branch:** `bench/ZHA-183-mcp-latency`

### MCP-13 — Demo + release (ZHA-184)

- **Scope:** demo video segment (`claude mcp add` -> agent calls `search_hybrid` -> cited results); README MCP section; tag `v1.1`; release notes with known limitations (read-only, single-user, stdio-first); update the MCP section of `docs/LINEAR_PLAN.md`.
- **Acceptance:** tag pushed, release created, demo link works; every claim points at code or docs.
- **Branch:** `chore/ZHA-184-mcp-release`

## 7. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stray `console.log` in stdio mode corrupts the protocol | MCP unusable, hard to diagnose | All logging to `console.error`; stdio smoke test in CI |
| Tool definition drift between agent and MCP | Inconsistent behavior; fails under interview probing | Shared `packages/tools` (MCP-01) + parity test (MCP-04) |
| Derived JSON Schema rejected by the LLM gateway | Agent tool calling breaks | Validate early in MCP-01; fall back to hand-written schema + parity test; snapshot test |
| MCP process not loading `.env` | Silent degradation or startup failure | Fail-fast validation (MCP-06) + `bun --env-file` entry point |
| Wiring MCP into the agent regresses chat | Existing feature breaks | Feature flag defaulting to `local`; separate ticket (MCP-09) |
| MCP SDK 1.x API churn | Upgrade pain | Pin `1.29.0`; isolate SDK calls in `apps/mcp/src/server.ts` |
| Flaky CI from spawning processes | Unreliable pipeline | Prefer `InMemoryTransport`; keep exactly one spawn smoke test |

## 8. Global Definition of Done

Before any ticket merges:

1. `bun run typecheck` green (including new workspaces)
2. `bun test` green (including new MCP tests)
3. `bun run build:web` does not regress
4. Runtime-affecting changes: `bun run e2e` green
5. `/chat` trace/evidence contract unchanged, unless the ticket explicitly changes it
6. Docs / honesty map updated, and **no unmeasured performance claims**

## 9. Verification commands

```bash
bun install
bun run typecheck
bun test
bun run --cwd apps/mcp start          # stdio MCP server
bun run e2e                           # includes scenario D (MCP-10)
bun benchmark --summary               # see docs/BENCHMARK.md
```

## 10. Linear mapping (created 2026-10-03)

- **Project:** `GraphAtlas — Multi-Engine GraphRAG Enterprise Knowledge Platform` (`e376b45b-b619-48c2-80fc-486946a57261`)
- **Team:** ZHA (`f8e0f74b-c3f5-443c-ae81-c15fa9297623`)
- **Epic:** `ZHA-166`

| Plan ID | Linear | blockedBy |
|---|---|---|
| — (epic) | ZHA-166 | — |
| MCP-01 | ZHA-167 | — |
| MCP-02 | ZHA-168 | ZHA-167 |
| MCP-03 | ZHA-174 | ZHA-168 |
| MCP-04 | ZHA-175 | ZHA-174 |
| MCP-05 | ZHA-176 | ZHA-174 |
| MCP-06 | ZHA-177 | ZHA-174 |
| MCP-07 | ZHA-178 | ZHA-174, ZHA-177 |
| MCP-08 | ZHA-179 | ZHA-175 |
| MCP-09 | ZHA-180 | ZHA-175 |
| MCP-10 | ZHA-181 | ZHA-180 |
| MCP-11 | ZHA-182 | ZHA-176 |
| MCP-12 | ZHA-183 | ZHA-175, ZHA-178 |
| MCP-13 | ZHA-184 | ZHA-183 |

## 11. Conventions & creation notes

- One ticket may correspond to **one or more PRs** (this supersedes the older "one ticket = one PR" wording in `docs/LINEAR_PLAN.md`).
- Branch naming: `feat/<issue>-<kebab-slug>`, `fix/`, `docs/`, `test/`, `chore/`, `ci/`, `bench/`, `refactor/`.
- Commit & PR title prefix: `<ISSUE>: type(scope): description` (e.g. `ZHA-168: feat(mcp): add stdio MCP server with search_hybrid`).
- Status lifecycle: Todo -> In Progress -> (PR) -> Done; abandoned -> Canceled. A ticket is Done only after its PR(s) are merged.
- The Linear connector does not expose a milestone-creation API, so ZHA-166 is used as the grouping epic. Create a `Day 6 — MCP Server (v1.1)` milestone in the UI and attach the epic + children to it.
- After any Linear rename/re-scope, mirror the change back into this file so the repo stays the source of truth.
