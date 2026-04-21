import Link from "next/link";
import { ShareHeader } from "@/components/share-header";

/** Generic copy — does not reveal whether a token exists but is private vs missing. */
export function ShareNotFoundPage() {
  return (
    <>
      <ShareHeader />
      <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center py-16">
        <h1 className="font-display text-display text-ink mb-3">Story not found</h1>
        <p className="text-ink-muted text-sm mb-8 max-w-md leading-relaxed">
          This link may be private, removed, or mistyped.
        </p>
        <Link href="/create" className="text-accent-light font-medium hover:underline mb-4 transition-colors">
          Create your own
        </Link>
        <Link href="/" className="text-sm text-ink-muted hover:text-ink transition-colors">
          Home
        </Link>
      </main>
    </>
  );
}
