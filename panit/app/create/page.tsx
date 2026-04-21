/**
 * Create page (server)
 *
 * Security architecture:
 * - Gatekeeps the editor behind `getUser()`; API routes re-validate auth independently.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateForm } from "@/components/create-form";
import { SiteHeader } from "@/components/site-header";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function CreatePage() {
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

  return (
    <>
      <SiteHeader email={user.email} credits={credits} />
      <main className="flex-1 flex flex-col items-center px-4 py-12 sm:py-16 pb-24">
        <div className="w-full max-w-3xl mx-auto space-y-12">
          <div className="text-center space-y-5">
            <Link
              href="/dashboard"
              className="text-sm text-ink-muted hover:text-accent-light transition-colors duration-500 inline-block"
            >
              ← Library
            </Link>
            <h1 className="font-display text-hero text-ink text-balance tracking-tight">
              Create
            </h1>
            <p className="text-ink-muted max-w-lg mx-auto leading-relaxed text-base sm:text-lg transition-opacity duration-500">
              One credit for a fresh narrative and artwork. Everything here is{" "}
              <strong className="text-ink/95 font-medium">AI-generated creative content</strong>.
            </p>
          </div>
          {credits < 1 ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-950/30 px-4 py-3.5 text-sm text-amber-100/95 text-center backdrop-blur-md transition-all duration-500">
              You need at least one credit.{" "}
              <Link href="/dashboard" className="underline font-medium text-accent-light hover:text-white transition-colors">
                Buy credits on your library page.
              </Link>
            </div>
          ) : null}
          <CreateForm />
        </div>
      </main>
    </>
  );
}
