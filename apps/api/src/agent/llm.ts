import type { LlmMessage, LlmResponse, ToolDef } from "./types";

export const agentDeps: {
  llm?: (messages: LlmMessage[], tools: ToolDef[]) => Promise<LlmResponse>;
} = {};

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
  return {
    content: message?.content ?? null,
    tool_calls: (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  };
}
