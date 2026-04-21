"use client";

/**
 * Create flow: sync POST /api/generate (Ollama text), then POST /api/image for artwork (lazy in UI).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/disclaimer";

type GenResult = {
  id: string;
  narrative: string;
  sharePath: string;
  cached: boolean;
};

export function CreateForm() {
  const hpRef = useRef<HTMLInputElement>(null);
  const submitGenRef = useRef(0);
  const [submitPulse, setSubmitPulse] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [image, setImage] = useState<{ src: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!result?.id) return;
    const generationId = result.id;
    let cancelled = false;
    setImage(null);
    setImageError(null);
    setImageLoading(true);

    void (async () => {
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId }),
        });
        const data = (await res.json()) as {
          error?: string;
          imageBase64?: string;
          mimeType?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setImageError(data.error ?? "Could not load image");
          return;
        }
        if (data.imageBase64 && data.mimeType) {
          setImage({
            src: `data:${data.mimeType};base64,${data.imageBase64}`,
          });
        }
      } catch {
        if (!cancelled) setImageError("Network error loading image");
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [result?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitPulse(true);
    submitGenRef.current += 1;
    const myGen = submitGenRef.current;
    setLoading(true);
    setError(null);
    setResult(null);
    setImage(null);
    setImageError(null);
    setImageLoading(false);
    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, website: hpRef.current?.value ?? "" }),
      });
      const genData = (await genRes.json()) as {
        error?: string;
        text?: string;
        generationId?: string;
        sharePath?: string | null;
        cached?: boolean;
      };

      if (!genRes.ok) {
        setError(genData.error ?? "Something went wrong");
        return;
      }

      if (!genData.text?.trim() || !genData.generationId || !genData.sharePath) {
        setError("Invalid response from server");
        return;
      }

      if (submitGenRef.current !== myGen) return;
      setImage(null);
      setImageError(null);
      setImageLoading(true);
      setResult({
        id: genData.generationId,
        narrative: genData.text.trim(),
        sharePath: genData.sharePath,
        cached: Boolean(genData.cached),
      });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-8">
      <DisclaimerBanner />
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink/90 tracking-wide">
            Your prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            minLength={4}
            maxLength={300}
            rows={6}
            placeholder="A feeling, question, or image you want shaped into a short story…"
            className="input-mystic min-h-[8.5rem] text-base sm:text-lg leading-relaxed font-display"
          />
        </div>
        <p className="text-xs text-ink-muted text-center sm:text-left">
          One credit generates the story; a second credit applies when we create the artwork (cached
          artwork skips the extra charge).
        </p>
        <input
          ref={hpRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={loading}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setSubmitPulse(false);
            }}
            className={`btn-primary w-full sm:w-auto min-w-[14rem] disabled:opacity-50 disabled:shadow-none ${
              submitPulse ? "btn-glow-pulse" : ""
            }`}
          >
            {loading ? "Creating…" : "Generate story & artwork"}
          </button>
        </div>
      </form>
      {loading && (
        <div
          className="surface-card p-8 sm:p-10 space-y-6 text-center max-w-2xl mx-auto processing-card processing-enter"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="font-display text-lg sm:text-xl text-ink/95 tracking-wide processing-text">
            The system is processing...
          </p>
          <div className="flex justify-center gap-1.5 processing-dots" aria-hidden>
            <span className="processing-dot" />
            <span className="processing-dot" />
            <span className="processing-dot" />
          </div>
          <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
            Shaping your narrative. Artwork loads right after.
          </p>
          <div
            className="processing-line-track h-1 rounded-full bg-accent/15 max-w-xs mx-auto"
            aria-hidden
          />
        </div>
      )}
      {error && (
        <p className="text-sm text-red-300/95 text-center" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="surface-card p-6 sm:p-8 space-y-5 text-center sm:text-left results-reveal">
          <div className="w-full max-w-prose mx-auto sm:mx-0 space-y-2 flex flex-col">
            <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-accent/20 bg-parchment-deep/35 shadow-[inset_0_0_24px_rgba(91,33,182,0.08)] contain-content">
              {image ? (
                <img
                  src={image.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                  width={640}
                  height={400}
                />
              ) : null}
              {imageLoading ? (
                <div
                  className="absolute inset-0 bg-gradient-to-b from-accent/15 to-transparent animate-pulse"
                  aria-hidden
                />
              ) : null}
            </div>
            {imageError ? (
              <p className="text-xs text-ink-muted text-center sm:text-left" role="status">
                {imageError}
              </p>
            ) : null}
            {imageLoading ? (
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-ink-muted/90 text-center sm:text-left">
                Loading artwork…
              </p>
            ) : null}
          </div>

          <p className="eyebrow text-center sm:text-left pt-1">Your narrative</p>

          <div className="text-ink leading-relaxed whitespace-pre-wrap text-base sm:text-lg font-display max-w-prose mx-auto sm:mx-0">
            {result.narrative}
          </div>

          {result.cached ? (
            <p className="text-xs text-ink-muted">Story served from cache (same prompt recently).</p>
          ) : null}

          <div className="flex flex-wrap gap-4 justify-center sm:justify-start pt-2">
            <Link
              href={result.sharePath}
              className="text-sm font-medium text-accent-light hover:text-white transition-colors duration-layout"
            >
              Open shareable page
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-ink-muted hover:text-ink transition-colors duration-layout"
            >
              Back to library
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
