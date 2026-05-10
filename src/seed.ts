const registryUrl = Deno.env.get("REGISTRY_URL") || "https://kv-storage-api.jferreyradev.deno.net";
const apiKey = Deno.env.get("API_KEY") || "pi3_141516";
const port = parseInt(Deno.env.get("PORT") || "8000");

function generateSecret(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, length * 1.5);
}

async function kvRequest(method: string, path: string, body?: unknown) {
  const url = `${registryUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV Storage error: ${res.status} - ${text}`);
  }
  return res.json();
}

async function getBackendByKey(key: string) {
  try {
    return await kvRequest("GET", `/collections/backend/${key}`);
  } catch {
    return null;
  }
}

async function createBackend(data: { name: string; url: string; token: string; prefix: string }) {
  await kvRequest("POST", "/collections/backend", { key: data.name, data });
}

async function ensureSecret(name: string, current: string | undefined): Promise<string> {
  if (current && current.length > 10) return current;
  const secret = generateSecret();
  console.log(`✓ ${name} generated: ${secret}`);
  return secret;
}

async function writeEnvFile(proxyToken: string, adminApiKey: string) {
  const envContent = [
    `REGISTRY_URL=${registryUrl}`,
    `API_KEY=${apiKey}`,
    `PROXY_TOKEN=${proxyToken}`,
    `ADMIN_API_KEY=${adminApiKey}`,
    `PORT=${port}`,
    "",
  ].join("\n");
  try {
    await Deno.writeTextFile(".env", envContent);
    console.log("✓ .env file created");
  } catch {
    console.log("! Could not write .env file (may already exist or no permissions)");
  }
}

async function ensureBackends() {
  const backendsToSeed = [
    { name: "concecpcion", url: "http://181.91.92.113:3008", token: "DwYaDBYDAgFa", prefix: "/conc" },
    { name: "desa", url: "http://181.87.25.165:3004", token: "CAwHDgFDXV8ABgAAGFRc", prefix: "/desa" },
  ];
  for (const b of backendsToSeed) {
    const existing = await getBackendByKey(b.name);
    if (existing) {
      console.log(`✓ Backend '${b.name}' already exists`);
    } else {
      await createBackend(b);
      console.log(`✓ Backend '${b.name}' created`);
    }
  }
}

console.log("=== Deno Proxy Seed ===\n");

const proxyToken = await ensureSecret("PROXY_TOKEN", Deno.env.get("PROXY_TOKEN"));
const adminApiKey = await ensureSecret("ADMIN_API_KEY", Deno.env.get("ADMIN_API_KEY"));

await writeEnvFile(proxyToken, adminApiKey);
await ensureBackends();

console.log("\n=== Deno Deploy Setup ===");
console.log("Run these commands to configure Deno Deploy:");
console.log(`  deployctl secret add PROXY_TOKEN "${proxyToken}"`);
console.log(`  deployctl secret add ADMIN_API_KEY "${adminApiKey}"`);
console.log("\nOr configure manually at: https://dash.deno.com/projects/YOUR_PROJECT/settings");
console.log("\n=== Done ===");
