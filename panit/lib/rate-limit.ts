/**
 * Sacred Voice — API protection (rate limits, burst detection, prompt spam)
 *
 * Security architecture:
 * - Edge-safe: no Node `crypto`; use Web Crypto via `sha256Hex` for prompt fingerprints.
 * - IP limits + burst detection curb bots; user limits bind abuse to authenticated accounts.
 * - Prefer Upstash (`UPSTASH_*`) in production; in-memory stores are per-instance (MVP / single node).
 * - Do not import `getServerEnv()` here — middleware runs on Edge.
 */

import { Ratelimit } from "@upstash/ratelimit";
/** Edge/Vercel middleware: use REST client without Node-only APIs (`@upstash/redis` default resolves to `nodejs`). */
import { Redis } from "@upstash/redis/cloudflare";
import { normalizePromptForPipeline } from "@/lib/prompt-policy";

// ---------------------------------------------------------------------------
// Constants (free tier / API shield)
// ---------------------------------------------------------------------------

/** Max API requests per IP per rolling minute (all /api/* except excluded webhooks). */
export const API_IP_LIMIT_PER_MINUTE = 10;

/** GET /share/* pages per IP per minute (abuse-resistant; OG crawlers share this budget). */
export const SHARE_PAGE_IP_LIMIT_PER_MINUTE = 90;

/** POST /api/share/view per IP per minute. */
export const SHARE_VIEW_POST_IP_LIMIT_PER_MINUTE = 40;

/** Provider webhooks per IP per minute (signature verification still required). */
export const WEBHOOK_POST_IP_LIMIT_PER_MINUTE = 60;

/** Max narrative generations per Supabase user per UTC calendar day (free tier). */
export const FREE_TIER_GENERATIONS_PER_DAY = 20;

/** Identical prompt resubmits blocked for this TTL after a successful generation. */
export const PROMPT_FINGERPRINT_TTL_SEC = 86_400;

/** Rapid-fire: more than this many API hits from one IP in the burst window ⇒ bot pattern. */
export const RAPID_FIRE_MAX_HITS = 5;
export const RAPID_FIRE_WINDOW_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export type DailyQuotaResult = {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
};

// ---------------------------------------------------------------------------
// Redis (optional)
// ---------------------------------------------------------------------------

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) return redisSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisSingleton = null;
    return null;
  }
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

const ipApiRatelimit = (() => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(API_IP_LIMIT_PER_MINUTE, "1 m"),
    analytics: true,
    prefix: "sv:api:ip",
  });
})();

const sharePageRatelimit = (() => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(SHARE_PAGE_IP_LIMIT_PER_MINUTE, "1 m"),
    analytics: true,
    prefix: "sv:share:page:ip",
  });
})();

const shareViewPostRatelimit = (() => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(SHARE_VIEW_POST_IP_LIMIT_PER_MINUTE, "1 m"),
    analytics: true,
    prefix: "sv:share:view:ip",
  });
})();

const webhookPostRatelimit = (() => {
  const r = getRedis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(WEBHOOK_POST_IP_LIMIT_PER_MINUTE, "1 m"),
    analytics: true,
    prefix: "sv:webhook:ip",
  });
})();

// ---------------------------------------------------------------------------
// In-memory fallbacks (MVP / dev / single instance)
// ---------------------------------------------------------------------------

const memoryFixedWindow = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();
  const cur = memoryFixedWindow.get(key);
  if (!cur || now > cur.resetAt) {
    memoryFixedWindow.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, limit: max, remaining: max - 1, reset: now + windowMs };
  }
  if (cur.count >= max) {
    return { success: false, limit: max, remaining: 0, reset: cur.resetAt };
  }
  cur.count += 1;
  return { success: true, limit: max, remaining: max - cur.count, reset: cur.resetAt };
}

/** Per-IP API throttle: 10 requests / minute */
export async function limitApiRequestsByIp(ip: string): Promise<LimitResult> {
  if (ipApiRatelimit) return ipApiRatelimit.limit(ip);
  return memoryLimit(`api:ip:${ip}`, API_IP_LIMIT_PER_MINUTE, 60_000);
}

