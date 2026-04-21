/**
 * Cryptographic hashing helpers (Node). Used for prompt cache keys and shared SHA-256 hex.
 */

import "server-only";

import { createHash } from "node:crypto";

/** Lowercase + trim — cache key normalization (distinct from pipeline policy normalization). */
export function normalizePromptForCache(prompt: string): string {
  return prompt.trim().toLowerCase();
}

/** UTF-8 SHA-256 as lowercase hex (64 chars). */
export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Stable key for `prompt_completion_cache` lookups. */
export function promptCompletionCacheHash(prompt: string): string {
  return sha256Hex(normalizePromptForCache(prompt));
}
