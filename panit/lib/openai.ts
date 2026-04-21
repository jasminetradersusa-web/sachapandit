/**
 * Sacred Voice — OpenAI structured story generation
 *
 * Security architecture:
 * - Server-only; keys never in the browser.
 * - Prompt length capped (300 chars), control-char stripping, injection/abuse pattern blocks.
 * - JSON output is schema-validated; refusal paths return safe short copy inside schema.
 */

import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { normalizePromptForCache, promptCompletionCacheHash } from "@/lib/hash";
import {
  getCachedCompletionByHash,
  upsertPromptCompletion,
} from "@/lib/prompt-completion-cache";
import {
  normalizePromptForPipeline,
  promptPolicyViolationMessage,
} from "@/lib/prompt-policy";
import {
  structuredStorySchema,
  type StructuredStory,
} from "@/lib/structured-story";

export { structuredStorySchema, type StructuredStory } from "@/lib/structured-story";

const MAX_STORY_WORDS = 120;

const SYSTEM = `You are a creative writing assistant for "Sacred Voice", a voice-based AI storytelling and reflection app.

OUTPUT: Valid JSON only, with keys exactly: "text", "tone", "suggestedVoiceStyle".

Rules:
- "text": Original short fiction or reflective prose ONLY. Max ${MAX_STORY_WORDS} words.
- Start "text" with the literal line: This is AI-generated creative content—not advice or prophecy.
- Then continue in an emotional, literary tone (second or third person).
- "tone": one short label, e.g. "gentle", "melancholic", "hopeful", "grounded".
- "suggestedVoiceStyle": one of: "warm_narrator", "calm_reflective", "soft_whisper", "clear_storyteller"
- You are NOT a psychic, therapist, medical advisor, religious authority, or predictor of the future.
- No JSON outside this object. No markdown fences.
- If the user prompt is abusive, hateful, sexual content involving minors, or clearly illegal: set "text" to a brief refusal framed as one sentence of story plus the required disclaimer line, use tone "neutral", suggestedVoiceStyle "clear_storyteller".`;

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function refineStoryWords(data: StructuredStory): StructuredStory {
  if (wordCount(data.text) > MAX_STORY_WORDS) {
    throw new Error("Story exceeds word limit");
  }
  return data;
}

const promptSchema = z
  .string()
  .transform((s) => normalizePromptForPipeline(s))
  .superRefine((s, ctx) => {
    const msg = promptPolicyViolationMessage(s);
    if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  });

export class PromptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptValidationError";
  }
}

/** Server-side JSON body validation for /api/generate */
export function validatePromptBody(body: unknown): string {
  const obj = z.object({ prompt: promptSchema }).safeParse(body);
  if (!obj.success) {
    const msg = obj.error.flatten().fieldErrors.prompt?.[0] ?? "Invalid body";
    throw new PromptValidationError(msg);
  }
  return obj.data.prompt;
}

function parseStructuredJson(raw: string): StructuredStory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON from model");
  }
  const obj = structuredStorySchema.safeParse(parsed);
  if (!obj.success) {
    throw new Error("Structured output validation failed");
  }
  return refineStoryWords(obj.data);
}

export type StructuredStorySource = "prompt_cache" | "openai";

/**
 * Generate structured story; checks Supabase prompt cache (trim + lowercase hash) before OpenAI.
 */
export async function generateStructuredStoryWithSource(
  userPrompt: string,
): Promise<{ story: StructuredStory; source: StructuredStorySource }> {
  const promptNormalized = normalizePromptForCache(userPrompt);
  const promptHash = promptCompletionCacheHash(userPrompt);

  const cached = await getCachedCompletionByHash(promptHash);
  if (cached) {
    return { story: refineStoryWords(cached), source: "prompt_cache" };
  }

  const env = getServerEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.75,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Story seed / reflection prompt:\n${userPrompt}\n\nRespond with JSON only.`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty model response");
  const story = parseStructuredJson(raw);

  await upsertPromptCompletion({
    promptHash,
    promptNormalized,
    story,
  });

  return { story, source: "openai" };
}

/** Generate emotional short story as validated structured JSON (max 120 words in text). */
export async function generateStructuredStory(userPrompt: string): Promise<StructuredStory> {
  const { story } = await generateStructuredStoryWithSource(userPrompt);
  return story;
}

/** @deprecated use generateStructuredStory */
export async function generateNarrative(userPrompt: string): Promise<string> {
  const s = await generateStructuredStory(userPrompt);
  return s.text;
}
