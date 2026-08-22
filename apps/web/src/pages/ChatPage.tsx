import { useState } from "react";
import { chatStream } from "../services/api";

type Message = { id: string; role: "user" | "assistant"; text: string };
type ToolCallEntry = { step: number; tool: string; input: string };
type EvidenceEntry = { tool: string; output: string };

function parseEvidenceResults(output: string) {
  try {
    const data = JSON.parse(output) as { results?: { chunk_id?: string; snippet?: string; text?: string }[] };
    if (Array.isArray(data.results)) {
      return data.results.slice(0, 3).map((r) => ({
        chunkId: r.chunk_id ?? "",
        snippet: r.snippet ?? r.text ?? "",
      }));
    }
  } catch {
    // not JSON
  }
  return [];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setError("");
    setToolCalls([]);
    setEvidence([]);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: question }]);
    setBusy(true);

    let answer = "";
    const pushAnswer = () => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, text: answer };
        } else {
          next.push({ id: crypto.randomUUID(), role: "assistant", text: answer });
        }
        return next;
      });
    };

    try {
      await chatStream(question, (event) => {
        if (event.type === "tool_call") {
          setToolCalls((prev) => [
            ...prev,
            {
              step: Number(event.data.step ?? 1),
              tool: String(event.data.tool ?? ""),
              input: String(event.data.input ?? ""),
            },
          ]);
        } else if (event.type === "evidence") {
          setEvidence((prev) => [
            ...prev,
            { tool: String(event.data.tool ?? ""), output: String(event.data.output ?? "") },
          ]);
        } else if (event.type === "delta") {
          answer += String(event.data.text ?? "");
          pushAnswer();
        } else if (event.type === "done") {
          answer = String(event.data.answer ?? answer);
          pushAnswer();
        } else if (event.type === "error") {
          setError(String(event.data.message ?? "unknown error"));
        }
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">QA Chat</h2>
        <button
          className="rounded border border-slate-600 px-3 py-1 text-sm"
          onClick={() => {
            setMessages([]);
            setToolCalls([]);
            setEvidence([]);
            setError("");
          }}
        >
          New conversation
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded border border-slate-800 bg-slate-900 p-4">
        {messages.length === 0 && (
          <p className="text-slate-500 text-sm">
            Ask about the knowledge base, e.g. "Who does Ethan Brooks report to?"
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={
                m.role === "user"
                  ? "inline-block rounded-lg bg-sky-600 px-3 py-2 text-sm text-white"
                  : "inline-block rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 whitespace-pre-wrap"
              }
            >
              {m.text}
            </span>
          </div>
        ))}
        {busy && <p className="text-slate-500 text-sm">thinking…</p>}
        {error && <p className="text-rose-400 text-sm">Error: {error}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Tool trace</h3>
          {toolCalls.length === 0 && <p className="text-xs text-slate-500">No tool calls yet.</p>}
          <ol className="space-y-1 text-xs text-slate-400">
            {toolCalls.map((t, i) => (
              <li key={i}>
                <span className="text-slate-200">{i + 1}.</span> {t.tool}{" "}
                <span className="text-slate-500">({t.input.slice(0, 60)})</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Evidence</h3>
          {evidence.length === 0 && <p className="text-xs text-slate-500">No evidence yet.</p>}
          <div className="space-y-2">
            {evidence.map((e, i) => {
              const results = parseEvidenceResults(e.output);
              return (
                <div key={i} className="rounded bg-slate-800 p-2">
                  <p className="text-xs text-slate-400">{e.tool}</p>
                  {results.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {results.map((r, j) => (
                        <li key={j} className="text-xs text-slate-200">
                          <span className="text-sky-400">{r.chunkId.slice(0, 24)}</span> {r.snippet.slice(0, 160)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">{e.output.slice(0, 240)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-sky-600 px-4 py-2 text-sm hover:bg-sky-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
