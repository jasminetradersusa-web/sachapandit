/**
 * Create unique public share id for a generation (`shares.public_id`, 12 hex).
 * Used in `/share/[id]` — not the raw `generations.id` UUID.
 */

import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function insertSharePublicId(
  admin: SupabaseClient<Database>,
  generationId: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = randomBytes(6).toString("hex");
    const { error } = await admin.from("shares").insert({
      generation_id: generationId,
      public_id: publicId,
    });
    if (!error) return publicId;
    if (error.code !== "23505") {
      console.error("shares insert", error);
      return null;
    }
  }
  return null;
}