/** Per-IP throttle for HTML share pages. */
export async function limitSharePageByIp(ip: string): Promise<LimitResult> {
  if (sharePageRatelimit) return sharePageRatelimit.limit(ip);
  return memoryLimit(`share:page:ip:${ip}`, SHARE_PAGE_IP_LIMIT_PER_MINUTE, 60_000);
}

/** Per-IP throttle for share view increments. */
export async function limitShareViewPostByIp(ip: string): Promise<LimitResult> {
  if (shareViewPostRatelimit) return shareViewPostRatelimit.limit(ip);
  return memoryLimit(`share:view:ip:${ip}`, SHARE_VIEW_POST_IP_LIMIT_PER_MINUTE, 60_000);
}

/** Throttle webhook endpoints (DoS / brute-force against HMAC). */
export async function limitWebhookPostByIp(ip: string): Promise<LimitResult> {
  if (webhookPostRatelimit) return webhookPostRatelimit.limit(ip);
  return memoryLimit(`webhook:ip:${ip}`, WEBHOOK_POST_IP_LIMIT_PER_MINUTE, 60_000);
}

// --- Rapid fire (burst) ---

const burstHits = new Map<string, number[]>();

export type RapidFireResult = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Detect scripted “machine gun” traffic: many requests within a short window
 * even if each minute’s quota is not yet exhausted.
 */
export function checkRapidFire(ip: string): RapidFireResult {
  const now = Date.now();
  const windowStart = now - RAPID_FIRE_WINDOW_MS;
  const prev = burstHits.get(ip) ?? [];
  const recent = prev.filter((t) => t > windowStart);
  recent.push(now);
  burstHits.set(ip, recent);
  if (recent.length > RAPID_FIRE_MAX_HITS) {
    return { ok: false, retryAfterMs: RAPID_FIRE_WINDOW_MS };
  }
  return { ok: true };
}

// --- Daily generation quota (UTC day) ---

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnightMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) + 86_400_000;
}

const memoryDailyGen = new Map<string, { count: number; resetAt: number }>();

function dailyKey(userId: string): string {
  return `genday:${userId}:${utcDateKey()}`;
}

/** Current count for today (does not increment). */
export async function getUserDailyGenerationCount(userId: string): Promise<DailyQuotaResult> {
  const key = dailyKey(userId);
  const redis = getRedis();
  const resetAt = utcMidnightMs(utcDateKey());

  if (redis) {
    const n = await redis.get<number>(key);
    const count = typeof n === "number" ? n : Number(n ?? 0);
    return {
      allowed: count < FREE_TIER_GENERATIONS_PER_DAY,
      count,
      limit: FREE_TIER_GENERATIONS_PER_DAY,
      resetAt,
    };
  }

  const cur = memoryDailyGen.get(key);
  const count = cur && Date.now() < cur.resetAt ? cur.count : 0;
  return {
    allowed: count < FREE_TIER_GENERATIONS_PER_DAY,
    count,
    limit: FREE_TIER_GENERATIONS_PER_DAY,
    resetAt,
  };
}

/**
 * Reserve one free-tier generation slot (call from middleware after auth).
 * Returns false if the daily cap is reached. Pair with `releaseDailyGenerationSlot` on route failure.
 */
export async function tryConsumeDailyGenerationSlot(userId: string): Promise<boolean> {
  const key = dailyKey(userId);
  const redis = getRedis();
  const ttlSec = Math.max(60, Math.ceil((utcMidnightMs(utcDateKey()) - Date.now()) / 1000));

  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ttlSec);
    if (n > FREE_TIER_GENERATIONS_PER_DAY) {
      await redis.decr(key);
      return false;
    }
    return true;
  }

  const now = Date.now();
  const resetAt = utcMidnightMs(utcDateKey());
  let cur = memoryDailyGen.get(key);
  if (!cur || now >= cur.resetAt) {
    cur = { count: 0, resetAt };
    memoryDailyGen.set(key, cur);
  }
  if (cur.count >= FREE_TIER_GENERATIONS_PER_DAY) return false;
  cur.count += 1;
  return true;
}

