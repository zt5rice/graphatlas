import { agentDeps, defaultLlm, defaultStreamingLlm } from "./llm";
import { executeTool, summarizeToolOutput, TOOLS } from "./tools";
import { extractDsmlToolCalls } from "./dsml";
import type { AgentResult, AgentTraceEntry, LlmMessage } from "./types";

const SYSTEM_PROMPT = `You are GraphAtlas, an assistant for an enterprise knowledge base.
Answer using ONLY information returned by the tools. For every factual claim, cite the
source chunk id in the form [chunk:<chunk_id>]. If the tools do not contain the answer,
state that the information is not documented. Never invent facts, people, or numbers.
Use the provided function-calling tools for retrieval; never output XML/DSML markup
in your reply.`;

/**
 * Hand-written tool-calling loop (no LangChain): up to `maxIterations` rounds of
 * model -> tool calls -> tool results, then a final answer. Every step is traced.
 */
export async function runAgent(
  question: string,
  opts: { maxIterations?: number; history?: LlmMessage[] } = {},
): Promise<AgentResult> {
  const maxIterations = opts.maxIterations ?? 4;
  const trace: AgentTraceEntry[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(opts.history ?? []),
    { role: "user", content: question },
  ];
  let toolCalls = 0;
  const llm = agentDeps.llm ?? defaultLlm;

  for (let step = 1; step <= maxIterations; step++) {
    const response = await llm(messages, TOOLS);
    if (response.tool_calls.length === 0 && response.content) {
      const dsml = extractDsmlToolCalls(response.content);
      if (dsml.toolCalls.length > 0) {
        response.tool_calls = dsml.toolCalls;
        response.content = dsml.cleaned || null;
      }
    }
    if (response.tool_calls.length === 0) {
      return { answer: response.content ?? "", trace, tool_calls: toolCalls };
    }

    toolCalls += response.tool_calls.length;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: response.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of response.tool_calls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.arguments || "{}") as Record<string, string>;
      } catch {
        args = {};
      }
      const output = await executeTool(tc.name, args);
      const outputText = summarizeToolOutput(output);
      trace.push({ step, tool: tc.name, input: tc.arguments, output: outputText });
      messages.push({ role: "tool", content: outputText, tool_call_id: tc.id });
    }
  }

  // Iteration budget exhausted: request a final answer without tools.
  const final = await llm(messages, []);
  return { answer: final.content ?? "", trace, tool_calls: toolCalls };
}

export type AgentEvent =
  | { type: "tool_call"; step: number; tool: string; input: string }
  | { type: "evidence"; tool: string; output: string }
  | { type: "delta"; text: string }
  | { type: "done"; answer: string; trace: AgentTraceEntry[]; tool_calls: number };

/**
 * Streaming variant of the tool loop: emits `tool_call`, `evidence`, `delta`,
 * and `done` events as work happens. Uses the streaming LLM when available.
 */
export async function runAgentStream(
  question: string,
  opts: { maxIterations?: number; history?: LlmMessage[]; onEvent: (event: AgentEvent) => void },
): Promise<void> {
  const maxIterations = opts.maxIterations ?? 4;
  const onEvent = opts.onEvent;
  const trace: AgentTraceEntry[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(opts.history ?? []),
    { role: "user", content: question },
  ];
  let toolCalls = 0;
  const llm = agentDeps.streamingLlm ?? defaultStreamingLlm;

  for (let step = 1; step <= maxIterations; step++) {
    const buffered: string[] = [];
    const response = await llm(messages, TOOLS, (delta) => {
      buffered.push(delta);
    });
    if (response.tool_calls.length === 0 && response.content) {
      const dsml = extractDsmlToolCalls(response.content);
      if (dsml.toolCalls.length > 0) {
        response.tool_calls = dsml.toolCalls;
        response.content = dsml.cleaned || null;
      }
    }
    if (response.tool_calls.length === 0) {
      for (const delta of buffered) {
        onEvent({ type: "delta", text: delta });
      }
      onEvent({
        type: "done",
        answer: buffered.join("") || response.content || "",
        trace,
        tool_calls: toolCalls,
      });
      return;
    }

    toolCalls += response.tool_calls.length;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: response.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of response.tool_calls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.arguments || "{}") as Record<string, string>;
      } catch {
        args = {};
      }
      const output = await executeTool(tc.name, args);
      const outputText = summarizeToolOutput(output);
      trace.push({ step, tool: tc.name, input: tc.arguments, output: outputText });
      onEvent({ type: "tool_call", step, tool: tc.name, input: tc.arguments });
      onEvent({ type: "evidence", tool: tc.name, output: outputText });
      messages.push({ role: "tool", content: outputText, tool_call_id: tc.id });
    }
  }

  const buffered: string[] = [];
  const final = await llm(messages, [], (delta) => {
    buffered.push(delta);
  });
  if (final.tool_calls.length === 0 && final.content) {
    const dsml = extractDsmlToolCalls(final.content);
    if (dsml.toolCalls.length > 0) {
      final.tool_calls = dsml.toolCalls;
      final.content = dsml.cleaned || null;
    }
  }
  for (const delta of buffered) {
    onEvent({ type: "delta", text: delta });
  }
  onEvent({
    type: "done",
    answer: buffered.join("") || final.content || "",
    trace,
    tool_calls: toolCalls,
  });
}
