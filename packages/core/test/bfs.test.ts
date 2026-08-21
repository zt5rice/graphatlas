import { describe, expect, test } from "bun:test";
import { bfs } from "../src/retrieval/bfs";

const edges = [
  { source: "A", target: "B" },
  { source: "B", target: "C" },
  { source: "C", target: "A" }, // cycle
  { source: "C", target: "D" },
];

describe("graph BFS", () => {
  test("respects maxHop depth", () => {
    const one = bfs(edges, ["A"], 1);
    expect(one.visited.sort()).toEqual(["A", "B", "C"]); // A-B and cycle edge C-A

    const two = bfs(edges, ["A"], 2);
    expect(two.visited.sort()).toEqual(["A", "B", "C", "D"]);

    const three = bfs(edges, ["A"], 3);
    expect(three.visited.sort()).toEqual(["A", "B", "C", "D"]);
  });

  test("terminates on cycles and deduplicates edges", () => {
    const result = bfs(edges, ["A"], 10);
    expect(result.visited).toHaveLength(4);
    expect(result.reachedEdges).toHaveLength(4); // each undirected edge once
  });

  test("handles empty seeds", () => {
    expect(bfs(edges, [], 2).visited).toEqual([]);
  });
});
