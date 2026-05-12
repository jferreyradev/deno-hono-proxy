const BASE_URL = "https://deno-hono-proxy.jferreyradev.deno.net";

const PROXY_TOKEN = "9z4wMwmwnHZ6XLSYoE66A7y2RFlaCE9Vu6u32zXJ18";

function decryptToken(encryptedToken, encryptionKey) {
  const encryptedBytes = Uint8Array.from(atob(encryptedToken), (c) =>
    c.charCodeAt(0),
  );
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

async function main() {
  console.log("\n--- 1. Proxy Query ---");

  const res = await fetch(`${BASE_URL}/api/backends`, {
    method: "GET",
    headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
  });

  const result = await res.json();

  //console.log("Backends registrados:", result);

  if (result.backends.length > 0) {
    console.log(result.backends);

    for (const backend of result.backends) {
      console.log(
        `Backend: ${backend.data.name}, Token Encriptado: ${backend.data.token}`,
      );

      // Realizar una consulta de prueba al backend a través del proxy
      const response = await fetch(`${BASE_URL}${backend.data.prefix}/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PROXY_TOKEN}`,
        },
      });

      console.log(`Respuesta del proxy para ${backend.data.name}: ${await response.text()} `);

      // Realizar otra consulta de prueba al backend a través del proxy
      const resp = await fetch(`${BASE_URL}${backend.data.prefix}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PROXY_TOKEN}`,
        },
        body: JSON.stringify({ query: "select * from config_server" }),
      });
      console.log(`Respuesta del proxy para ${backend.data.name}: ${await resp.text()} `);
    }
    //console.log("Token desencriptado:", decryptToken(result.backends[2].data.token, "litos123"));
  }
}

await main();
