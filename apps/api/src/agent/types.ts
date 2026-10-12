// Tool definitions now live in @graphatlas/tools (shared with the MCP server);
// re-exported here so existing "./types" import sites keep working unchanged.
export { TOOL_NAMES, type ToolDef, type ToolName } from "@graphatlas/tools";

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type LlmResponse = {
  content: string | null;
  tool_calls: LlmToolCall[];
};

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

export type AgentTraceEntry = {
  step: number;
  tool: string;
  input: string;
  output: string;
};

export type AgentResult = {
  answer: string;
  trace: AgentTraceEntry[];
  tool_calls: number;
};
