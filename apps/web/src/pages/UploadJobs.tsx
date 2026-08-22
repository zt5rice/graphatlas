import { useCallback, useEffect, useState } from "react";
import type { DocumentRecord, JobRecord } from "@graphatlas/contracts";
import { getJob, ingestDocument, listDocuments, uploadDocument } from "../services/api";

export default function UploadJobs() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setDocuments(await listDocuments());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(file: File) {
    setMessage("Uploading...");
    await uploadDocument(file);
    setMessage("Uploaded. Trigger ingest to build the graph.");
    await refresh();
  }

  async function handleIngest(id: string) {
    setMessage("Ingesting...");
    const { job_id } = await ingestDocument(id);
    const poll = setInterval(async () => {
      const current = await getJob(job_id);
      setJob(current);
      if (current.status === "ready" || current.status === "failed") {
        clearInterval(poll);
        setMessage(`Job ${current.status} (${current.stage})`);
        await refresh();
      }
    }, 1000);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Documents &amp; Jobs</h2>
      <input
        type="file"
        accept=".md,.txt,.csv"
        className="block text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
      {message && <p className="text-sky-400 text-sm">{message}</p>}
      {job && (
        <p className="text-sm text-slate-300">
          Job {job.status} · stage {job.stage} · {JSON.stringify(job.timings)}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-2">Title</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-t border-slate-800">
              <td className="py-2">{doc.title}</td>
              <td>{doc.status}</td>
              <td>
                {doc.status === "uploaded" || doc.status === "failed" ? (
                  <button
                    className="text-sky-400 underline underline-offset-4"
                    onClick={() => void handleIngest(doc.id)}
                  >
                    Ingest
                  </button>
                ) : (
                  <span className="text-slate-500">{doc.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
