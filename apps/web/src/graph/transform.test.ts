import { describe, expect, test } from "vitest";
import { graphToFlow } from "./transform";

describe("graphToFlow", () => {
  test("maps nodes/edges to React Flow format with type colors", () => {
    const { nodes, edges } = graphToFlow({
      entity: null,
      depth: 1,
      nodes: [
        { id: "Ava Chen", label: "Ava Chen", type: "PERSON", description: "CEO" },
        { id: "Aurora", label: "Aurora", type: "ORGANIZATION", description: "Company" },
      ],
      edges: [{ id: "e1", source: "Ava Chen", target: "Aurora", label: "leads", weight: 2 }],
    });
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.id).toBe("Ava Chen");
    expect(nodes[0]!.style?.background).toBe("#38bdf8");
    expect(edges[0]!.source).toBe("Ava Chen");
    expect(edges[0]!.style?.strokeWidth).toBe(4);
  });
});
