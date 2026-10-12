// Moved to @graphatlas/tools (single source of truth shared with the MCP server).
// Thin re-export so the agent keeps importing "./tools" unchanged.
// See docs/adr/0001-mcp-tool-schema-source.md and docs/MCP_PLAN.md (D1).
export { TOOLS, executeTool, summarizeToolOutput } from "@graphatlas/tools";
