import { config } from "./config.ts";

interface KvItem<T> {
  key: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface BackendData {
  name: string;
  url: string;
  token: string;
  prefix: string;
}

interface UserData {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role: string;
}

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

export async function getBackendByPrefix(prefix: string): Promise<BackendData | null> {
  const res = await kvRequest("GET", "/collections/backend");
  const items = (res as { items: KvItem<BackendData>[] }).items;
  return items.find((item) => item.data.prefix === prefix)?.data ?? null;
}

export async function getAllBackends(): Promise<KvItem<BackendData>[]> {
  const res = await kvRequest("GET", "/collections/backend");
  return (res as { items: KvItem<BackendData>[] }).items;
}

export async function getBackendByKey(key: string): Promise<KvItem<BackendData> | null> {
  try {
    const res = await kvRequest("GET", `/collections/backend/${key}`);
    return res as KvItem<BackendData>;
  } catch {
    return null;
  }
}

export async function createUser(username: string, passwordHash: string, salt: string, role = "user"): Promise<void> {
  await kvRequest("POST", "/collections/users", {
    key: username,
    data: { username, passwordHash, salt, createdAt: new Date().toISOString(), role },
  });
}

export async function getUser(username: string): Promise<KvItem<UserData> | null> {
  try {
    const res = await kvRequest("GET", `/collections/users/${username}`);
    return res as KvItem<UserData>;
  } catch {
    return null;
  }
}

export async function createBackend(data: BackendData): Promise<void> {
  await kvRequest("POST", "/collections/backend", { key: data.name, data });
}
