import { load } from "@std/dotenv";

await load({ export: true, envPath: ".env" });

export const config = {
  registryUrl: Deno.env.get("REGISTRY_URL")!,
  apiKey: Deno.env.get("API_KEY")!,
  jwtSecret: Deno.env.get("JWT_SECRET")!,
  adminApiKey: Deno.env.get("ADMIN_API_KEY")!,
  port: parseInt(Deno.env.get("PORT") || "8000"),
};