/** Roll back a slot when `/api/generate` fails after middleware reserved quota. */
export async function releaseDailyGenerationSlot(userId: string): Promise<void> {
  if (!userId) return;
  const key = dailyKey(userId);
  const redis = getRedis();
  if (redis) {
    const n = await redis.decr(key);
    if (n < 0) await redis.set(key, 0);
    return;
  }
  const cur = memoryDailyGen.get(key);
  if (cur && cur.count > 0) cur.count -= 1;
}

// --- Prompt fingerprint (block repeat spam) ---

const memoryPromptFp = new Map<string, number>();

export function promptFingerprintCacheKey(userId: string, fingerprintHex: string): string {
  return `sv:promptfp:${userId}:${fingerprintHex}`;
}

/** Normalize so trivial spacing/case changes don’t evade duplicate detection. */
export function normalizePromptForFingerprint(raw: string): string {
  return normalizePromptForPipeline(raw);
}

/** SHA-256 hex (Edge-safe). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True if this user already generated this prompt fingerprint recently (success path sets the key). */
export async function hasPromptFingerprint(userId: string, fingerprintHex: string): Promise<boolean> {
  const cacheKey = promptFingerprintCacheKey(userId, fingerprintHex);
  const redis = getRedis();
  if (redis) {
    const v = await redis.get(cacheKey);
    return v !== null && v !== undefined;
  }
  const exp = memoryPromptFp.get(cacheKey);
  return typeof exp === "number" && Date.now() < exp;
}

/** Call after a successful generation row is committed. */
export async function rememberPromptFingerprint(userId: string, fingerprintHex: string): Promise<void> {
  const cacheKey = promptFingerprintCacheKey(userId, fingerprintHex);
  const redis = getRedis();
  if (redis) {
    await redis.set(cacheKey, "1", { ex: PROMPT_FINGERPRINT_TTL_SEC });
    return;
  }
  memoryPromptFp.set(cacheKey, Date.now() + PROMPT_FINGERPRINT_TTL_SEC * 1000);
}

// ---------------------------------------------------------------------------
// Legacy helpers (other routes may still import)
// ---------------------------------------------------------------------------

/** Prefer `limitApiRequestsByIp` for middleware. */
export async function limitByIp(ip: string): Promise<LimitResult> {
  return limitApiRequestsByIp(ip);
}

/**
 * @deprecated Per-minute user limit removed in favor of daily free-tier cap enforced in middleware.
 * Kept as alias to IP limit to avoid accidental high-volume user_id keys hitting Redis.
 */
export async function limitByUser(_userId: string): Promise<LimitResult> {
  return { success: true, limit: FREE_TIER_GENERATIONS_PER_DAY, remaining: FREE_TIER_GENERATIONS_PER_DAY, reset: Date.now() + 60_000 };
}

/**
 * Client IP for rate limiting. Prefer platform-set headers (harder to spoof than raw
 * X-Forwarded-For on misconfigured proxies). Set `RATE_LIMIT_TRUST_PROXY_COUNT` when behind
 * trusted reverse proxies: use the Nth IP from the **right** of X-Forwarded-For (1 = last hop).
 */
export function getClientIp(req: Request | { headers: Headers }): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const vercelFf = h.get("x-vercel-forwarded-for");
  if (vercelFf?.trim()) return vercelFf.split(",")[0]!.trim();
  const fly = h.get("fly-client-ip");
  if (fly?.trim()) return fly.trim();
  const xf = h.get("x-forwarded-for");
  if (xf) {
    const parts = xf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const trust = Number(process.env.RATE_LIMIT_TRUST_PROXY_COUNT ?? "0");
    if (trust > 0 && parts.length > 0) {
      const idx = Math.max(0, parts.length - trust);
      return parts[idx] ?? "unknown";
    }
    return parts[0] ?? "unknown";
  }
  const real = h.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "unknown";
}
