/**
 * Shared narrative + voice + persistence pipeline for /api/generate and queue worker.
 * Cost controls: Redis → Supabase exact hash → semantic similarity → OpenAI (last resort).
 */

import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSignedAudioUrl, copyAudioMp3, uploadAudioMp3 } from "@/lib/storage-audio";
import {
  getPipelineCache,
  pipelineCacheKey,
  setPipelineAudioPath,
  setPipelineStoryOnly,
} from "@/lib/generation-cache";
import { resolveVoiceIdForStyle, synthesizeSpeech } from "@/lib/elevenlabs";
import { embedPromptForSemanticCache } from "@/lib/openai-embeddings";
import { generateStructuredStoryWithSource } from "@/lib/openai";
import { getServerEnv } from "@/lib/env";
import {
  getSemanticStoryExact,
  matchSemanticStorySimilar,
  setGenerationPromptEmbedding,
  upsertSemanticStoryCacheRow,
} from "@/lib/semantic-story-cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database";
import type { StructuredStory } from "@/lib/openai";

export type GenerationSuccess = {
  text: string;
  audioUrl: string;
  shareId: string;
  id: string;
  tone: string;
  suggestedVoiceStyle: string;
  cachedStory: boolean;
  cachedAudio: boolean;
  cacheSource:
    | "redis"
    | "semantic_exact"
    | "semantic_similar"
    | "prompt_completion"
    | "openai";
};

export type GenerationPipelineResult =
  | { ok: true; data: GenerationSuccess }
  | { ok: false; status: number; error: string };

export type GenerationPipelineMode = "sync" | "worker";

async function consumeOneCredit(
  mode: GenerationPipelineMode,
  userId: string,
  userSupabase: SupabaseClient<Database> | null,
): Promise<boolean> {
  if (mode === "sync") {
    if (!userSupabase) return false;
    const { data, error } = await userSupabase.rpc("consume_one_credit");
    if (error) {
      console.error("consume_one_credit", error);
      return false;
    }
    return Boolean(data);
  }
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("consume_one_credit_for_user", {
    target_user: userId,
  });
  if (error) {
    console.error("consume_one_credit_for_user", error);
    return false;
  }
  return Boolean(data);
}

export type RunGenerationPipelineArgs = {
  userId: string;
  /** Already validated (validatePromptBody / policy-normalized). */
  prompt: string;
  releaseDailySlot: (uid: string) => Promise<void>;
  mode: GenerationPipelineMode;
};

