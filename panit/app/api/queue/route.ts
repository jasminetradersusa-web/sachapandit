/**
 * POST /api/queue — enqueue async generation (same auth + quota rules as /api/generate).
 * GET /api/queue?id=<uuid> — job status for the signed-in owner.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { releaseDailyGenerationSlot } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PromptValidationError, validatePromptBody } from "@/lib/openai";
import { computePromptHash } from "@/lib/prompt-hash";
import { enqueueOrGetPendingGenerationJob } from "@/lib/enqueue-generation-queue";

export const runtime = "nodejs";
export const maxDuration = 60;

const FP_HEADER = "x-sacred-voice-prompt-fp";
const SLOT_HEADER = "x-sacred-voice-daily-slot";
const SUB_HEADER = "x-sacred-voice-sub";

const querySchema = z.object({
  id: z.string().uuid(),
});

export async function POST(req: Request) {
  if (req.headers.get(SLOT_HEADER) !== "reserved") {
    return NextResponse.json(
      { error: "Request blocked: protection middleware did not run." },
      { status: 403 },
    );
  }

  const fingerprint = req.headers.get(FP_HEADER);
  if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    return NextResponse.json({ error: "Invalid protection token." }, { status: 403 });
  }

  const reservedSub = req.headers.get(SUB_HEADER);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    await releaseDailyGenerationSlot(reservedSub ?? "");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!reservedSub || user.id !== reservedSub) {
    await releaseDailyGenerationSlot(user.id);
    return NextResponse.json({ error: "Session mismatch." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    await releaseDailyGenerationSlot(user.id);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let prompt: string;
  try {
    prompt = validatePromptBody(body);
  } catch (e) {
    await releaseDailyGenerationSlot(user.id);
    if (e instanceof PromptValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  if ((body as { website?: string }).website) {
    await releaseDailyGenerationSlot(user.id);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const promptHash = computePromptHash(prompt);

  let enqueue: { jobId: string; created: boolean };
  try {
    enqueue = await enqueueOrGetPendingGenerationJob(supabase, {
      userId: user.id,
      prompt,
      promptHash,
      fingerprint,
    });
  } catch {
    await releaseDailyGenerationSlot(user.id);
    return NextResponse.json({ error: "Could not enqueue job" }, { status: 500 });
  }

  return NextResponse.json({
    status: "queued" as const,
    jobId: enqueue.jobId,
    deduplicated: !enqueue.created,
    promptHash,
    pollUrl: `/api/queue?id=${encodeURIComponent(enqueue.jobId)}`,
  });
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  const parsed = querySchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("generation_queue")
    .select(
      "id, status, prompt_hash, generation_id, error, result, created_at, started_at, completed_at",
    )
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("generation_queue select", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
