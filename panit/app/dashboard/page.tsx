/**
 * Library dashboard (server)
 *
 * Security architecture:
 * - Lists only rows visible under RLS for the signed-in user.
 * - “Listen” links use `/api/voice` which re-checks ownership / public flags before signing URLs.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyCredits } from "@/components/buy-credits";
import { DisclaimerBanner } from "@/components/disclaimer";
import { SiteHeader } from "@/components/site-header";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  const credits = profile?.credits ?? 0;

  const { data: items } = await supabase
    .from("generations")
    .select("id, share_slug, prompt, created_at, audio_storage_path, is_public, shares(public_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <SiteHeader email={user.email} credits={credits} />
      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14 space-y-10 flex-1 w-full">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h1 className="font-display text-display text-ink">Your library</h1>
            <p className="text-ink-muted mt-3 text-lg">
              Credits:{" "}
              <strong className="text-accent-light tabular-nums font-semibold">{credits}</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <BuyCredits />
            <Link href="/create" className="btn-primary text-sm px-4 py-2 rounded-xl">
              New story
            </Link>
          </div>
        </div>
        <DisclaimerBanner />
        <ul className="space-y-3">
          {(items ?? []).length === 0 ? (
            <li className="text-ink-muted text-sm py-8 text-center">No stories yet. Create your first one.</li>
          ) : (
            (items ?? []).map((g) => {
              const rawShares = g.shares as
                | { public_id: string }
                | { public_id: string }[]
                | null
                | undefined;
              const firstShare = Array.isArray(rawShares) ? rawShares[0] : rawShares;
              const shareToken = firstShare?.public_id ?? g.share_slug;
              return (
                <li key={g.id} className="surface-card px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink line-clamp-2 leading-relaxed">{g.prompt}</p>
                    <p className="text-xs text-ink-muted mt-2">
                      {new Date(g.created_at).toLocaleString()}
                      {g.audio_storage_path ? " · With audio" : " · Text only"}
                      {g.is_public ? " · Shareable" : ""}
                    </p>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <Link
                      href={`/share/${shareToken}`}
                      className="text-sm text-accent-light hover:text-white transition-colors duration-layout font-medium"
                    >
                      Open
                    </Link>
                    {g.audio_storage_path ? (
                      <a
                        href={`/api/voice?id=${encodeURIComponent(g.id)}`}
                        className="text-sm text-ink-muted hover:text-ink transition-colors duration-layout"
                      >
                        Listen
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </main>
    </>
  );
}
