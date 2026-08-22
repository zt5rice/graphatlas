import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { runAgentStream } from "../agent/agent";
import type { LlmMessage } from "../agent/types";

export const chatRouter = new Hono();

type ChatBody = {
  query?: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

chatRouter.post("/chat", async (c) => {
  const body = (await c.req.json().catch(() => null)) as ChatBody | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }
  const history: LlmMessage[] = (body?.history ?? [])
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  const sessionId = randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("session", { session_id: sessionId });
      try {
        await runAgentStream(query, {
          history,
          onEvent: (event) => {
            switch (event.type) {
              case "tool_call":
                send("tool_call", { step: event.step, tool: event.tool, input: event.input });
                break;
              case "evidence":
                send("evidence", { tool: event.tool, output: event.output });
                break;
              case "delta":
                send("delta", { text: event.text });
                break;
              case "done":
                send("done", {
                  answer: event.answer,
                  trace: event.trace,
                  tool_calls: event.tool_calls,
                });
                break;
            }
          },
        });
      } catch (err) {
        send("error", { message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
