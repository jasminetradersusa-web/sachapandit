/**
 * Stable SHA-256 of normalized prompt text (server-side).
 * Must match middleware fingerprint input (normalizePromptForPipeline + UTF-8 hash).
 */

import "server-only";

import { sha256Hex } from "@/lib/hash";
import { normalizePromptForPipeline } from "@/lib/prompt-policy";

export function normalizePromptForCaching(raw: string): string {
  return normalizePromptForPipeline(raw);
}

/** SHA-256 of pipeline-normalized prompt (middleware + Redis + generations.prompt_hash). */
export function computePromptHash(normalizedPrompt: string): string {
  return sha256Hex(normalizedPrompt);
}
