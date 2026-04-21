/**
 * Public share page: /share/[id]
 *
 * Security:
 * - URL `id` is an opaque `shares.public_id` (12 hex), legacy slug, or UUID — never email or user_id.
 * - Payload is narrative + safe meta only (no prompt, no owner identifiers).
 * - Media via `/api/share/audio` and `/api/share/image` (signed redirects; no raw storage paths in HTML).
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DisclaimerBanner } from "@/components/disclaimer";
import { ShareHeader } from "@/components/share-header";
import { ShareViewTracker } from "@/components/share-view-tracker";
import { getSharePublicCached } from "@/lib/share-data";
import { parseShareToken } from "@/lib/share";

type Props = { params: Promise<{ id: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!parseShareToken(id)) {
    return { title: "Story not found · Sacred Voice", robots: { index: false, follow: false } };
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const payload = await getSharePublicCached(id);
  if (!payload) {
    return { title: "Story not found · Sacred Voice", robots: { index: false, follow: false } };
  }

  const pageUrl = `${origin}/share/${id}`;
  const title = "Shared AI story · Sacred Voice";
  const description = payload.ogDescription;
  const ogImageUrl = `${origin}/og-share-placeholder.png`;

  return {
    metadataBase: new URL(`${origin}/`),
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Sacred Voice",
      type: "website",
      locale: "en_US",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "Sacred Voice",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: { canonical: pageUrl },
    robots: { index: true, follow: true },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  if (!parseShareToken(id)) {
    notFound();
  }

  const payload = await getSharePublicCached(id);
  if (!payload) {
    notFound();
  }

  const meta = payload.generationMeta;

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const shareUrl = `${base}/share/${id}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="min-h-screen flex flex-col">
      <ShareHeader />

      <main className="flex-1 flex flex-col items-center w-full px-4 pt-8 pb-16 sm:pt-12 sm:pb-20">
        <div className="w-full max-w-md sm:max-w-lg mx-auto flex flex-col items-center text-center space-y-6 sm:space-y-8">
          <div className="space-y-3">
            <p className="eyebrow">Shared piece</p>
            <h1 className="font-display text-display text-ink leading-tight px-1 text-balance">
              A moment of story
            </h1>
          </div>

          <div className="w-full max-w-full [&_aside]:text-center [&_aside]:text-xs sm:[&_aside]:text-sm [&_aside]:leading-snug">
            <DisclaimerBanner />
          </div>

          <article className="surface-card w-full p-6 sm:p-8 space-y-6 text-center">
            {payload.hasImage ? (
              <div className="w-full max-w-sm mx-auto rounded-xl overflow-hidden border border-accent/20 shadow-glow-sm relative aspect-[4/3] max-h-72">
                <Image
                  src={`/api/share/image?token=${encodeURIComponent(id)}`}
                  alt=""
                  fill
                  className="object-cover opacity-95"
                  sizes="(max-width: 640px) 100vw, 24rem"
                  loading="lazy"
                  unoptimized
                />
              </div>
            ) : null}

            {(meta?.tone || meta?.suggestedVoiceStyle) && (
              <p className="text-[0.7rem] sm:text-xs text-ink-muted leading-relaxed">
                {meta.tone && <span>{meta.tone}</span>}
                {meta.tone && meta.suggestedVoiceStyle ? (
                  <span aria-hidden className="mx-1.5 opacity-50">
                    ·
                  </span>
                ) : null}
                {meta.suggestedVoiceStyle && (
                  <span>{meta.suggestedVoiceStyle.replace(/_/g, " ")}</span>
                )}
              </p>
            )}

            <div className="text-sm sm:text-base text-ink leading-relaxed whitespace-pre-wrap break-words max-w-prose mx-auto font-display text-left sm:text-center">
              {payload.narrativeFull.trim()}
            </div>

            {payload.hasAudio ? (
              <div className="w-full max-w-sm mx-auto pt-1">
                <audio
                  controls
                  className="w-full h-10 sm:h-11 rounded-xl accent-accent"
                  src={`/api/share/audio?token=${encodeURIComponent(id)}`}
                  preload="metadata"
                >
                  Your browser does not support audio.
                </audio>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[0.7rem] sm:text-xs text-ink-muted pt-1">
              <ShareViewTracker shareToken={id} initialViews={payload.shareViewsAtLoad} />
              <span className="hidden sm:inline opacity-40" aria-hidden>
                ·
              </span>
              <span className="leading-snug max-w-[28ch] sm:max-w-none">
                {new Date(payload.createdAt).toLocaleDateString()} · Creative content, not advice
              </span>
            </div>
          </article>

          <div className="flex flex-col items-center gap-3 w-full pt-2">
            <Link href="/create" className="btn-primary w-full max-w-xs sm:max-w-sm text-center">
              Create your own
            </Link>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full max-w-xs sm:max-w-sm text-center"
            >
              Share on WhatsApp
            </a>
            <Link
              href="/"
              className="text-sm text-ink-muted hover:text-accent-light transition-colors duration-layout underline-offset-4 hover:underline"
            >
              Sacred Voice home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
