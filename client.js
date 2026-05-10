const BASE = "http://localhost:8000";

// Cargar .env manualmente (funciona en Node y Deno)
async function loadEnv() {
  try {
    const text = await (typeof Deno !== "undefined"
      ? Deno.readTextFile(".env")
      : import("fs").then((fs) => fs.promises.readFile(".env", "utf-8")));
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      if (typeof Deno !== "undefined") Deno.env.set(k, v);
      else process.env[k] = v;
    }
  } catch {
    // .env no encontrado
  }
}

function getEnv(key) {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  return process.env[key];
}

async function main() {
  console.log("=== Deno Proxy Client Demo ===\n");

  const proxyToken = getEnv("PROXY_TOKEN");
  if (!proxyToken) {
    console.error("PROXY_TOKEN no definido en .env");
    return;
  }

  const auth = { Authorization: `Bearer ${proxyToken}` };

  // 1. Health check
  console.log("--- 1. Health Check ---");
  const health = await fetch(`${BASE}/health`);
  console.log(await health.json());

  // 2. List backends
  console.log("\n--- 2. Listar Backends ---");
  const listRes = await fetch(`${BASE}/api/backends`, { headers: auth });
  if (!listRes.ok) {
    console.error("Error:", await listRes.text());
  } else {
    const { backends: list } = await listRes.json();
    console.log("Backends:", list.map((b) => b.data.name).join(", ") || "(ninguno)");
  }

  // 3. Detalle del primer backend
  console.log("\n--- 3. Detalle Backend ---");
  {
    const res = await fetch(`${BASE}/api/backends`, { headers: auth });
    if (res.ok) {
      const { backends: list } = await res.json();
      if (list.length > 0) {
        const detail = await fetch(`${BASE}/api/backends/${list[0].key}`, { headers: auth });
        console.log(await detail.json());
      } else {
        console.log("No hay backends registrados");
      }
    }
  }

  // 4. Registrar backend (admin)
  const adminToken = getEnv("ADMIN_API_KEY");
  console.log("\n--- 4. Registrar Backend ---");
  if (adminToken) {
    const res = await fetch(`${BASE}/api/admin/backends`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
      body: JSON.stringify({
        name: "test-backend",
        url: "http://localhost:9999",
        token: "test-token",
        prefix: "/test",
      }),
    });
    console.log(res.ok ? "✓ Backend registrado" : await res.text());
  } else {
    console.log("⚠ ADMIN_API_KEY no definida — saltando");
  }

  // 5. Proxy (prueba con el primer backend existente)
  console.log("\n--- 5. Proxy ---");
  {
    const res = await fetch(`${BASE}/api/backends`, { headers: auth });
    if (res.ok) {
      const { backends: list } = await res.json();
      if (list.length > 0) {
        const prefix = list[0].data.prefix;
        const proxy = await fetch(`${BASE}${prefix}/health`, { headers: auth });
        console.log(`→ ${prefix}/health : ${proxy.status} ${proxy.statusText}`);
      } else {
        console.log("No hay backends para probar el proxy");
      }
    }
  }

  console.log("\n=== Fin ===");
}

await loadEnv();
main().catch(console.error);
