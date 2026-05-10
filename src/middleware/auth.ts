import { createMiddleware } from "hono/factory";
import { config } from "../config.ts";

export const bearerAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized", message: "Missing or invalid Authorization header" }, 401);
  }
  const token = header.split(" ")[1];
  if (token !== config.proxyToken) {
    return c.json({ error: "Unauthorized", message: "Invalid token" }, 401);
  }
  await next();
});

export const adminAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("X-Admin-Token");
  if (header !== config.adminApiKey) {
    return c.json({ error: "Forbidden", message: "Invalid admin token" }, 403);
  }
  await next();
});
