import { load } from "@std/dotenv";

await load({ export: true, envPath: ".env" });

export const config = {
  registryUrl: Deno.env.get("REGISTRY_URL") || "https://kv-storage-api.jferreyradev.deno.net",
  apiKey: Deno.env.get("API_KEY") || "pi3_141516",
  proxyToken: Deno.env.get("PROXY_TOKEN") || "9z4wMwmwnHZ6XLSYoE66A7y2RFlaCE9Vu6u32zXJ18",
  adminApiKey: Deno.env.get("ADMIN_API_KEY") || "admin_api_key_default",
  adminAccessKey: Deno.env.get("ADMIN_ACCESS_KEY") || "admin_liq_2026",
  encryptionKey: Deno.env.get("ENCRYPTION_KEY") || "default_encryption_key_32bytes!!",
  port: parseInt(Deno.env.get("PORT") || "8000"),
  allowedOrigins: (() => {
    const val = Deno.env.get("ALLOWED_ORIGINS");
    if (!val || val === "*") return "*";
    return val.split(",").map((s) => s.trim());
  })(),
};
