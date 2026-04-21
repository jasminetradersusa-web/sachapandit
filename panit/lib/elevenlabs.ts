/**
 * Sacred Voice — ElevenLabs text-to-speech
 *
 * Security architecture:
 * - API key server-only; never forward provider errors verbatim to clients.
 * - `suggestedVoiceStyle` maps to allow-listed voice IDs (env overrides); unknown styles fall back safely.
 */

import "server-only";

import { getServerEnv } from "@/lib/env";
import type { StructuredStory } from "@/lib/openai";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

/** Maps pipeline “style” labels to ElevenLabs voice IDs (override via env). */
const STYLE_VOICE_ENV_KEYS: Record<StructuredStory["suggestedVoiceStyle"], string> = {
  warm_narrator: "ELEVENLABS_VOICE_WARM",
  calm_reflective: "ELEVENLABS_VOICE_CALM",
  soft_whisper: "ELEVENLABS_VOICE_SOFT",
  clear_storyteller: "ELEVENLABS_VOICE_CLEAR",
};

export function resolveVoiceIdForStyle(style: StructuredStory["suggestedVoiceStyle"]): string {
  const env = getServerEnv();
  const envKey = STYLE_VOICE_ENV_KEYS[style];
  const fromEnv = envKey ? (process.env[envKey] as string | undefined) : undefined;
  if (fromEnv && fromEnv.length > 5) return fromEnv;
  if (env.ELEVENLABS_VOICE_ID && env.ELEVENLABS_VOICE_ID.length > 5) return env.ELEVENLABS_VOICE_ID;
  return DEFAULT_VOICE;
}

export async function synthesizeSpeech(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const env = getServerEnv();
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  const vid = voiceId || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err.slice(0, 500)}`);
  }

  return res.arrayBuffer();
}
