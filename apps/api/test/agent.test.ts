import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, migrate } from "@graphatlas/db";
import { runAgent } from "../src/agent/agent";
import { agentDeps } from "../src/agent/llm";
import type { LlmMessage, LlmResponse, ToolDef } from "../src/agent/types";

const TAG = randomUUID().slice(0, 8);
const ENTITY = `TestAgentCEO-${TAG}`;
const CHUNK = `doc-${TAG}-000`;
let docId = "";

function toolResponse(callIndex: number, totalToolCalls: number, content: string): LlmResponse {
  return {
    content: callIndex <= totalToolCalls ? null : content,
    tool_calls:
      callIndex <= totalToolCalls
        ? [
            {
              id: `call-${callIndex}`,
              name: "lookup_entity",
              arguments: JSON.stringify({ name: ENTITY }),
            },
          ]
        : [],
  };
}

function mockLlm(totalToolCalls: number, finalContent: string) {
  let calls = 0;
  return async (_messages: LlmMessage[], _tools: ToolDef[]): Promise<LlmResponse> => {
    calls += 1;
    return toolResponse(calls, totalToolCalls, finalContent);
  };
}

beforeAll(async () => {
  await migrate();
  const sql = getDb();
  const doc = await sql<{ id: string }[]>`
    INSERT INTO graphatlas.documents (title, kind, file_type, status)
    VALUES ('Agent fixture', 'md', 'text/markdown', 'ready')
    RETURNING id
  `;
  docId = doc[0]!.id;
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding_model, embedding_dim)
    VALUES (${CHUNK}, ${docId}, 0, 'TestAgentCEO is the CEO of the test org.', 'test', 1536)
  `;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${ENTITY}, ${ENTITY}, 'PERSON', 'CEO of the test org.', ${sql.json([CHUNK])}, 'test', 1536)
  `;
});

describe("agent tool loop", () => {
  test("executes a tool call and returns the final answer with a trace", async () => {
    agentDeps.llm = mockLlm(1, `The CEO is ${ENTITY} [chunk:${CHUNK}].`);
    const result = await runAgent("Who is the CEO?");
    expect(result.answer).toContain(ENTITY);
    expect(result.tool_calls).toBe(1);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]!.tool).toBe("lookup_entity");
    expect(result.trace[0]!.step).toBe(1);
    expect(result.trace[0]!.output).toContain(ENTITY);
  });

  test("stops when the model stops calling tools", async () => {
    agentDeps.llm = mockLlm(0, "No tools needed.");
    const result = await runAgent("Hello");
    expect(result.tool_calls).toBe(0);
    expect(result.trace).toHaveLength(0);
    expect(result.answer).toBe("No tools needed.");
  });

  test("enforces the iteration budget", async () => {
    agentDeps.llm = mockLlm(3, "Budget exhausted answer.");
    const result = await runAgent("Loop question", { maxIterations: 3 });
    expect(result.tool_calls).toBe(3);
    expect(result.trace).toHaveLength(3);
    expect(result.answer).toBe("Budget exhausted answer.");
  });

  test("parses DSML tool calls emitted as model content", async () => {
    let calls = 0;
    agentDeps.llm = async (): Promise<LlmResponse> => {
      calls += 1;
      if (calls === 1) {
        return {
          content: `<｜DSML｜tool_calls>\n<｜DSML｜invoke name="lookup_entity">\n<｜DSML｜parameter name="name" string="true">${ENTITY}<｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>`,
          tool_calls: [],
        };
      }
      return { content: `The CEO is ${ENTITY} [chunk:${CHUNK}].`, tool_calls: [] };
    };
    const result = await runAgent("Who is the CEO?");
    expect(result.tool_calls).toBe(1);
    expect(result.trace[0]!.tool).toBe("lookup_entity");
    expect(result.answer).toContain(ENTITY);
    expect(result.answer).not.toContain("DSML");
  });

  test("never leaks DSML when the budget is exhausted on the final round", async () => {
    let calls = 0;
    agentDeps.llm = async (): Promise<LlmResponse> => {
      calls += 1;
      if (calls === 1) {
        return {
          content: null,
          tool_calls: [{ id: "c1", name: "lookup_entity", arguments: JSON.stringify({ name: ENTITY }) }],
        };
      }
      return {
        content: `<｜DSML｜tool_calls>\n<｜DSML｜invoke name="search_hybrid">\n<｜DSML｜parameter name="query" string="true">more<｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>`,
        tool_calls: [],
      };
    };
    const result = await runAgent("Question", { maxIterations: 1 });
    expect(result.answer).not.toContain("DSML");
    expect(result.answer).toContain("more retrieval rounds");
  });
});

afterAll(async () => {
  agentDeps.llm = undefined;
  const sql = getDb();
  await sql`DELETE FROM graphatlas.relations WHERE src_id = ${ENTITY} OR tgt_id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.entities WHERE id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
});
