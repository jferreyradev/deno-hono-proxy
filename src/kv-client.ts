import { config } from "./config.ts";

export interface KvItem<T> {
  key: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface BackendData {
  name: string;
  url: string;
  token?: string;
  prefix?: string;
}

export interface ResolvedBackend {
  name: string;
  targetUrl: string;
  token?: string;
  prefix?: string;
}

// Caché en memoria para evitar saturar kv-storage-api
let cache: { items: KvItem<BackendData>[]; expires: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

const DEFAULT_PORTS: Record<string, string> = {
  ServerTrancas: "3005",
  trancas: "3005",
  tafiviejo: "3007",
  tv: "3007",
  concecpcion: "3007",
  concepcion: "3007",
  conc: "3007",
  Burru: "3003",
  burru: "3003",
  desarrollo: "3005",
  desa: "3005",
};

const ALIAS_MAP: Record<string, string> = {
  trancas: "ServerTrancas",
  servertrancas: "ServerTrancas",
  tv: "tafiviejo",
  tafiviejo: "tafiviejo",
  conc: "concecpcion",
  concepcion: "concecpcion",
  concecpcion: "concecpcion",
  burru: "Burru",
  burruyacu: "Burru",
  desa: "desarrollo",
  desarrollo: "desarrollo",
};

async function kvRequest(method: string, path: string, body?: unknown) {
  const url = `${config.registryUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV Storage error: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function getAllBackends(forceRefresh = false): Promise<KvItem<BackendData>[]> {
  if (!forceRefresh && cache && cache.expires > Date.now()) {
    return cache.items;
  }
  try {
    const res = await kvRequest("GET", "/collections/backend");
    const items = (res as { items: KvItem<BackendData>[] }).items || [];
    cache = {
      items,
      expires: Date.now() + CACHE_TTL_MS,
    };
    return items;
  } catch (err) {
    if (cache) return cache.items;
    throw err;
  }
}

export async function getBackendByKey(key: string): Promise<KvItem<BackendData> | null> {
  const items = await getAllBackends();
  const canonical = ALIAS_MAP[key.toLowerCase()] || key;
  return (
    items.find(
      (i) =>
        i.key.toLowerCase() === canonical.toLowerCase() ||
        i.data?.name?.toLowerCase() === canonical.toLowerCase()
    ) ?? null
  );
}

export async function getBackendByPrefix(prefix: string): Promise<BackendData | null> {
  const cleanPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
  const items = await getAllBackends();
  return items.find((item) => item.data?.prefix === cleanPrefix)?.data ?? null;
}

export async function resolveBackendTarget(
  keyOrPrefix: string,
  explicitPort?: string | null
): Promise<ResolvedBackend | null> {
  // 1. IP o URL directa
  if (keyOrPrefix.startsWith("http://") || keyOrPrefix.startsWith("https://")) {
    const u = new URL(keyOrPrefix);
    const port = explicitPort || u.port || "3005";
    return {
      name: "Direct Host",
      targetUrl: `${u.protocol}//${u.hostname}:${port}`,
    };
  }

  // 2. IP pura (ej: 181.15.107.62)
  if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(keyOrPrefix)) {
    const port = explicitPort || "3005";
    return {
      name: keyOrPrefix,
      targetUrl: `http://${keyOrPrefix}:${port}`,
    };
  }

  // 3. IP fija preferida para Trancas
  const lower = keyOrPrefix.toLowerCase().replace(/^\//, "");
  if (lower === "servertrancas" || lower === "trancas") {
    const port = explicitPort || "3005";
    return {
      name: "ServerTrancas",
      targetUrl: `http://181.15.107.62:${port}`,
    };
  }

  // 4. Búsqueda por prefix si empieza con /
  if (keyOrPrefix.startsWith("/")) {
    const b = await getBackendByPrefix(keyOrPrefix);
    if (b) {
      const u = new URL(b.url);
      const canonical = ALIAS_MAP[b.name.toLowerCase()] || b.name;
      const port = explicitPort || DEFAULT_PORTS[canonical] || u.port || "3005";
      return {
        name: b.name,
        targetUrl: `${u.protocol}//${u.hostname}:${port}`,
        token: b.token,
        prefix: b.prefix,
      };
    }
  }

  // 5. Búsqueda por key o alias
  const item = await getBackendByKey(keyOrPrefix);
  if (item && item.data) {
    const b = item.data;
    const u = new URL(b.url);
    const canonical = ALIAS_MAP[b.name.toLowerCase()] || b.name;
    const port = explicitPort || DEFAULT_PORTS[canonical] || u.port || "3005";
    return {
      name: b.name,
      targetUrl: `${u.protocol}//${u.hostname}:${port}`,
      token: b.token,
      prefix: b.prefix,
    };
  }

  return null;
}

export async function createBackend(data: BackendData): Promise<void> {
  await kvRequest("POST", "/collections/backend", { key: data.name, data });
  if (cache) cache.expires = 0;
}
