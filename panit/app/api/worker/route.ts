/**
 * POST /api/worker
 *
 * Claims up to N pending `generation_queue` rows (SKIP LOCKED), runs full generation pipeline
 * (caches, OpenAI, credits, generations, voice, share), marks jobs completed or failed.
 *
 * Auth: Bearer WORKER_SECRET. Scale horizontally: multiple workers safe; no duplicate processing
 * for the same row thanks to claim_generation_queue_batch.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getServerEnv } from "@/lib/env";
import type { Json } from "@/types/database";
import { releaseDailyGenerationSlot, rememberPromptFingerprint } from "@/lib/rate-limit";
import { runGenerationPipeline } from "@/lib/generation-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH = 10;

const bodySchema = z.object({
  batchSize: z.coerce.number().int().min(1).max(25).optional(),
});

type QueueJobRow = {
  id: string;
  user_id: string;
  prompt: string;
  fingerprint: string;
};

export async function POST(req: Request) {
  const env = getServerEnv();
  if (!env.WORKER_SECRET) {
    return NextResponse.json({ error: "Worker not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token || token !== env.WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const batchSize = parsed.data.batchSize ?? DEFAULT_BATCH;
  const admin = createAdminSupabaseClient();

  const { data: jobs, error: claimError } = await admin.rpc("claim_generation_queue_batch", {
    batch_size: batchSize,
  });

  if (claimError) {
    console.error("claim_generation_queue_batch", claimError);
    return NextResponse.json({ error: "Could not claim jobs" }, { status: 500 });
  }

  const list = (Array.isArray(jobs) ? jobs : []) as QueueJobRow[];

  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];

  for (const job of list) {
    try {
      const outcome = await runGenerationPipeline({
        userId: job.user_id,
        prompt: job.prompt,
        releaseDailySlot: releaseDailyGenerationSlot,
        mode: "worker",
      });

      if (!outcome.ok) {
        await releaseDailyGenerationSlot(job.user_id);
        await admin
          .from("generation_queue")
          .update({
            status: "failed",
            error: outcome.error,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "processing");
        results.push({ jobId: job.id, ok: false, error: outcome.error });
        continue;
      }

      const { data: finalized, error: finErr } = await admin
        .from("generation_queue")
        .update({
          status: "completed",
          generation_id: outcome.data.id,
          result: outcome.data as unknown as Json,
          error: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .select("id");

      if (finErr) {
        console.error("generation_queue finalize", job.id, finErr);
        results.push({ jobId: job.id, ok: false, error: "Could not mark job completed" });
        continue;
      }

      if (finalized?.length) {
        await rememberPromptFingerprint(job.user_id, job.fingerprint);
      }

      results.push({ jobId: job.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Worker error";
      console.error("worker job", job.id, err);
      await releaseDailyGenerationSlot(job.user_id);
      await admin
        .from("generation_queue")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing");
      results.push({ jobId: job.id, ok: false, error: message });
    }
  }

  return NextResponse.json({
    processed: list.length,
    results,
  });
}
