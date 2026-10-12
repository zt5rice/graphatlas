/**
 * Tool names shared by the HTTP agent and the MCP server (MCP-01, ZHA-167).
 *
 * Single source of truth: both entry points import their definitions from
 * `@graphatlas/tools` so the tool surface cannot drift between them.
 */
export const TOOL_NAMES = [
  "search_hybrid",
  "graph_neighbors",
  "get_document",
  "lookup_entity",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** OpenAI-style function-calling tool definition. */
export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};
