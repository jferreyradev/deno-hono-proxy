import { Hono } from "hono";
import { getUser } from "../kv-client.ts";
import { generateToken } from "../auth/jwt.ts";
import { verifyPassword } from "../auth/hash.ts";
import { config } from "../config.ts";

const auth = new Hono();

auth.post("/login", async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: "Bad Request", message: "username and password required" }, 400);
  }
  const user = await getUser(username);
  if (!user || !(await verifyPassword(password, user.data.passwordHash, user.data.salt))) {
    return c.json({ error: "Unauthorized", message: "Invalid credentials" }, 401);
  }
  const token = await generateToken({ sub: user.data.username, role: user.data.role }, config.jwtSecret);
  return c.json({ token });
});

export { auth };
