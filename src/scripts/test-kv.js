
import { getBackendsFromKV } from "./kv.ts";

console.log("🧪 Test del KV Storage API\n");

// Obtener clave de encriptación de variables de entorno si está disponible
const encryptionKey = Deno.env.get("ENCRYPTION_KEY");

try {
    const backends = await getBackendsFromKV("backend", encryptionKey);
    
    console.log(`✅ Backends encontrados: ${backends.length}`);
    console.log("");
    
    if (backends.length === 0) {
        console.log("⚠️  No hay backends configurados en KV");
    } else {
        for (const backend of backends) {
            console.log(`📦 ${backend.name}`);
            console.log(`   URL: ${backend.url}`);
            console.log(`   Prefix: ${backend.prefix}`);
            if (backend.token) {
                console.log(`   Token: ${backend.token.substring(0, 8)}...`);
            } else {
                console.log(`   Token: (no hay token)`);
            }
            console.log("");
        }
    }
} catch (error) {
    console.error("❌ Error:", error.message);
}
