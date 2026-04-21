/**
 * Global header (server-rendered shell + client sign-out control via Server Action)
 *
 * Security architecture:
 * - Shows non-sensitive session context only; never displays tokens or secrets.
 * - Sign-out is executed as a Server Action to clear HTTP-only cookies correctly.
 */

import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";

export function SiteHeader({
  email,
  credits,
}: {
  email?: string | null;
  credits?: number | null;
}) {
  return (
    <header className="shrink-0 sticky top-0 z-20 border-b border-accent/20 bg-black/35 backdrop-blur-xl shadow-glow-inset transition-all duration-500 ease-out shadow-[0_0_48px_rgba(91,33,182,0.08)]">
      <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-xl sm:text-2xl text-ink tracking-tight hover:text-accent-light transition-colors duration-layout"
        >
          Sacred Voice
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5 text-sm">
          {email ? (
            <>
              {typeof credits === "number" && (
                <span className="text-ink-muted hidden sm:inline">
                  <span className="text-accent-light/90 font-medium tabular-nums">{credits}</span>{" "}
                  <span className="text-ink-muted/80">credits</span>
                </span>
              )}
              <Link
                href="/create"
                className="text-accent-light hover:text-white transition-colors duration-layout font-medium"
              >
                Create
              </Link>
              <Link
                href="/dashboard"
                className="text-ink-muted hover:text-ink transition-colors duration-layout"
              >
                Library
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-ink-muted hover:text-ink transition-colors duration-layout"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/login" className="btn-primary text-sm px-4 py-2 rounded-xl shadow-glow-sm">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
