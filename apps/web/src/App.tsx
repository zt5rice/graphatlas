import { NavLink, Route, Routes } from "react-router-dom";
import UploadJobs from "./pages/UploadJobs";
import GraphExplorer from "./pages/GraphExplorer";
import ChatPage from "./pages/ChatPage";
import EvalDashboard from "./pages/EvalDashboard";

const links = [
  { to: "/", label: "Upload / Jobs" },
  { to: "/graph", label: "Graph" },
  { to: "/chat", label: "Chat" },
  { to: "/eval", label: "Benchmark" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">GraphAtlas</h1>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                isActive ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<UploadJobs />} />
          <Route path="/graph" element={<GraphExplorer />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/eval" element={<EvalDashboard />} />
        </Routes>
      </main>
    </div>
  );
}
