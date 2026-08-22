import { useCallback, useEffect, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchGraph } from "../services/api";
import { graphToFlow } from "../graph/transform";

export default function GraphExplorer() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [entity, setEntity] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      const data = await fetchGraph(name);
      const mapped = graphToFlow(data);
      setNodes(mapped.nodes);
      setEdges(mapped.edges);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      void load(String(node.id));
    },
    [load],
  );

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    void load(entity.trim() || undefined);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold">Graph Explorer</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            placeholder="Entity name (e.g. Ethan Brooks)"
            className="rounded bg-slate-900 border border-slate-700 px-3 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-sky-600 px-3 py-1 text-sm hover:bg-sky-500"
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-slate-600 px-3 py-1 text-sm"
          >
            Overview
          </button>
        </form>
        {loading && <span className="text-sm text-slate-400">loading…</span>}
      </div>
      <p className="text-xs text-slate-500">
        Click a node to expand its 1-hop neighborhood. Node color = entity type; edge width = weight.
      </p>
      <div className="h-[560px] rounded border border-slate-800 bg-slate-900">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
