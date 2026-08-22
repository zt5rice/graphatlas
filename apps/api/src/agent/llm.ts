import type { LlmMessage, LlmResponse, ToolDef } from "./types";
import { extractDsmlToolCalls } from "./dsml";

export const agentDeps: {
  llm?: (messages: LlmMessage[], tools: ToolDef[]) => Promise<LlmResponse>;
  streamingLlm?: StreamingLlm;
} = {};

export type StreamingLlm = (
  messages: LlmMessage[],
  tools: ToolDef[],
  onDelta: (delta: string) => void,
) => Promise<LlmResponse>;

/**
 * OpenAI-compatible chat completions client (OpenCode Go / DeepSeek / any
 * gateway). Uses AGENT_BASE_URL/AGENT_MODEL/AGENT_API_KEY with a fallback to
 * OPENCODE_CODEX_API_KEY.
 */
export async function defaultLlm(messages: LlmMessage[], tools: ToolDef[]): Promise<LlmResponse> {
  const baseUrl = (process.env.AGENT_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.AGENT_API_KEY || process.env.OPENCODE_CODEX_API_KEY || "";
  const model = process.env.AGENT_MODEL ?? "deepseek-v4-flash";
  if (!baseUrl || !apiKey) {
    throw new Error("AGENT_BASE_URL and AGENT_API_KEY (or OPENCODE_CODEX_API_KEY) are required");
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    throw new Error(`LLM HTTP ${resp.status}: ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  const response: LlmResponse = {
    content: message?.content ?? null,
    tool_calls: (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  };
  if (response.tool_calls.length === 0 && response.content) {
    const dsml = extractDsmlToolCalls(response.content);
    if (dsml.toolCalls.length > 0) {
      response.tool_calls = dsml.toolCalls;
      response.content = dsml.cleaned || null;
    }
  }
  return response;
}

/**
 * Streaming variant of the OpenAI-compatible chat client. Content deltas are
 * forwarded to `onDelta` as they arrive; tool calls are aggregated from deltas.
 */
export async function defaultStreamingLlm(
  messages: LlmMessage[],
  tools: ToolDef[],
  onDelta: (delta: string) => void,
): Promise<LlmResponse> {
  const baseUrl = (process.env.AGENT_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.AGENT_API_KEY || process.env.OPENCODE_CODEX_API_KEY || "";
  const model = process.env.AGENT_MODEL ?? "deepseek-v4-flash";
  if (!baseUrl || !apiKey) {
    throw new Error("AGENT_BASE_URL and AGENT_API_KEY (or OPENCODE_CODEX_API_KEY) are required");
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      stream: true,
      temperature: 0.1,
    }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`LLM HTTP ${resp.status}: ${await resp.text()}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: { id: string; name: string; arguments: string }[] = [];
  let content = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          onDelta(delta.content);
        }
        for (const tc of delta?.tool_calls ?? []) {
          const index = tc.index ?? 0;
          toolCalls[index] = toolCalls[index] ?? { id: "", name: "", arguments: "" };
          if (tc.id) toolCalls[index]!.id = tc.id;
          if (tc.function?.name) toolCalls[index]!.name = tc.function.name;
          if (tc.function?.arguments) toolCalls[index]!.arguments += tc.function.arguments;
        }
      } catch {
        // ignore partial/keep-alive chunks
      }
    }
  }

  const response: LlmResponse = {
    content: content.length > 0 ? content : null,
    tool_calls: toolCalls.filter((tc) => tc.name),
  };
  if (response.tool_calls.length === 0 && response.content) {
    const dsml = extractDsmlToolCalls(response.content);
    if (dsml.toolCalls.length > 0) {
      response.tool_calls = dsml.toolCalls;
      response.content = dsml.cleaned || null;
    }
  }
  return response;
}
