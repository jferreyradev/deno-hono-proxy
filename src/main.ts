import { Hono } from "hono";
import { logger } from "./middleware/logger.ts";
import { admin } from "./routes/admin.ts";
import { backends } from "./routes/backends.ts";
import { proxy } from "./routes/proxy.ts";

const app = new Hono();

app.use("*", logger);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/admin", admin);
app.route("/api/backends", backends);
app.route("/", proxy);

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Deno Proxy running on port ${port}`);

Deno.serve({ port }, app.fetch);
