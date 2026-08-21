export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold tracking-tight">GraphAtlas</h1>
      <p className="text-slate-400 max-w-md text-center">
        Multi-Engine GraphRAG Enterprise Knowledge Platform — scaffold in progress.
      </p>
      <a
        className="text-sky-400 underline underline-offset-4"
        href="http://localhost:3001/health"
        target="_blank"
        rel="noreferrer"
      >
        API health check
      </a>
    </main>
  );
}
