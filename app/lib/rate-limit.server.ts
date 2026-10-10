import { createHmac } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db, lookupAttempts } from "~/db/index.server";

const WINDOW_MS = 15 * 60 * 1000;
const LOOKUP_MAX_FAILS = 8;
const LOGIN_MAX_FAILS = 10;

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET belum diset di .env");
}

function hash(value: string): string {
  return createHmac("sha256", secret!).update(value).digest("hex");
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip || "unknown";
}

async function isBlocked(keys: string[], max: number): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const counts = await Promise.all(
    keys.map(async (key) => {
      const [row] = await db
        .select({ total: count() })
        .from(lookupAttempts)
        .where(and(eq(lookupAttempts.key, key), gt(lookupAttempts.createdAt, since)));
      return row?.total ?? 0;
    })
  );
  return counts.some((n) => n >= max);
}

async function recordFailure(keys: string[]): Promise<void> {
  await db.insert(lookupAttempts).values(keys.map((key) => ({ key })));
  // Bersihkan catatan lama (> 1 hari)
  await db
    .delete(lookupAttempts)
    .where(lt(lookupAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
}

// --- Cek booking: per IP dan per kode booking ---

export function lookupKeys(request: Request, code: string): string[] {
  return [`ip:${hash(getClientIp(request))}`, `code:${hash(code)}`];
}

export function isLookupBlocked(keys: string[]): Promise<boolean> {
  return isBlocked(keys, LOOKUP_MAX_FAILS);
}

export function recordLookupFailure(keys: string[]): Promise<void> {
  return recordFailure(keys);
}

// --- Login admin: per IP dan per email ---

export function loginKeys(request: Request, email: string): string[] {
  return [
    `login-ip:${hash(getClientIp(request))}`,
    `login-email:${hash(email)}`,
  ];
}

export function isLoginBlocked(keys: string[]): Promise<boolean> {
  return isBlocked(keys, LOGIN_MAX_FAILS);
}

export function recordLoginFailure(keys: string[]): Promise<void> {
  return recordFailure(keys);
}