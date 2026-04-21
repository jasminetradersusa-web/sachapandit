/**
 * Sacred Voice — Supabase server clients
 *
 * Security architecture:
 * - `server-only`: prevents accidental imports from Client Components (build-time guard in Next.js).
 * - Server client: user session from HttpOnly cookies; RLS still applies.
 * - Admin client: service role bypasses RLS — restrict to webhooks, payment reconciliation, signing URLs.
 *
 * Implementation note: `@supabase/ssr` inference can collapse to `never` for hand-written `Database` types.
 * We cast to `SupabaseClient<Database>` so queries use our table definitions while keeping runtime behavior.
 */

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getServerEnv } from "@/lib/env";

/** Server Components, Server Actions, Route Handlers — user-scoped, RLS + session. */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const env = getServerEnv();
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
            );
          } catch {
            /* Server Component cannot always set cookies */
          }
        },
      },
    },
  );

  return client as unknown as SupabaseClient<Database>;
}

/** Service role — bypasses RLS. Webhooks, signed URLs, idempotent payment writes only. */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const env = getServerEnv();
  const client = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return client as unknown as SupabaseClient<Database>;
}
