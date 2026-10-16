import { Hono } from "hono";
import { bearerAuth } from "../middleware/auth.ts";
import { getBackendByPrefix, resolveBackendTarget } from "../kv-client.ts";
import { config } from "../config.ts";

const proxy = new Hono();

proxy.use("*", bearerAuth);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Admin-Token, X-Admin-Key, x-admin-key, x-project-key, x-project-port, x-file-name, x-internal-key, Cache-Control",
};

function decryptToken(encryptedToken: string, encryptionKey: string): string | null {
  try {
    const encryptedBytes = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(encryptionKey);
    const decrypted = new Uint8Array(encryptedBytes.length);
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    const str = new TextDecoder().decode(decrypted);
    // Verificar que sea una cadena imprimible válida para cabeceras HTTP
    if (/^[\x20-\x7E]+$/.test(str)) {
      return str;
    }
    return null;
  } catch (_) {
    return null;
  }
}

proxy.all("/*", async (c) => {
  const urlObj = new URL(c.req.url);
  const path = urlObj.pathname;
  const search = urlObj.search;
  const parts = path.split("/").filter(Boolean);
  const prefix = "/" + (parts[0] || "");
  const explicitPort =
    c.req.header("x-project-port") || c.req.query("port") || c.req.query("x-project-port");

  let targetUrl: string | null = null;
  let backendName = "remote";
  let backendToken: string | undefined = undefined;

  // Flujo 1: Búsqueda por prefijo en la URL (Flujo original de boletas, scripts y apps existentes)
  const backendByPrefix = await getBackendByPrefix(prefix);
  if (backendByPrefix) {
    const backendPath = "/" + parts.slice(1).join("/");
    const resolved = await resolveBackendTarget(prefix, explicitPort);
    const baseUrl = resolved?.targetUrl || backendByPrefix.url;
    targetUrl = `${baseUrl}${backendPath}${search}`;
    backendName = backendByPrefix.name;
    backendToken = backendByPrefix.token;
  } else {
    // Flujo 2: Búsqueda por cabecera x-project-key (Flujo para Admin Studio)
    const projectKey =
      c.req.header("x-project-key") || c.req.query("key") || c.req.query("x-project-key");

    if (projectKey) {
      const resolved = await resolveBackendTarget(projectKey, explicitPort);
      if (resolved) {
        targetUrl = `${resolved.targetUrl}${path}${search}`;
        backendName = resolved.name;
        backendToken = resolved.token;
      }
    }
  }

  if (!targetUrl) {
    return c.json(
      {
        error: "Not Found",
        message: `No backend registered for prefix '${prefix}' or x-project-key`,
      },
      404
    );
  }

  try {
    const headers = new Headers();
    for (const [key, val] of c.req.raw.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== "host" && lower !== "connection") {
        headers.set(key, val);
      }
    }

    // Inyectar token del backend destino si corresponde
    if (backendToken && !headers.has("Authorization")) {
      const plainToken = decryptToken(backendToken, config.encryptionKey);
      if (plainToken) {
        headers.set("Authorization", `Bearer ${plainToken}`);
      }
    }

    // Reenvío de clave de administrador hacia api_liquid
    const adminKey = c.req.header("X-Admin-Key") || c.req.header("x-admin-key");
    if (adminKey) {
      headers.set("X-Admin-Key", adminKey);
    }

    // Reenvío de nombre de archivo para carga masiva de novedades
    const fileName = c.req.header("x-file-name");
    if (fileName) {
      headers.set("x-file-name", fileName);
    }

    headers.set("X-Forwarded-For", c.req.header("X-Forwarded-For") || c.req.header("Host") || "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const body = ["GET", "HEAD"].includes(c.req.method)
      ? undefined
      : await c.req.raw.arrayBuffer();

    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v);
    }
    responseHeaders.set("X-Proxied-By", "deno-hono-proxy");
    responseHeaders.set("X-Backend", backendName);

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return c.json(
        {
          error: "Gateway Timeout",
          message: `Timeout al conectar con backend '${backendName}' en ${targetUrl}`,
        },
        504
      );
    }
    return c.json(
      {
        error: "Bad Gateway",
        message: `Fallo al conectar con '${backendName}' (${targetUrl}): ${err.message}`,
      },
      502
    );
  }
});

export { proxy };
