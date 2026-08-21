import type { Context, Next } from "hono";
import { getApiConfig } from "../config";

/**
 * Requires `Authorization: Bearer <API_TOKEN>` for write routes when API_TOKEN
 * is configured. When no token is set (local dev), writes are allowed.
 */
export async function requireWriteAuth(c: Context, next: Next) {
  const { apiToken } = getApiConfig();
  if (apiToken) {
    const header = c.req.header("Authorization") ?? "";
    if (header !== `Bearer ${apiToken}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }
  await next();
}
