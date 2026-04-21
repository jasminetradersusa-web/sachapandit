/**
 * POST /api/generate
 *
 * Ollama text generation with per-user prompt_hash cache.
 * Credits: public.profiles.credits — checked and decremented via Supabase RPC
 * `consume_generation_credit()` (daily UTC refill to 3 for `plan = free`; supporters spend balance only).
 * Cached prompts do not consume a credit. Failures after deduct call `refund_generation_credit()`.
 */

import { NextResponse } from "next/server";
import { getOllamaConfig, getServerEnv } from "@/lib/env";
import { insertSharePublicId } from "@/lib/generation-share";
import { computePromptHash } from "@/lib/prompt-hash";
import { OllamaUnavailableError, ollamaGenerateText } from "@/lib/ollama";
import { PromptValidationError, validatePromptBody } from "@/lib/openai";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let prompt: string;
  try {
    prompt = validatePromptBody(body);
  } catch (e) {
    if (e instanceof PromptValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  if ((body as { website?: string }).website) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const promptHash = computePromptHash(prompt);

  const { data: cachedRow } = await supabase
    .from("generations")
    .select("id, narrative, image_storage_path")
    .eq("user_id", user.id)
    .eq("prompt_hash", promptHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedRow?.narrative?.trim()) {
    const admin = createAdminSupabaseClient();
    const { data: share } = await admin
      .from("shares")
      .select("public_id")
      .eq("generation_id", cachedRow.id)
      .maybeSingle();

    const shareId = share?.public_id ?? null;
    const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).maybeSingle();
    return NextResponse.json({
      cached: true,
      text: cachedRow.narrative.trim(),
      generationId: cachedRow.id,
      shareId,
      sharePath: shareId ? `/share/${shareId}` : null,
      hasImage: Boolean(cachedRow.image_storage_path?.trim()),
      creditsRemaining: profile?.credits ?? null,
    });
  }

  const { data: consumed, error: consumeErr } = await supabase.rpc("consume_generation_credit");
  if (consumeErr) {
    console.error("consume_generation_credit", consumeErr);
    return NextResponse.json({ error: "Could not use credit" }, { status: 500 });
  }
  if (!consumed) {
    return NextResponse.json(
      {
        error:
          "No credits available. Free accounts get 3 credits per UTC day (refreshes at midnight UTC). Purchase credits to continue anytime.",
      },
      { status: 402 },
    );
  }

  const env = getServerEnv();
  const ollama = getOllamaConfig(env);

  let narrative: string;
  try {
    narrative = await ollamaGenerateText(ollama.baseUrl, ollama.textModel, prompt);
  } catch (e) {
    console.error("ollama text", e);
    await supabase.rpc("refund_generation_credit");
    if (e instanceof OllamaUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "AI service unavailable. Try again shortly." },
      { status: 502 },
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("generations")
    .insert({
      user_id: user.id,
      prompt,
      narrative,
      disclaimer_ack: true,
      is_public: true,
      prompt_hash: promptHash,
      generation_meta: { source: "ollama", model: ollama.textModel },
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("generations insert", insErr);
    await supabase.rpc("refund_generation_credit");
    return NextResponse.json({ error: "Could not save generation" }, { status: 500 });
  }

  const admin = createAdminSupabaseClient();
  const shareId = await insertSharePublicId(admin, inserted.id);
  if (!shareId) {
    await supabase.rpc("refund_generation_credit");
    await admin.from("generations").delete().eq("id", inserted.id);
    return NextResponse.json({ error: "Could not create share link" }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).single();

  return NextResponse.json({
    cached: false,
    text: narrative,
    generationId: inserted.id,
    shareId,
    sharePath: `/share/${shareId}`,
    hasImage: false,
    creditsRemaining: profile?.credits ?? null,
  });
}
