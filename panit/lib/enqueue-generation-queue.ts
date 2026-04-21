/**
 * Enqueue a generation job (async worker). Idempotent: one pending row per (user, pipeline prompt_hash).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type EnqueueResult = {
  jobId: string;
  /** False if an identical pending job already existed (same user + prompt_hash). */
  created: boolean;
};

export async function enqueueOrGetPendingGenerationJob(
  supabase: SupabaseClient<Database>,
  args: {
    userId: string;
    prompt: string;
    promptHash: string;
    fingerprint: string;
  },
): Promise<EnqueueResult> {
  const { data: existing, error: findErr } = await supabase
    .from("generation_queue")
    .select("id")
    .eq("user_id", args.userId)
    .eq("prompt_hash", args.promptHash)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("generation_queue find pending", findErr);
    throw new Error("Could not check queue");
  }

  if (existing?.id) {
    return { jobId: existing.id, created: false };
  }

  const { data: row, error: insErr } = await supabase
    .from("generation_queue")
    .insert({
      user_id: args.userId,
      prompt: args.prompt,
      prompt_hash: args.promptHash,
      fingerprint: args.fingerprint,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !row?.id) {
    console.error("generation_queue insert", insErr);
    throw new Error("Could not enqueue job");
  }

  return { jobId: row.id, created: true };
}
