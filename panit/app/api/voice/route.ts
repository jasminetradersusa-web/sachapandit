/**
 * /api/voice
 *
 * Security architecture:
 * - POST: authenticated owner only; binds synthesis to an existing generation row (no “free” TTS).
 * - GET: signed redirect to private storage; public generations readable without login, private requires owner.
 * - Provider API keys stay server-side (`lib/elevenlabs.ts` is `server-only`).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveVoiceIdForStyle, synthesizeSpeech } from "@/lib/elevenlabs";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const postBodySchema = z.object({
  generationId: z.string().uuid(),
});

const voiceStyleSchema = z.enum([
  "warm_narrator",
  "calm_reflective",
  "soft_whisper",
  "clear_storyteller",
]);

function voiceIdFromGenerationMeta(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const raw = (meta as { suggestedVoiceStyle?: unknown }).suggestedVoiceStyle;
  const parsed = voiceStyleSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return resolveVoiceIdForStyle(parsed.data);
}

/** Synthesize voice for an existing generation (same credit was charged at narrative creation). */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { generationId } = parsed.data;

  const { data: gen, error: genErr } = await supabase
    .from("generations")
    .select("id, user_id, narrative, audio_storage_path, generation_meta")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr || !gen || gen.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!gen.narrative?.trim()) {
    return NextResponse.json({ error: "Nothing to speak" }, { status: 400 });
  }

  const env = getServerEnv();
  const objectPath = `${user.id}/${generationId}.mp3`;
  const resolvedVoice = voiceIdFromGenerationMeta(gen.generation_meta) ?? env.ELEVENLABS_VOICE_ID;

  try {
    const audio = await synthesizeSpeech(gen.narrative, resolvedVoice);
    const buf = Buffer.from(audio);
    const { error: upErr } = await supabase.storage.from("audio").upload(objectPath, buf, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (upErr) {
      console.error("storage upload", upErr);
      return NextResponse.json({ error: "Storage failed" }, { status: 500 });
    }

    const { error: patchErr } = await supabase
      .from("generations")
      .update({
        audio_storage_path: objectPath,
        voice_id: resolvedVoice ?? null,
      })
      .eq("id", generationId)
      .eq("user_id", user.id);

    if (patchErr) {
      console.error("generation audio path update", patchErr);
      return NextResponse.json({ error: "Could not save audio metadata" }, { status: 500 });
    }
  } catch (err) {
    console.error("voice pipeline", err);
    return NextResponse.json({ error: "Voice generation failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, generationId });
}

/** Issue a short-lived signed URL for the MP3 (public share or owner). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: gen, error } = await admin
    .from("generations")
    .select("user_id, is_public, audio_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !gen?.audio_storage_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!gen.is_public) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== gen.user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("audio")
    .createSignedUrl(gen.audio_storage_path, 900);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
