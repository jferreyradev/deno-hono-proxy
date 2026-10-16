import { Hono } from "hono";
import { createBackend, resolveBackendTarget } from "../kv-client.ts";
import { adminAuth } from "../middleware/auth.ts";
import { config } from "../config.ts";

function encryptToken(token: string, encryptionKey: string): string {
  const tokenBytes = new TextEncoder().encode(token);
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const xorData = new Uint8Array(tokenBytes.length);
  for (let i = 0; i < tokenBytes.length; i++) {
    xorData[i] = tokenBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...xorData));
}

const admin = new Hono();

admin.use("*", adminAuth);

// Endpoint existente: registro de backends en KV Storage
admin.post("/backends", async (c) => {
  const { name, url, token, prefix } = await c.req.json();
  if (!name || !url || !token || !prefix) {
    return c.json({ error: "Bad Request", message: "name, url, token, prefix required" }, 400);
  }
  const encryptedToken = encryptToken(token, config.encryptionKey);
  await createBackend({ name, url, token: encryptedToken, prefix });
  return c.json({ message: "Backend registered", name }, 201);
});

// Endpoint adicional: verificación de clave para Admin Studio
admin.post("/verify", (c) => {
  return c.json({ ok: true, authenticated: true });
});

// Endpoint adicional: chequeo de salud del backend remoto activo
admin.get("/health", async (c) => {
  const projectKey =
    c.req.header("x-project-key") || c.req.query("key") || c.req.query("x-project-key") || "desarrollo";
  const projectPort =
    c.req.header("x-project-port") || c.req.query("port") || c.req.query("x-project-port");

  const resolved = await resolveBackendTarget(projectKey, projectPort);
  if (!resolved) {
    return c.json({ api: "offline", error: `No se pudo resolver el backend '${projectKey}'` }, 502);
  }

  try {
    const targetUrl = `${resolved.targetUrl}/api/view/configServer`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(t);

    const connected = res.ok;
    return c.json({
      api: "online",
      version: "1.0.0",
      backend: resolved.name,
      database: {
        connected,
        user: "Oracle",
        connectionString: `${resolved.name} (${resolved.targetUrl})`,
      },
    });
  } catch (err: any) {
    return c.json({
      api: "degraded",
      backend: resolved.name,
      database: {
        connected: false,
        user: "Oracle",
        connectionString: `${resolved.name} (${resolved.targetUrl})`,
        error: err.message,
      },
    });
  }
});

export { admin };
