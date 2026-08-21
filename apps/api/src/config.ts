import { resolve } from "node:path";

export type ApiConfig = {
  port: number;
  apiToken: string | null;
  uploadDir: string;
  repoRoot: string;
  uvPath: string;
};

export function getApiConfig(): ApiConfig {
  const port = Number(process.env.API_PORT ?? 3001);
  const token = process.env.API_TOKEN;
  const repoRoot = resolve(import.meta.dir, "..", "..", "..");
  const uploadDir = process.env.UPLOAD_DIR
    ? resolve(process.env.UPLOAD_DIR)
    : resolve(repoRoot, "data", "uploads");
  const uvPath = process.env.UV_PATH?.trim() || "uv";
  return {
    port,
    apiToken: token && token !== "change-me" ? token : null,
    uploadDir,
    repoRoot,
    uvPath,
  };
}
