import { Hono } from "hono";
import { createBackend } from "../kv-client.ts";
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

admin.post("/backends", async (c) => {
  const { name, url, token, prefix } = await c.req.json();
  if (!name || !url || !token || !prefix) {
    return c.json({ error: "Bad Request", message: "name, url, token, prefix required" }, 400);
  }
  const encryptedToken = encryptToken(token, config.encryptionKey);
  await createBackend({ name, url, token: encryptedToken, prefix });
  return c.json({ message: "Backend registered", name }, 201);
});

export { admin };
