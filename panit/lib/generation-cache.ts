/**
 * 24h cache for identical prompts → structured story (+ optional shared audio path).
 *
 * Security architecture:
 * - Keys are SHA-256 of normalized prompt text only (no PII in key).
 * - Values are opaque to clients; only Route Handlers read/write.
 * - Prefer Redis in production; in-memory is per-instance (MVP).
 */

import "server-only";

import { Redis } from "@upstash/redis/cloudflare";
import type { StructuredStory } from "@/lib/openai";
import { computePromptHash } from "@/lib/prompt-hash";

const TTL_SEC = 86_400;
const PREFIX = "sv:pipe:";

export type CachedPipeline = {
  story: StructuredStory;
  audioStoragePath?: string;
};

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

const memory = new Map<string, { value: CachedPipeline; exp: number }>();

export function pipelineCacheKey(normalizedPrompt: string): string {
  return computePromptHash(normalizedPrompt);
}

export async function getPipelineCache(keyHash: string): Promise<CachedPipeline | null> {
  const redis = getRedis();
  const k = `${PREFIX}${keyHash}`;
  if (redis) {
    const raw = await redis.get<string>(k);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedPipeline;
    } catch {
      return null;
    }
  }
  const cur = memory.get(k);
  if (!cur || Date.now() > cur.exp) {
    memory.delete(k);
    return null;
  }
  return cur.value;
}

export async function setPipelineCache(keyHash: string, value: CachedPipeline): Promise<void> {
  const redis = getRedis();
  const k = `${PREFIX}${keyHash}`;
  if (redis) {
    await redis.set(k, JSON.stringify(value), { ex: TTL_SEC });
    return;
  }
  memory.set(k, { value, exp: Date.now() + TTL_SEC * 1000 });
}

export async function setPipelineStoryOnly(keyHash: string, story: StructuredStory): Promise<void> {
  const existing = (await getPipelineCache(keyHash)) ?? { story };
  existing.story = story;
  await setPipelineCache(keyHash, existing);
}

export async function setPipelineAudioPath(keyHash: string, audioStoragePath: string): Promise<void> {
  const existing = await getPipelineCache(keyHash);
  if (!existing?.story) {
    throw new Error("Pipeline cache: cannot set audio without story");
  }
  await setPipelineCache(keyHash, { ...existing, audioStoragePath });
}
