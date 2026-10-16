import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "./middleware/logger.ts";
import { admin } from "./routes/admin.ts";
import { backends } from "./routes/backends.ts";
import { proxy } from "./routes/proxy.ts";
import { config } from "./config.ts";

const app = new Hono();

app.use("*", logger);
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Admin-Token",
      "X-Admin-Key",
      "x-admin-key",
      "x-project-key",
      "x-project-port",
      "x-file-name",
      "x-internal-key",
      "Cache-Control",
    ],
    exposeHeaders: [
      "Content-Length",
      "Content-Type",
      "Content-Disposition",
      "X-Proxied-By",
      "X-Backend",
    ],
    maxAge: 86400,
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/admin", admin);
app.route("/api/backends", backends);
app.route("/", proxy);

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Deno Proxy running on port ${port}`);

Deno.serve({ port }, app.fetch);
