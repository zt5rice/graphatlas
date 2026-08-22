import type { LlmToolCall } from "./types";

// DeepSeek sometimes emits tool calls in its DSML markup instead of native
// OpenAI `tool_calls`. This parses that markup into structured tool calls.
const DSML_INVOKE_RE =
  /<｜DSML｜invoke name="([^"]+)"[^>]*>([\s\S]*?)<\/｜DSML｜invoke>/g;
const DSML_PARAM_RE =
  /<｜DSML｜parameter name="([^"]+)"[^>]*>([\s\S]*?)<｜DSML｜parameter>/g;
const DSML_BLOCK_RE = /<｜DSML｜tool_calls>[\s\S]*?<\/｜DSML｜tool_calls>/g;

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

export function extractDsmlToolCalls(content: string): {
  toolCalls: LlmToolCall[];
  cleaned: string;
} {
  const toolCalls: LlmToolCall[] = [];
  const invokeRe = new RegExp(DSML_INVOKE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = invokeRe.exec(content)) !== null) {
    const name = match[1] ?? "";
    const body = match[2] ?? "";
    const params: Record<string, string> = {};
    const paramRe = new RegExp(DSML_PARAM_RE.source, "g");
    let param: RegExpExecArray | null;
    while ((param = paramRe.exec(body)) !== null) {
      params[param[1] ?? ""] = unescapeXml(param[2] ?? "");
    }
    toolCalls.push({
      id: `dsml-${toolCalls.length + 1}`,
      name,
      arguments: JSON.stringify(params),
    });
  }
  const cleaned =
    toolCalls.length > 0 ? content.replace(DSML_BLOCK_RE, "").trim() : content;
  return { toolCalls, cleaned };
}
