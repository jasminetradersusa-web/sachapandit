/**
 * OAuth / magic-link callback
 *
 * Security architecture:
 * - Exchanges a one-time `code` for a session; cookies are set HTTP-only by Supabase SSR.
 * - Redirect targets are limited to same-origin paths via `next` search param usage (keep allow-list tight in production if you extend this).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function safeInternalPath(next: string | null): string {
  const fallback = "/dashboard";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return fallback;
  }
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin).toString());
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth`);
}
