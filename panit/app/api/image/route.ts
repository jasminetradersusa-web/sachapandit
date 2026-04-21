/**
 * POST /api/image
 *
 * Ollama symbolic image → Supabase Storage; returns base64 for immediate UI.
 * Consumes one credit when generating; serves cached bytes without charging.
 */

import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOllamaConfig, getServerEnv } from "@/lib/env";
import { OllamaUnavailableError, ollamaGenerateImageBase64 } from "@/lib/ollama";
import { PromptValidationError, validatePromptBody } from "@/lib/openai";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { buildShortVisualPrompt } from "@/lib/visual-prompt";

export const runtime = "nodejs";
export const maxDuration = 180;

const bodySchema = z.object({
  prompt: z.string().optional(),
  generationId: z.string().uuid(),
  website: z.string().optional(),
});

async function respondCachedImage(admin: ReturnType<typeof createAdminSupabaseClient>, path: string) {
  const { data: file, error: dlErr } = await admin.storage.from("images").download(path.trim());
  if (dlErr || !file) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return NextResponse.json({
    cached: true,
    imageBase64: buf.toString("base64"),
    mimeType: mime,
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { generationId } = parsed.data;

  const { data: genRow, error: genErr } = await supabase
    .from("generations")
    .select("id, prompt, image_storage_path")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (genErr || !genRow?.prompt) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();

  if (genRow.image_storage_path?.trim()) {
    const cached = await respondCachedImage(admin, genRow.image_storage_path);
    if (cached) return cached;
  }

  let seedPrompt: string;
  if (typeof parsed.data.prompt === "string" && parsed.data.prompt.trim().length > 0) {
    try {
      seedPrompt = validatePromptBody({ prompt: parsed.data.prompt });
    } catch (e) {
      if (e instanceof PromptValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  } else {
    seedPrompt = validatePromptBody({ prompt: genRow.prompt });
  }

  const { data: consumed, error: consumeErr } = await supabase.rpc("consume_generation_credit");
  if (consumeErr) {
    console.error("consume_generation_credit", consumeErr);
    return NextResponse.json({ error: "Could not use credit" }, { status: 500 });
  }
  if (!consumed) {
    return NextResponse.json(
      { error: "No credits left. Top up or wait for your daily refresh (UTC)." },
      { status: 402 },
    );
  }

  const env = getServerEnv();
  const ollama = getOllamaConfig(env);
  const imagePrompt = buildShortVisualPrompt(seedPrompt);

  let base64: string;
  let mime: string;
  try {
    const out = await ollamaGenerateImageBase64(ollama.baseUrl, ollama.imageModel, imagePrompt);
    base64 = out.base64;
    mime = out.mime;
  } catch (e) {
    console.error("ollama image", e);
    await supabase.rpc("refund_generation_credit");
    if (e instanceof OllamaUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message.slice(0, 280)
            : "Image generation failed. Set OLLAMA_IMAGE_MODEL to an image model (e.g. stablediffusion).",
      },
      { status: 502 },
    );
  }

  const ext = mime.includes("jpeg") ? "jpg" : "png";
  const storagePath = `${user.id}/${generationId}.${ext}`;
  const buf = Buffer.from(base64, "base64");

  const { error: upErr } = await admin.storage.from("images").upload(storagePath, buf, {
    contentType: mime,
    upsert: true,
  });

  if (upErr) {
    console.error("storage upload", upErr);
    await supabase.rpc("refund_generation_credit");
    return NextResponse.json({ error: "Could not store image" }, { status: 500 });
  }

  const { error: patchErr } = await supabase
    .from("generations")
    .update({ image_storage_path: storagePath })
    .eq("id", generationId)
    .eq("user_id", user.id);

  if (patchErr) {
    console.error("generation patch", patchErr);
    await supabase.rpc("refund_generation_credit");
    await admin.storage.from("images").remove([storagePath]);
    return NextResponse.json({ error: "Could not link image" }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).single();

  return NextResponse.json({
    cached: false,
    imageBase64: base64,
    mimeType: mime,
    creditsRemaining: profile?.credits ?? null,
  });
}
