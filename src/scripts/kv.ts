/**
 * KV Storage Utilities
 * 
 * Módulo para interactuar con la API de KV Storage
 * https://kv-storage-api.deno.dev
 * 
 * Soporta desencriptación de tokens almacenados con Base64 + XOR
 */

export interface Backend {
    key: string;
    name: string;
    url: string;
    prefix: string;
    token?: string;
}

const KV_API = "https://kv-storage-api.jferreyradev.deno.net";

/**
 * Desencripta un token que fue encriptado con Base64 + XOR
 * @param encryptedToken - Token encriptado en formato base64
 * @param encryptionKey - Clave de encriptación (debe ser la misma que se usó para encriptar)
 * @returns Token desencriptado
 */
function decryptToken(encryptedToken: string, encryptionKey: string): string {
    try {
        const xorData = new Uint8Array(atob(encryptedToken).split('').map(c => c.charCodeAt(0)));
        const keyBytes = new TextEncoder().encode(encryptionKey);
        const decoder = new TextDecoder();
        
        const tokenBytes = new Uint8Array(xorData.length);
        for (let i = 0; i < xorData.length; i++) {
            tokenBytes[i] = xorData[i] ^ keyBytes[i % keyBytes.length];
        }
        
        return decoder.decode(tokenBytes);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to decrypt token: ${errorMsg}`);
    }
}

/**
 * Obtiene la lista de backends desde KV Storage
 * @param collection - Nombre de la colección (default: "backend")
 * @param encryptionKey - Clave de encriptación para desencriptar tokens (opcional)
 * @returns Array de backends disponibles con tokens desencriptados si es aplicable
 */
export async function getBackendsFromKV(collection = "backend", encryptionKey?: string): Promise<Backend[]> {
    const response = await fetch(`${KV_API}/collections/${collection}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });

    if (!response.ok) {
        throw new Error(`KV API returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
        return [];
    }

    return data.items.map((item: Record<string, unknown>) => {
        const backend: Backend = {
            key: item.key as string,
            name: (item.data as Record<string, unknown>)?.name as string,
            url: (item.data as Record<string, unknown>)?.url as string,
            prefix: (item.data as Record<string, unknown>)?.prefix as string,
        };

        // Desencriptar token si la clave se proporciona y hay un token encriptado
        const encryptedToken = (item.data as Record<string, unknown>)?.token as string;
        if (encryptionKey && encryptedToken) {
            try {
                backend.token = decryptToken(encryptedToken, encryptionKey);
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.warn(`⚠️  No se pudo desencriptar token para ${backend.name}: ${errMsg}`);
                backend.token = "";
            }
        }

        return backend;
    });
}

/**
 * Obtiene un backend específico por nombre
 * @param name - Nombre del backend
 * @param collection - Nombre de la colección (default: "backend")
 * @param encryptionKey - Clave de encriptación para desencriptar tokens (opcional)
 * @returns El backend encontrado o undefined
 */
export async function getBackendByName(
    name: string,
    collection = "backend",
    encryptionKey?: string
): Promise<Backend | undefined> {
    const backends = await getBackendsFromKV(collection, encryptionKey);
    return backends.find(b => b.name === name);
}

/**
 * Convierte la lista de backends a un formato compatible con el proxy
 * @param backends - Lista de backends
 * @returns Map de nombre -> configuración
 */
export function toProxyBackends(
    backends: Backend[]
): Map<string, { name: string; url: string; token: string }> {
    const map = new Map();
    for (const backend of backends) {
        map.set(backend.name, {
            name: backend.name,
            url: backend.url,
            token: ""  // El token debe ser agregado por separado
        });
    }
    return map;
}
