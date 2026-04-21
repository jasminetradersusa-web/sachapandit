/**
 * GET /api/share/image?token=...
 *
 * Resolves a public share URL token and redirects to a short-lived signed URL for the
 * symbolic image in the private `images` bucket. Does not expose generation UUIDs or paths.
 */

import { NextResponse } from "next/server";
import { resolveSharePublicSignedImageUrl } from "@/lib/share-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const signed = await resolveSharePublicSignedImageUrl(token);
  if (!signed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(signed);
}
