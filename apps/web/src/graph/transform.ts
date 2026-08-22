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
    position: { x: (i % 4) * 420, y: Math.floor(i / 4) * 320 },
    data: { label: n.label },
    style: {
      background: TYPE_COLORS[n.type?.toUpperCase()] ?? TYPE_COLORS.UNKNOWN,
      color: "#0f172a",
      border: "1px solid #334155",
      borderRadius: 8,
      padding: "6px 12px",
    },
  }));
  const edges: Edge[] = data.edges.map((e) => {
    // Show only the first keyword, capped, so labels stay small.
    const label = (e.label ?? "").split(",")[0]?.trim().slice(0, 14) || e.label || "";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label,
      style: {
        strokeWidth: Math.max(1, Math.min(4, (e.weight ?? 1) * 2)),
        stroke: "#64748b",
      },
      labelStyle: { fill: "#cbd5e1", fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: "#0f172a", fillOpacity: 0.95, stroke: "#475569", strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 5,
    };
  });
  return { nodes, edges };
}
