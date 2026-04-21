import Link from "next/link";

/**
 * Minimal public header — no session / user info (keeps share route cacheable).
 */
export function ShareHeader() {
  return (
    <header className="shrink-0 border-b border-accent/15 bg-parchment/35 backdrop-blur-xl sticky top-0 z-20">
      <div className="max-w-lg mx-auto px-4 py-3.5 sm:py-4 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 w-full text-center sm:text-left">
        <Link
          href="/"
          className="text-sm font-display text-ink hover:text-accent-light transition-colors duration-layout order-2 sm:order-1"
        >
          Sacred Voice
        </Link>
        <Link
          href="/create"
          className="order-1 sm:order-2 text-sm font-semibold rounded-2xl bg-accent text-white px-4 py-2.5 sm:px-5 shadow-glow-sm hover:bg-accent-light transition-all duration-layout w-full sm:w-auto max-w-[12rem] sm:max-w-none text-center"
        >
          Create your own
        </Link>
      </div>
    </header>
  );
}
