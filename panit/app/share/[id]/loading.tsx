/**
 * Subtle shell while share payload resolves (slow cache / cold start).
 * No story text or IDs — avoids flashing sensitive content.
 */

export default function ShareLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-accent/15 bg-parchment/35 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 w-full">
          <div className="h-4 w-28 rounded bg-accent/15 animate-pulse" aria-hidden />
          <div className="h-9 w-36 rounded-xl bg-accent/10 animate-pulse" aria-hidden />
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-start w-full px-4 pt-10 pb-16 sm:pt-14 sm:pb-20">
        <div className="w-full max-w-md sm:max-w-lg mx-auto flex flex-col items-center text-center space-y-8">
          <div className="space-y-3 w-full">
            <div className="h-3 w-24 mx-auto rounded bg-accent/20 animate-pulse" aria-hidden />
            <div className="h-10 w-[80%] max-w-xs mx-auto rounded bg-accent/15 animate-pulse" aria-hidden />
          </div>
          <div
            className="w-full rounded-2xl border border-accent/20 bg-parchment-deep/40 backdrop-blur-md p-6 sm:p-8 space-y-6 shadow-surface"
            aria-busy
            aria-label="Loading shared story"
          >
            <div className="space-y-2 w-full">
              <div className="h-3 w-20 mx-auto rounded bg-accent/15 animate-pulse" aria-hidden />
              <div className="h-4 w-full max-w-sm mx-auto rounded bg-accent/10 animate-pulse" aria-hidden />
              <div className="h-4 w-[83%] max-w-xs mx-auto rounded bg-accent/10 animate-pulse" aria-hidden />
            </div>
            <div className="h-12 w-full max-w-sm mx-auto rounded-xl bg-accent/10 animate-pulse" aria-hidden />
            <div className="h-3 w-32 mx-auto rounded bg-accent/10 animate-pulse" aria-hidden />
          </div>
          <div className="h-11 w-48 rounded-xl bg-accent/15 animate-pulse" aria-hidden />
        </div>
      </main>
    </div>
  );
}
