import { createMiddleware } from "hono/factory";
import { config } from "../config.ts";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

export const bearerAuth = createMiddleware(async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return await next();
  }

  // 1. Verificación tradicional por Bearer token (100% retrocompatible con boletas y clientes actuales)
  const header = c.req.header("Authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    if (token === config.proxyToken) {
      return await next();
    }
  }

  // 2. Verificación por X-Admin-Key (para Admin Studio)
  const adminKey =
    c.req.header("X-Admin-Key") ||
    c.req.header("x-admin-key") ||
    c.req.query("x-admin-key");
  if (adminKey && timingSafeEqualStr(adminKey, config.adminAccessKey)) {
    return await next();
  }

  return c.json(
    { error: "Unauthorized", message: "Missing or invalid Authorization header or X-Admin-Key" },
    401
  );
});

export const adminAuth = createMiddleware(async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return await next();
  }

  // 1. Header tradicional X-Admin-Token
  const header = c.req.header("X-Admin-Token");
  if (header && timingSafeEqualStr(header, config.adminApiKey)) {
    return await next();
  }

  // 2. Header X-Admin-Key
  const adminKey = c.req.header("X-Admin-Key") || c.req.header("x-admin-key");
  if (adminKey && timingSafeEqualStr(adminKey, config.adminAccessKey)) {
    return await next();
  }

  return c.json({ error: "Forbidden", message: "Invalid admin token" }, 403);
});
