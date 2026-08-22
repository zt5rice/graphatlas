import type { Edge, Node } from "@xyflow/react";

export type GraphNodeData = { id: string; label: string; type: string; description: string };
export type GraphEdgeData = { id: string; source: string; target: string; label: string; weight: number };
export type GraphResponse = { entity: string | null; depth: number; nodes: GraphNodeData[]; edges: GraphEdgeData[] };

const TYPE_COLORS: Record<string, string> = {
  PERSON: "#38bdf8",
  ORGANIZATION: "#4ade80",
  PROJECT: "#fbbf24",
  PRODUCT: "#f472b6",
  UNKNOWN: "#94a3b8",
};

/**
 * Maps the /graph API response to React Flow nodes/edges with type-based colors
 * and weight-based edge widths.
 */
export function graphToFlow(data: GraphResponse): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = data.nodes.map((n, i) => ({
    id: n.id,
    position: { x: (i % 6) * 220, y: Math.floor(i / 6) * 160 },
    data: { label: n.label },
    style: {
      background: TYPE_COLORS[n.type?.toUpperCase()] ?? TYPE_COLORS.UNKNOWN,
      color: "#0f172a",
      border: "1px solid #334155",
      borderRadius: 8,
      padding: "6px 12px",
    },
  }));
  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: {
      strokeWidth: Math.max(1, Math.min(4, (e.weight ?? 1) * 2)),
      stroke: "#64748b",
    },
  }));
  return { nodes, edges };
}
