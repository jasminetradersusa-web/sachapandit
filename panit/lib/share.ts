/**
 * Share link parsing and safe excerpts (no prompts, no emails).
 * Edge-safe helpers only — no server-only imports here.
 */

import { z } from "zod";

/** `shares.public_id` from randomBytes(6).toString("hex") */
const SHARE_PUBLIC_ID_RE = /^[a-f0-9]{12}$/i;

export function isSharePublicId(raw: string): boolean {
  return SHARE_PUBLIC_ID_RE.test(raw.trim());
}
/** Legacy `generations.share_slug` (24 hex) */
const SLUG_RE = /^[a-f0-9]{24}$/i;

export type ShareLookup =
  | { kind: "publicId"; value: string }
  | { kind: "slug"; value: string }
  | { kind: "uuid"; value: string };

export function parseShareToken(raw: string): ShareLookup | null {
  const t = raw.trim();
  if (!t) return null;
  if (z.string().uuid().safeParse(t).success) return { kind: "uuid", value: t };
  if (SHARE_PUBLIC_ID_RE.test(t)) return { kind: "publicId", value: t.toLowerCase() };
  if (SLUG_RE.test(t)) return { kind: "slug", value: t.toLowerCase() };
  return null;
}

const PREVIEW_CHARS = 320;

/** Visible preview on the share page (full narrative passed separately for “read more”). */
export function narrativePreview(narrative: string): { excerpt: string; truncated: boolean } {
  const normalized = narrative.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_CHARS) {
    return { excerpt: narrative.trim(), truncated: false };
  }
  const slice = normalized.slice(0, PREVIEW_CHARS);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 200 ? slice.slice(0, lastSpace) : slice;
  return { excerpt: `${cut}…`, truncated: true };
}

/** One-line snippet for share link previews (WhatsApp, Telegram, OG). */
export function linkPreviewDescription(narrative: string, maxChars = 100): string {
  const oneLine = narrative.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars).trimEnd()}…`;
}

/** Short plain-text blurb for Open Graph / Twitter (no newlines, capped). */
export function ogDescriptionFromNarrative(narrative: string, maxLen = 180): string {
  const oneLine = narrative.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  const slice = oneLine.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}
