import { load } from "@std/dotenv";

await load({ export: true, envPath: ".env" });

export const config = {
  registryUrl: Deno.env.get("REGISTRY_URL")!,
  apiKey: Deno.env.get("API_KEY")!,
  proxyToken: Deno.env.get("PROXY_TOKEN")!,
  adminApiKey: Deno.env.get("ADMIN_API_KEY")!,
  encryptionKey: Deno.env.get("ENCRYPTION_KEY")!,
  port: parseInt(Deno.env.get("PORT") || "8000"),
};
