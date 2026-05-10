import { Hono } from "hono";
import { bearerAuth } from "../middleware/auth.ts";
import { getBackendByPrefix } from "../kv-client.ts";
import { config } from "../config.ts";

const proxy = new Hono();

proxy.use("*", bearerAuth);

function decryptToken(encryptedToken: string, encryptionKey: string): string {
  const encryptedBytes = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

proxy.all("/*", async (c) => {
  const path = new URL(c.req.url).pathname;
  const parts = path.split("/").filter(Boolean);
  const prefix = "/" + parts[0];
  const backendPath = "/" + parts.slice(1).join("/");

  const backend = await getBackendByPrefix(prefix);
  if (!backend) {
    return c.json({ error: "Not Found", message: `No backend registered for prefix '${prefix}'` }, 404);
  }

  const targetUrl = `${backend.url}${backendPath}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    const plainToken = decryptToken(backend.token, config.encryptionKey);
    headers.set("Authorization", `Bearer ${plainToken}`);
    headers.set("X-Forwarded-For", c.req.header("X-Forwarded-For") || c.req.header("Host") || "");
    headers.delete("Host");

    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.raw.arrayBuffer(),
      redirect: "manual",
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.set("X-Proxied-By", "deno-proxy");
    responseHeaders.set("X-Backend", backend.name);

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`Proxy error: ${err}`);
    return c.json({ error: "Bad Gateway", message: `Failed to reach backend '${backend.name}'` }, 502);
  }
});

export { proxy };
