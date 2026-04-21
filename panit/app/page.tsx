/**
 * Marketing home (server)
 *
 * Security architecture:
 * - Reads the session with the server Supabase client; no tokens exposed to the client tree here.
 */

import Link from "next/link";
import { DisclaimerBanner } from "@/components/disclaimer";
import { SiteHeader } from "@/components/site-header";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let credits: number | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();
    credits = profile?.credits ?? 0;
  }

  return (
    <>
      <SiteHeader email={user?.email} credits={credits} />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 sm:py-28">
        <div className="w-full max-w-3xl mx-auto text-center space-y-12">
          <div className="space-y-8">
            <p className="eyebrow">Voice · Story · Pause</p>
            <h1 className="font-display text-hero text-ink text-balance transition-opacity duration-700">
              Turn a thought into a short story you can hear.
            </h1>
            <p className="text-lg sm:text-xl text-ink-muted leading-relaxed max-w-xl mx-auto text-pretty">
              Sacred Voice turns your prompt into narrative and artwork—clearly labeled as{" "}
              <strong className="text-ink font-medium">AI-generated creative content</strong>, not
              prediction or authority.
            </p>
          </div>
          <div className="max-w-lg mx-auto">
            <DisclaimerBanner />
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 pt-2">
            {user ? (
              <Link href="/create" className="btn-primary w-full sm:w-auto min-w-[12rem]">
                Create a story
              </Link>
            ) : (
              <Link href="/auth/login" className="btn-primary w-full sm:w-auto min-w-[12rem]">
                Sign in to create
              </Link>
            )}
            <Link href="/dashboard" className="btn-secondary w-full sm:w-auto min-w-[12rem]">
              Your library
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
