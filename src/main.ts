import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "./middleware/logger.ts";
import { auth } from "./routes/auth.ts";
import { admin } from "./routes/admin.ts";
import { backends } from "./routes/backends.ts";
import { proxy } from "./routes/proxy.ts";

const app = new Hono();

app.use("*", logger);
app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", auth);
app.route("/api/admin", admin);
app.route("/api/backends", backends);
app.route("/", proxy);

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Deno Proxy running on port ${port}`);

Deno.serve({ port }, app.fetch);
