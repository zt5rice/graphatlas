// Moved to @graphatlas/tools (single source of truth shared with the MCP server).
// Kept as a thin re-export so existing import sites — routes/search.ts,
// worker/e2eMode.ts, test/search.test.ts, benchmark/run.ts — keep working
// unchanged. See docs/adr/0001-mcp-tool-schema-source.md and docs/MCP_PLAN.md (D1).
export {
  searchDocuments,
  searchDeps,
  type RecallPath,
  type SearchInput,
  type SearchResponse,
} from "@graphatlas/tools";
