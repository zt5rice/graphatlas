import { describe, expect, test } from "bun:test";
import { extractDsmlToolCalls } from "../src/agent/dsml";

const SAMPLE = `<｜DSML｜tool_calls>
<｜DSML｜invoke name="search_hybrid">
<｜DSML｜parameter name="query" string="true">Grace Liu direct reports directors engineering<｜DSML｜parameter>
<｜DSML｜parameter name="mode" string="true">global<｜DSML｜parameter>
</｜DSML｜invoke>
<｜DSML｜invoke name="graph_neighbors">
<｜DSML｜parameter name="entity" string="true">Sofia Rossi<｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>`;

describe("DSML tool-call parsing", () => {
  test("extracts structured tool calls and strips the markup", () => {
    const { toolCalls, cleaned } = extractDsmlToolCalls(SAMPLE);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]!.name).toBe("search_hybrid");
    const args0 = JSON.parse(toolCalls[0]!.arguments) as Record<string, string>;
    expect(args0.query).toBe("Grace Liu direct reports directors engineering");
    expect(args0.mode).toBe("global");
    expect(toolCalls[1]!.name).toBe("graph_neighbors");
    const args1 = JSON.parse(toolCalls[1]!.arguments) as Record<string, string>;
    expect(args1.entity).toBe("Sofia Rossi");
    expect(cleaned).toBe("");
  });

  test("returns empty tool calls for plain text", () => {
    const { toolCalls, cleaned } = extractDsmlToolCalls("Just an answer.");
    expect(toolCalls).toHaveLength(0);
    expect(cleaned).toBe("Just an answer.");
  });
});
