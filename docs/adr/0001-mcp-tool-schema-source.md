# ADR 0001 — Tool schema source of truth

- **Status:** Accepted (2026-10-11)
- **Context:** MCP-01 (ZHA-167), epic ZHA-166 — MCP Server v1.1
- **Related:** `docs/MCP_PLAN.md` §2 (decisions D1, D4), §7 (risks)

## Context

GraphAtlas today exposes one tool surface to the LLM through a hand-written
function-calling loop in `apps/api/src/agent/`. MCP-02 adds a second entry point,
`apps/mcp` (stdio), that must expose the *same* four read-only retrieval
capabilities: `search_hybrid`, `graph_neighbors`, `get_document`,
`lookup_entity`.

That means two representations of the same surface are in play:

1. **OpenAI-style JSON Schema** — what the agent sends to the chat-completions
   gateway (`ToolDef.parameters`), consumed by `AGENT_BASE_URL` gateways such as
   DeepSeek/OpenCode.
2. **zod schemas** — the native input description for MCP
   `registerTool(...)`, which the MCP SDK converts to JSON Schema for
   `tools/list`.

Maintaining both by hand guarantees drift: a renamed parameter or a newly
required field would silently behave differently between the agent and an MCP
client, and the failure mode (the model calls a tool with wrong arguments) is
hard to diagnose.

## Decision

**zod becomes the single source of truth; the OpenAI JSON Schema is derived.**

- `packages/tools` owns the tool surface — `TOOLS`, `executeTool`,
  `summarizeToolOutput`, plus `searchDocuments` / `searchDeps` — and is imported
  by both entry points. Copying `tools.ts` into `apps/mcp` was rejected: a parity
  test alone is a weaker guarantee than one shared module (D1).
- The MCP server declares each tool once with a zod input schema, and takes the
  model-facing `description` from the shared spec.
- A parity test (`apps/mcp/test/parity.test.ts`, MCP-04) asserts that MCP tool
  names and required parameters match `TOOLS` exactly — a second net behind the
  shared module, not the primary control.

## Why not the alternatives

- **Two hand-written representations plus a parity test.** Parity catches drift
  after the fact; a single module makes drift structurally impossible.
- **Derive zod from the JSON Schema.** The JSON Schema is the legacy artifact and
  is lossy in this direction (`anyOf`, `$schema`); deriving it would keep the
  weaker representation authoritative.

## Known risk and pre-committed fallback (validated in MCP-02)

Some OpenAI-compatible gateways reject derived JSON Schemas — typically on
`$schema` or `anyOf`. **If the gateway rejects the derived schema, do not ship
both representations silently.** Instead:

1. keep hand-written JSON Schema for the agent-facing `TOOLS` definitions,
2. enforce alignment with the MCP zod schemas via the MCP-04 parity test, and
3. amend this ADR (status → Amended) with the rejected payload captured.

The fallback is recorded *before* validation so it is a documented decision
rather than an improvised one.

## Consequences

- Adding or changing a tool means editing `packages/tools` once; both the agent
  and the MCP server pick it up.
- `apps/api/src/agent/tools.ts`, `apps/api/src/services/search.ts` and the
  `ToolDef` half of `apps/api/src/agent/types.ts` become thin re-exports
  (MCP-01), so no call site, test, or the benchmark had to change.
- MCP-01 is a pure refactor: the moved source is byte-identical apart from import
  paths, `searchDeps` stays a module singleton (so
  `apps/api/test/search.test.ts` still injects `searchDeps.embed`), and
  `apps/api/test/{agent,search}.test.ts` are unmodified.
