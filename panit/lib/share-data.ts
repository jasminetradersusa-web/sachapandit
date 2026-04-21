/**
 * Cached public share payload (server-only).
 * Each generation gets a unique opaque `shares.public_id` (used in `/share/[id]` URLs).
 * This module never returns user_id, email, prompt, or internal generation UUID in the payload shape.
 */

import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  narrativePreview,
  ogDescriptionFromNarrative,
  parseShareToken,
  type ShareLookup,
} from "@/lib/share";

export type SharePublicPayload = {
  narrativeFull: string;
  narrativeExcerpt: string;
  narrativeTruncated: boolean;
  ogDescription: string;
  hasAudio: boolean;
  hasImage: boolean;
  generationMeta: { tone?: string; suggestedVoiceStyle?: string } | null;
  createdAt: string;
  /** Present when resolved via `shares` row (`views` column). */
  shareViewsAtLoad?: number;
};

/** Row shape: public narrative + storage paths + safe meta (no user_id / email). */
type GenerationShareRow = {
  /** Internal UUID; present when joined from `shares` → `generations`, omitted for slug-only lookups. */
  id?: string;
  narrative: string;
  audio_storage_path: string | null;
  image_storage_path: string | null;
  generation_meta: unknown;
  created_at: string;
  shareViews?: number;
};

/**
 * Single round-trip for `shares.public_id` → `generations` (story text + storage path for audio).
 * Uses service role: public visitors have no RLS access to these tables.
 *
 * Note: there is no `text` / `audio_url` on `generations`; columns are `narrative` and
 * `audio_storage_path`. Playback uses `/api/voice?id=<generation id>` (signed redirect).
 */
async function fetchShareRow(lookup: ShareLookup): Promise<GenerationShareRow | null> {
  const admin = createAdminSupabaseClient();

  if (lookup.kind === "publicId") {
    const { data: share, error } = await admin
      .from("shares")
      .select(
        `
        views,
        generations!inner (
          id,
          narrative,
          audio_storage_path,
          image_storage_path,
          generation_meta,
          created_at,
          is_public
        )
      `,
      )
      .eq("public_id", lookup.value)
      .maybeSingle();

    if (error || !share) return null;

    const embedded = share.generations as
      | {
          id: string;
          narrative: string;
          audio_storage_path: string | null;
          image_storage_path: string | null;
          generation_meta: unknown;
          created_at: string;
          is_public: boolean;
        }
      | {
          id: string;
          narrative: string;
          audio_storage_path: string | null;
          image_storage_path: string | null;
          generation_meta: unknown;
          created_at: string;
          is_public: boolean;
        }[]
      | null;

    const g = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!g?.is_public || !g.narrative?.trim()) return null;

    return {
      id: g.id,
      narrative: g.narrative,
      audio_storage_path: g.audio_storage_path,
      image_storage_path: g.image_storage_path ?? null,
      generation_meta: g.generation_meta,
      created_at: g.created_at,
      shareViews: typeof share.views === "number" ? share.views : undefined,
    };
  }

  let q = admin
    .from("generations")
    .select(
      "id, share_slug, narrative, audio_storage_path, image_storage_path, generation_meta, created_at",
    )
    .eq("is_public", true);

  q = lookup.kind === "slug" ? q.eq("share_slug", lookup.value) : q.eq("id", lookup.value);

  const { data, error } = await q.maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    narrative: data.narrative,
    audio_storage_path: data.audio_storage_path,
    image_storage_path: data.image_storage_path ?? null,
    generation_meta: data.generation_meta,
    created_at: data.created_at,
  };
}

async function loadSharePublic(shareToken: string): Promise<SharePublicPayload | null> {
  const lookup = parseShareToken(shareToken);
  if (!lookup) return null;

  const row = await fetchShareRow(lookup);
  if (!row?.narrative?.trim()) return null;

  const meta = row.generation_meta as Record<string, unknown> | null;
  const generationMeta =
    meta && typeof meta === "object"
      ? {
          tone: typeof meta.tone === "string" ? meta.tone : undefined,
          suggestedVoiceStyle:
            typeof meta.suggestedVoiceStyle === "string"
              ? meta.suggestedVoiceStyle
              : undefined,
        }
      : null;

  const { excerpt, truncated } = narrativePreview(row.narrative);

  return {
    narrativeFull: row.narrative.trim(),
    narrativeExcerpt: excerpt,
    narrativeTruncated: truncated,
    ogDescription: ogDescriptionFromNarrative(row.narrative),
    hasAudio: Boolean(row.audio_storage_path?.trim()),
    hasImage: Boolean(row.image_storage_path?.trim()),
    generationMeta,
    createdAt: row.created_at,
    shareViewsAtLoad: row.shareViews,
  };
}

/**
 * Signed MP3 URL for a valid public share token, or null if missing / private / no audio.
 * Keeps generation id and storage path server-only.
 */
export async function resolveSharePublicSignedAudioUrl(shareToken: string): Promise<string | null> {
  const lookup = parseShareToken(shareToken.trim());
  if (!lookup) return null;

  const row = await fetchShareRow(lookup);
  if (!row?.narrative?.trim() || !row.audio_storage_path?.trim()) return null;

  const admin = createAdminSupabaseClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("audio")
    .createSignedUrl(row.audio_storage_path.trim(), 900);

  if (signErr || !signed?.signedUrl) {
    console.error("share audio signed url", signErr);
    return null;
  }

  return signed.signedUrl;
}

/**
 * Signed image URL for a valid public share token, or null if missing / private / no image.
 */
export async function resolveSharePublicSignedImageUrl(shareToken: string): Promise<string | null> {
  const lookup = parseShareToken(shareToken.trim());
  if (!lookup) return null;

  const row = await fetchShareRow(lookup);
  if (!row?.narrative?.trim() || !row.image_storage_path?.trim()) return null;

  const admin = createAdminSupabaseClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("images")
    .createSignedUrl(row.image_storage_path.trim(), 900);

  if (signErr || !signed?.signedUrl) {
    console.error("share image signed url", signErr);
    return null;
  }

  return signed.signedUrl;
}

/** ISR-style cache: fast repeat loads; view counts use /api/share/view (not this payload). */
export function getSharePublicCached(shareToken: string): Promise<SharePublicPayload | null> {
  return unstable_cache(
    () => loadSharePublic(shareToken),
    ["share-public", shareToken],
    { revalidate: 300 },
  )();
}
