import { Hono } from "hono";
import { getAllBackends, getBackendByKey } from "../kv-client.ts";
import { jwtAuth } from "../middleware/auth.ts";

const backends = new Hono();

backends.use("*", jwtAuth);

backends.get("/", async (c) => {
  const items = await getAllBackends();
  const list = items.map(({ key, data, createdAt, updatedAt }) => ({ key, data, createdAt, updatedAt }));
  return c.json({ backends: list, count: list.length });
});

backends.get("/:key", async (c) => {
  const key = c.req.param("key");
  const item = await getBackendByKey(key);
  if (!item) {
    return c.json({ error: "Not Found", message: `Backend '${key}' not found` }, 404);
  }
  return c.json(item);
});

export { backends };
