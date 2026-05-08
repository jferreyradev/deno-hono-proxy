import { sign, verify } from "hono/jwt";

export async function generateToken(payload: Record<string, unknown>, secret: string, expiresIn = "24h"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiresIn(expiresIn);
  return sign({ ...payload, iat: now, exp }, secret);
}

export async function validateToken(token: string, secret: string): Promise<Record<string, unknown>> {
  return verify(token, secret);
}

function parseExpiresIn(time: string): number {
  const match = time.match(/^(\d+)(h|m|s)$/);
  if (!match) return 86400;
  const [, value, unit] = match;
  const v = parseInt(value);
  return unit === "h" ? v * 3600 : unit === "m" ? v * 60 : v;
}