export async function runGenerationPipeline(
  args: RunGenerationPipelineArgs,
): Promise<GenerationPipelineResult> {
  const { userId, prompt, releaseDailySlot, mode } = args;

  let userSupabase: SupabaseClient<Database> | null = null;
  if (mode === "sync") {
    userSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();
    if (!user || user.id !== userId) {
      await releaseDailySlot(userId);
      return { ok: false, status: 401, error: "Unauthorized" };
    }
  }

  const env = getServerEnv();
  const semanticThreshold = env.SEMANTIC_MATCH_MAX_DISTANCE ?? 0.22;

  const cacheKeyHash = pipelineCacheKey(prompt);
  let story: StructuredStory | undefined;
  let cachedStory = false;
  let cachedAudio = false;
  let cacheSource: GenerationSuccess["cacheSource"] = "openai";
  let embeddingForRow: number[] | null = null;
  let sharedAudioPath: string | undefined;

  const pipe = await getPipelineCache(cacheKeyHash);
  if (pipe?.story) {
    story = pipe.story;
    cachedStory = true;
    cachedAudio = Boolean(pipe.audioStoragePath);
    cacheSource = "redis";
    sharedAudioPath = pipe.audioStoragePath;
  }

  if (!story) {
    const exact = await getSemanticStoryExact(cacheKeyHash);
    if (exact) {
      story = exact.story;
      cachedStory = true;
      cachedAudio = Boolean(exact.audio_storage_path);
      cacheSource = "semantic_exact";
      sharedAudioPath = exact.audio_storage_path ?? undefined;
    }
  }

  if (!story) {
    try {
      embeddingForRow = await embedPromptForSemanticCache(prompt);
      const similar = await matchSemanticStorySimilar(embeddingForRow, semanticThreshold);
      if (similar) {
        story = similar.story;
        cachedStory = true;
        cachedAudio = Boolean(similar.audio_storage_path);
        cacheSource = "semantic_similar";
        sharedAudioPath = similar.audio_storage_path ?? undefined;
      }
    } catch (err) {
      console.error("semantic embedding / match", err);
      embeddingForRow = null;
    }
  }

  if (!story) {
    try {
      const { story: generated, source } = await generateStructuredStoryWithSource(prompt);
      story = generated;
      await setPipelineStoryOnly(cacheKeyHash, story);
      cachedStory = source === "prompt_cache";
      cachedAudio = false;
      cacheSource = source === "prompt_cache" ? "prompt_completion" : "openai";
      if (source !== "prompt_cache" && !embeddingForRow) {
        try {
          embeddingForRow = await embedPromptForSemanticCache(prompt);
        } catch (err) {
          console.error("post-openai embed", err);
          embeddingForRow = null;
        }
      }
    } catch (err) {
      console.error("OpenAI error", err);
      await releaseDailySlot(userId);
      return { ok: false, status: 502, error: "Story generation failed" };
    }
  }

  const voiceId = resolveVoiceIdForStyle(story.suggestedVoiceStyle);

  const consumed = await consumeOneCredit(mode, userId, userSupabase);
  if (!consumed) {
    await releaseDailySlot(userId);
    return {
      ok: false,
      status: 402,
      error: "Insufficient credits. Purchase more to continue.",
    };
  }

  const insertClient = mode === "sync" ? userSupabase! : createAdminSupabaseClient();
  const { data: row, error: insertError } = await insertClient
    .from("generations")
    .insert({
      user_id: userId,
      prompt,
      narrative: story.text,
      disclaimer_ack: true,
      is_public: true,
      voice_id: voiceId,
      prompt_hash: cacheKeyHash,
      generation_meta: {
        tone: story.tone,
        suggestedVoiceStyle: story.suggestedVoiceStyle,
      },
    })
    .select("id")
    .single();

  if (insertError || !row?.id) {
    console.error("insert generation", insertError);
    await releaseDailySlot(userId);
    return { ok: false, status: 500, error: "Could not save generation" };
  }

  let sharePublicId: string | null = null;
  const admin = createAdminSupabaseClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = randomBytes(6).toString("hex");
    const { error: shareErr } = await admin.from("shares").insert({
      generation_id: row.id,
      public_id: publicId,
    });
    if (!shareErr) {
      sharePublicId = publicId;
      break;
    }
    if (shareErr.code !== "23505") {
      console.error("insert shares", shareErr);
      await releaseDailySlot(userId);
      return { ok: false, status: 500, error: "Could not create share link" };
    }
  }

  if (!sharePublicId) {
    console.error("insert shares: exhausted unique retries");
    await releaseDailySlot(userId);
    return { ok: false, status: 500, error: "Could not create share link" };
  }

  const userAudioPath = `${userId}/${row.id}.mp3`;
  const cachePath = `cache/${cacheKeyHash}.mp3`;

  try {
    const refreshed = await getPipelineCache(cacheKeyHash);
    const pipeAudio = refreshed?.audioStoragePath ?? sharedAudioPath;

    if (pipeAudio) {
      await copyAudioMp3(pipeAudio, userAudioPath);
      if (!refreshed?.audioStoragePath && sharedAudioPath) {
        await setPipelineAudioPath(cacheKeyHash, sharedAudioPath);
      }
    } else {
      const audio = await synthesizeSpeech(story.text, voiceId);
      const buf = Buffer.from(audio);
      await uploadAudioMp3(cachePath, buf);
      await setPipelineAudioPath(cacheKeyHash, cachePath);
      await uploadAudioMp3(userAudioPath, buf);
    }

    const patchClient = mode === "sync" ? userSupabase! : admin;
    const { error: patchErr } = await patchClient
      .from("generations")
      .update({ audio_storage_path: userAudioPath })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (patchErr) {
      console.error("patch audio path", patchErr);
      throw new Error("Could not persist audio path");
    }
  } catch (err) {
    console.error("voice/storage pipeline", err);
    await releaseDailySlot(userId);
    return { ok: false, status: 502, error: "Voice or storage failed" };
  }

  let signedAudioUrl: string;
  try {
    signedAudioUrl = await createSignedAudioUrl(userAudioPath);
  } catch (e) {
    console.error("sign url", e);
    await releaseDailySlot(userId);
    return { ok: false, status: 500, error: "Could not create audio link" };
  }

  if (embeddingForRow) {
    await setGenerationPromptEmbedding(row.id, embeddingForRow);
  }

  if (cacheSource === "openai" && embeddingForRow) {
    const finalPipe = await getPipelineCache(cacheKeyHash);
    await upsertSemanticStoryCacheRow({
      promptHash: cacheKeyHash,
      embedding: embeddingForRow,
      story,
      audioStoragePath: finalPipe?.audioStoragePath ?? null,
    });
  }

  return {
    ok: true,
    data: {
      text: story.text,
      audioUrl: signedAudioUrl,
      shareId: sharePublicId,
      id: row.id,
      tone: story.tone,
      suggestedVoiceStyle: story.suggestedVoiceStyle,
      cachedStory,
      cachedAudio,
      cacheSource,
    },
  };
}
