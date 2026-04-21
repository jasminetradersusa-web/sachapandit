/**
 * Supabase semantic story cache (exact hash + vector similarity). Service role only.
 */

import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  structuredStorySchema,
  type StructuredStory,
} from "@/lib/structured-story";

export type SemanticExactRow = {
  story: StructuredStory;
  audio_storage_path: string | null;
};

function parseStoryJson(raw: unknown): StructuredStory | null {
  const parsed = structuredStorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toVectorParam(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Exact prompt_hash hit (no OpenAI completion). */
export async function getSemanticStoryExact(promptHash: string): Promise<SemanticExactRow | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("semantic_story_cache")
    .select("story, audio_storage_path")
    .eq("prompt_hash", promptHash)
    .maybeSingle();

  if (error || !data?.story) return null;
  const story = parseStoryJson(data.story);
  if (!story) return null;
  return {
    story,
    audio_storage_path: data.audio_storage_path ?? null,
  };
}

/** Nearest neighbor under cosine distance threshold (one embedding call already done). */
export async function matchSemanticStorySimilar(
  embedding: number[],
  maxDistance: number,
): Promise<SemanticExactRow & { promptHash: string; distance: number } | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("match_semantic_story_cache", {
    query_embedding: toVectorParam(embedding),
    match_threshold: maxDistance,
    match_count: 1,
  });

  if (error || !data?.length) {
    if (error) console.error("match_semantic_story_cache", error);
    return null;
  }

  const row = data[0] as {
    prompt_hash: string;
    story: unknown;
    audio_storage_path: string | null;
    distance: number;
  };
  const story = parseStoryJson(row.story);
  if (!story) return null;
  return {
    promptHash: row.prompt_hash,
    story,
    audio_storage_path: row.audio_storage_path ?? null,
    distance: row.distance,
  };
}

/** Persist narrative + embedding for future exact / semantic hits. */
export async function upsertSemanticStoryCacheRow(args: {
  promptHash: string;
  embedding: number[];
  story: StructuredStory;
  audioStoragePath: string | null;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("upsert_semantic_story_cache", {
    p_prompt_hash: args.promptHash,
    p_embedding: toVectorParam(args.embedding),
    p_story: args.story,
    p_audio_storage_path: args.audioStoragePath,
  });
  if (error) {
    console.error("upsert_semantic_story_cache", error);
  }
}

export async function setGenerationPromptEmbedding(
  generationId: string,
  embedding: number[],
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("set_generation_prompt_embedding", {
    p_id: generationId,
    p_embedding: toVectorParam(embedding),
  });
  if (error) {
    console.error("set_generation_prompt_embedding", error);
  }
}
