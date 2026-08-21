import { Hono } from "hono";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getApiConfig } from "../config";
import { requireWriteAuth } from "../middleware/auth";
import { getDocument, insertDocument, listDocuments } from "@graphatlas/db";
import type { DocumentKind } from "@graphatlas/contracts";

const KIND_BY_EXT: Record<string, DocumentKind> = {
  md: "md",
  markdown: "md",
  txt: "txt",
  csv: "csv",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const documentsRouter = new Hono();

documentsRouter.post("/", requireWriteAuth, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "file is required (multipart field 'file')" }, 400);
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const kind = KIND_BY_EXT[ext];
  if (!kind) {
    return c.json({ error: `unsupported file type '.${ext}' (allowed: md, txt, csv)` }, 400);
  }

  const title = String(form.get("title") ?? "").trim() || file.name;
  const doc = await insertDocument({
    title,
    kind,
    fileType: file.type || ext,
    metadata: { original_filename: file.name, size: file.size },
  });

  const uploadDir = join(getApiConfig().uploadDir, doc.id);
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(join(uploadDir, file.name), Buffer.from(await file.arrayBuffer()));

  return c.json(doc, 201);
});

documentsRouter.get("/", async (c) => {
  return c.json(await listDocuments());
});

documentsRouter.get("/:id", async (c) => {
  const id = c.req.param("id")!;
  if (!UUID_RE.test(id)) return c.json({ error: "document not found" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "document not found" }, 404);
  return c.json(doc);
});
