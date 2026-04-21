/**
 * Supabase Storage helpers for generation audio (server-only).
 *
 * Security architecture:
 * - Uploads use the service role for shared cache paths (`cache/…`) that user JWT cannot write.
 * - Signed URLs are short-lived; never log full URLs with tokens.
 * - Paths must not contain `..` or untrusted segments.
 */

import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase-server";

const BUCKET = "audio";
const SIGNED_URL_TTL_SEC = 900;

function assertSafeStoragePath(path: string): void {
  if (!path || path.includes("..") || path.startsWith("/")) {
    throw new Error("Invalid storage path");
  }
}

/** Upload MP3 bytes; `path` like `userId/genId.mp3` or `cache/sha256.mp3`. */
export async function uploadAudioMp3(path: string, body: Buffer): Promise<void> {
  assertSafeStoragePath(path);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, body, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/** Copy within the audio bucket (e.g. shared cache → per-user path). */
export async function copyAudioMp3(fromPath: string, toPath: string): Promise<void> {
  assertSafeStoragePath(fromPath);
  assertSafeStoragePath(toPath);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.storage.from(BUCKET).copy(fromPath, toPath);
  if (error) throw new Error(`Storage copy failed: ${error.message}`);
}

/** Create a time-limited signed URL for private bucket audio. */
export async function createSignedAudioUrl(storagePath: string): Promise<string> {
  assertSafeStoragePath(storagePath);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign URL");
  }
  return data.signedUrl;
}
