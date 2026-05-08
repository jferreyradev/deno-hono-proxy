import { Hono } from "hono";
import { createUser, createBackend, getUser } from "../kv-client.ts";
import { hashPassword } from "../auth/hash.ts";
import { adminAuth } from "../middleware/auth.ts";

const admin = new Hono();

admin.use("*", adminAuth);

admin.post("/users", async (c) => {
  const { username, password, role } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: "Bad Request", message: "username and password required" }, 400);
  }
  const existing = await getUser(username);
  if (existing) {
    return c.json({ error: "Conflict", message: "User already exists" }, 409);
  }
  const { hash, salt } = await hashPassword(password);
  await createUser(username, hash, salt, role || "user");
  return c.json({ message: "User created", username }, 201);
});

admin.post("/backends", async (c) => {
  const { name, url, token, prefix } = await c.req.json();
  if (!name || !url || !token || !prefix) {
    return c.json({ error: "Bad Request", message: "name, url, token, prefix required" }, 400);
  }
  await createBackend({ name, url, token, prefix });
  return c.json({ message: "Backend registered", name }, 201);
});

export { admin };
