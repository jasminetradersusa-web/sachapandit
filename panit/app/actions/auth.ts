/**
 * Server Actions — authentication
 *
 * Security architecture:
 * - Runs only on the server; mutates Supabase cookies via the SSR client.
 * - Never accept client-supplied redirect targets without an allow-list (not needed for sign-out).
 */

"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
