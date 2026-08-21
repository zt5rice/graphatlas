import { Hono } from "hono";
import { cors } from "hono/cors";
import { pingDb } from "@graphatlas/db";

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

const port = Number(process.env.API_PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};
