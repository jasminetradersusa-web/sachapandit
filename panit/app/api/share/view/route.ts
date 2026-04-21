/**
 * POST /api/share/view
 *
 * - Body: { id } — must be `shares.public_id` (12 hex). No UUID/slug paths here.
 * - Increments `shares.views` only via security definer RPC (no public UPDATE on table).
 * - Rate-limited per IP in middleware (`limitShareViewPostByIp`).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isSharePublicId } from "@/lib/share";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const bodySchema = z.object({
  id: z.string().min(1).max(64),
});

type RpcResult = {
  ok?: boolean;
  viewCount?: number;
};

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const id = parsed.data.id.trim();
  if (!isSharePublicId(id)) {
    return NextResponse.json(
      { error: "Invalid id: expected share public_id (12 hex characters)" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("increment_share_views_by_public_id", {
    p_public_id: id.toLowerCase(),
  });

  if (error) {
    console.error("increment_share_views_by_public_id", error);
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }

  const result = data as RpcResult;
  if (!result?.ok || typeof result.viewCount !== "number") {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  return NextResponse.json({ viewCount: result.viewCount });
}
