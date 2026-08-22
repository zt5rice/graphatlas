import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, migrate } from "@graphatlas/db";
import { app } from "../src/app";
import { agentDeps } from "../src/agent/llm";
import type { LlmMessage, LlmResponse, ToolDef } from "../src/agent/types";

const TAG = randomUUID().slice(0, 8);
const ENTITY = `ChatCEO-${TAG}`;
const CHUNK = `doc-${TAG}-000`;
let docId = "";

beforeAll(async () => {
  await migrate();
  const sql = getDb();
  const doc = await sql<{ id: string }[]>`
    INSERT INTO graphatlas.documents (title, kind, file_type, status)
    VALUES ('Chat fixture', 'md', 'text/markdown', 'ready')
    RETURNING id
  `;
  docId = doc[0]!.id;
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding_model, embedding_dim)
    VALUES (${CHUNK}, ${docId}, 0, 'ChatCEO leads the test org.', 'test', 1536)
  `;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${ENTITY}, ${ENTITY}, 'PERSON', 'Leads the test org.', ${sql.json([CHUNK])}, 'test', 1536)
  `;
});

function streamingMock(failFirst = false) {
  let calls = 0;
  return async (_messages: LlmMessage[], _tools: ToolDef[], onDelta: (d: string) => void): Promise<LlmResponse> => {
    calls += 1;
    if (failFirst) throw new Error("mock LLM failure");
    if (calls === 1) {
      return {
        content: null,
        tool_calls: [{ id: "c1", name: "lookup_entity", arguments: JSON.stringify({ name: ENTITY }) }],
      };
    }
    const answer = `The CEO is ${ENTITY} [chunk:${CHUNK}].`;
    onDelta("The CEO is ");
    onDelta(`${ENTITY} [chunk:${CHUNK}].`);
    return { content: answer, tool_calls: [] };
  };
}

async function postChat(body: Record<string, unknown>) {
  return app.request("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/chat (SSE)", () => {
  test("emits session, tool_call, evidence, delta, done in order", async () => {
    agentDeps.streamingLlm = streamingMock();
    const res = await postChat({ query: "Who is the CEO?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await new Response(res.body).text();
    expect(text).toContain("event: session");
    expect(text).toContain("event: tool_call");
    expect(text).toContain("event: evidence");
    expect(text).toContain("event: delta");
    expect(text).toContain("event: done");
    const sessionIdx = text.indexOf("event: session");
    const toolIdx = text.indexOf("event: tool_call");
    const evidenceIdx = text.indexOf("event: evidence");
    const deltaIdx = text.indexOf("event: delta");
    const doneIdx = text.indexOf("event: done");
    expect(sessionIdx).toBeLessThan(toolIdx);
    expect(toolIdx).toBeLessThan(evidenceIdx);
    expect(evidenceIdx).toBeLessThan(deltaIdx);
    expect(deltaIdx).toBeLessThan(doneIdx);

    const doneMatch = text.match(/event: done\ndata: (.+)/);
    expect(doneMatch).not.toBeNull();
    const done = JSON.parse(doneMatch![1]!) as { answer: string; tool_calls: number; trace: unknown[] };
    expect(done.answer).toContain(ENTITY);
    expect(done.tool_calls).toBe(1);
    expect(done.trace).toHaveLength(1);
  });

  test("emits an error event when the LLM fails", async () => {
    agentDeps.streamingLlm = streamingMock(true);
    const res = await postChat({ query: "Who is the CEO?" });
    expect(res.status).toBe(200);
    const text = await new Response(res.body).text();
    expect(text).toContain("event: error");
  });

  test("rejects empty queries", async () => {
    const res = await postChat({ query: "" });
    expect(res.status).toBe(400);
  });
});

afterAll(async () => {
  agentDeps.streamingLlm = undefined;
  const sql = getDb();
  await sql`DELETE FROM graphatlas.relations WHERE src_id = ${ENTITY} OR tgt_id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.entities WHERE id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
});
