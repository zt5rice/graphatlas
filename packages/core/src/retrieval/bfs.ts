export type Edge = { source: string; target: string };

export type BfsResult = {
  /** Entities reachable from seeds, including the seeds themselves (BFS order). */
  visited: string[];
  /** Undirected edges traversed, deduplicated. */
  reachedEdges: Edge[];
};

/**
 * Cycle-safe breadth-first traversal over an undirected edge list, bounded by
 * `maxHop`. Used by the graph recall path (and unit-tested without a DB).
 */
export function bfs(edges: Edge[], seeds: string[], maxHop: number): BfsResult {
  const visitedOrder: string[] = [];
  const visited = new Set<string>();
  for (const seed of seeds) {
    if (!visited.has(seed)) {
      visited.add(seed);
      visitedOrder.push(seed);
    }
  }

  const reachedEdges: Edge[] = [];
  const seenEdges = new Set<string>();
  let frontier = [...visitedOrder];

  for (let hop = 0; hop < maxHop && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const edge of edges) {
        const isSrc = edge.source === node;
        const isTgt = edge.target === node;
        if (!isSrc && !isTgt) continue;
        const key = [edge.source, edge.target].sort().join("\u0000");
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          reachedEdges.push(edge);
        }
        const other = isSrc ? edge.target : edge.source;
        if (!visited.has(other)) {
          visited.add(other);
          visitedOrder.push(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  return { visited: visitedOrder, reachedEdges };
}
