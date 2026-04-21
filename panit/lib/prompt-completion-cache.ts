/**
 * Supabase-backed exact prompt → structured story cache (service role only).
 * Keys: sha256(normalizePromptForCache(prompt)) from lib/hash.ts.
 */

import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  structuredStorySchema,
  type StructuredStory,
} from "@/lib/structured-story";

export async function getCachedCompletionByHash(
  promptHash: string,
): Promise<StructuredStory | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("prompt_completion_cache")
    .select("response_text, tone, suggested_voice_style")
    .eq("prompt_hash", promptHash)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("prompt_completion_cache select", error);
    return null;
  }

  const candidate = {
    text: data.response_text,
    tone: data.tone,
    suggestedVoiceStyle: data.suggested_voice_style,
  };
  const parsed = structuredStorySchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn("prompt_completion_cache: invalid cached row, ignoring");
    return null;
  }
  return parsed.data;
}

export async function upsertPromptCompletion(args: {
  promptHash: string;
  promptNormalized: string;
  story: StructuredStory;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("prompt_completion_cache").upsert(
    {
      prompt_hash: args.promptHash,
      prompt: args.promptNormalized,
      response_text: args.story.text,
      tone: args.story.tone,
      suggested_voice_style: args.story.suggestedVoiceStyle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "prompt_hash" },
  );
  if (error) {
    console.error("prompt_completion_cache upsert", error);
  }
}
