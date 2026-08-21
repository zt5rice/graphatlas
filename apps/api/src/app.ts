import { Hono } from "hono";
import { cors } from "hono/cors";
import { pingDb } from "@graphatlas/db";
import { documentsRouter } from "./routes/documents";
import { jobsRouter } from "./routes/jobs";

export function createApp(): Hono {
  const app = new Hono();

  app.use("/api/*", cors());

  app.get("/health", async (c) => {
    const dbUp = await pingDb();
    return c.json({
      status: "ok",
      service: "graphatlas-api",
      db: dbUp ? "up" : "down",
      time: new Date().toISOString(),
    });
  });

  app.route("/api/v1/documents", documentsRouter);
  app.route("/api/v1", jobsRouter);

  return app;
}

export const app = createApp();
