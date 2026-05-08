import { createMiddleware } from "hono/factory";
import { validateToken } from "../auth/jwt.ts";
import { config } from "../config.ts";

export const jwtAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized", message: "Missing or invalid Authorization header" }, 401);
  }
  const token = header.split(" ")[1];
  try {
    const payload = await validateToken(token, config.jwtSecret);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Unauthorized", message: "Invalid or expired token" }, 401);
  }
});

export const adminAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("X-Admin-Token");
  if (header !== config.adminApiKey) {
    return c.json({ error: "Forbidden", message: "Invalid admin token" }, 403);
  }
  await next();
});
