import { parseArgs } from "node:util";
import { closeDb } from "./db";
import { runEtl } from "./etl/run";

const { values } = parseArgs({
  options: {
    "workspace-dir": { type: "string", required: true },
    "document-id": { type: "string", required: true },
  },
});

try {
  const result = await runEtl(values["workspace-dir"]!, values["document-id"]!);
  console.log(
    `[etl] ok: document=${result.documentId} chunks=${result.chunks} entities=${result.entities} relations=${result.relations}`,
  );
} finally {
  await closeDb();
}
