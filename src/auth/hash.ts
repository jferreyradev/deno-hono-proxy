async function generateSalt(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || await generateSalt();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password + s),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode("deno-proxy-salt"), iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return { hash: btoa(String.fromCharCode(...new Uint8Array(derived))), salt: s };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt);
  return computed === hash;
}
