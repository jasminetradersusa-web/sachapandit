/**
 * GET /api/share/audio?token=...
 *
 * Resolves a public share URL token (same as /share/[shareId]) server-side and redirects
 * to a short-lived signed storage URL. Does not expose generation UUIDs or raw storage paths.
 */

import { NextResponse } from "next/server";
import { resolveSharePublicSignedAudioUrl } from "@/lib/share-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const signed = await resolveSharePublicSignedAudioUrl(token);
  if (!signed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(signed);
}
