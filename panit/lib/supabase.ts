/**
 * Sacred Voice — Supabase browser client
 *
 * Security architecture:
 * - This file is safe to import from Client Components: anon key + RLS only.
 * - For cookie-bound server sessions or service-role access, use `@/lib/supabase-server` instead
 *   (those exports are `server-only` and must never be imported from client code).
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/** Browser / Client Component — anon key only, RLS enforced. */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient<Database>(url, anon);
}
