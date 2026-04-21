"use client";

/**
 * Looping background hum via <audio> (inline WAV — no network fetch).
 * Playback starts only after a user gesture; preference in localStorage `sv-ambient-muted`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "sv-ambient-muted";
/** Browser gain; WAV is already quiet — keep combined level low (~0.12–0.18). */
const PLAYBACK_VOLUME = 0.14;

function readMutedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeMutedPreference(muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "true" : "false");
  } catch {
    /* private mode / quota */
  }
}

/** Short mono WAV (integer-cycle sine) so `loop` has no audible seam at this length. */
function buildHumWavDataUri(): string {
  const sampleRate = 22050;
  const durationSamples = 11025; // 0.5s — 40 Hz × 11025 / 22050 = 20 full cycles
  const freq = 40;
  const dataSize = durationSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  };

  writeStr("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2; // PCM
  view.setUint16(offset, 1, true);
  offset += 2; // mono
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * 2, true);
  offset += 4;
  view.setUint16(offset, 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeStr("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const amp = 1400;
  for (let n = 0; n < durationSamples; n++) {
    const t = (2 * Math.PI * freq * n) / sampleRate;
    const fundamental = Math.sin(t);
    const harmonic = 0.22 * Math.sin(2 * t);
    const air = 0.08 * Math.sin(3 * t + 0.4);
    const sample = fundamental * 0.7 + harmonic + air;
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * amp))), true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:audio/wav;base64,${typeof btoa !== "undefined" ? btoa(binary) : ""}`;
}

export function AmbientSound() {
  const [muted, setMuted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  const dataUri = useMemo(() => buildHumWavDataUri(), []);

  mutedRef.current = muted;

  useEffect(() => {
    const m = readMutedPreference();
    mutedRef.current = m;
    setMuted(m);
    setHydrated(true);
  }, []);

  const applyVolumeAndPlayState = useCallback(
    (el: HTMLAudioElement) => {
      el.volume = PLAYBACK_VOLUME;
      el.muted = mutedRef.current;
      if (!mutedRef.current && unlocked) {
        void el.play().catch(() => {
          /* still blocked — wait for another gesture */
        });
      } else {
        el.pause();
      }
    },
    [unlocked],
  );

  const tryUnlock = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setUnlocked(true);
    applyVolumeAndPlayState(el);
  }, [applyVolumeAndPlayState]);

  useEffect(() => {
    if (!hydrated) return;
    const el = audioRef.current;
    if (!el) return;
    applyVolumeAndPlayState(el);
  }, [hydrated, muted, unlocked, applyVolumeAndPlayState]);

  useEffect(() => {
    if (!hydrated) return;

    const onFirstGesture = () => {
      tryUnlock();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstKey);
    };

    const onFirstKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      onFirstGesture();
    };

    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstKey, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstKey);
    };
  }, [hydrated, tryUnlock]);

  const toggle = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    writeMutedPreference(next);
    setUnlocked(true);
    const el = audioRef.current;
    if (el) {
      el.volume = PLAYBACK_VOLUME;
      el.muted = next;
      if (!next) {
        void el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
  }, []);

  if (!hydrated) return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={dataUri}
        loop
        playsInline
        preload="auto"
        className="sr-only"
        aria-hidden
        onLoadedMetadata={(e) => {
          e.currentTarget.volume = PLAYBACK_VOLUME;
          e.currentTarget.muted = mutedRef.current;
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!muted}
        aria-label={muted ? "Unmute ambient sound" : "Mute ambient sound"}
        title={muted ? "Ambient off — click to unmute" : "Ambient on — click to mute"}
        className="fixed bottom-4 right-4 z-[100] flex h-11 w-11 items-center justify-center rounded-full border border-accent/35 bg-black/45 text-accent-light shadow-glow-sm backdrop-blur-md transition-all duration-500 ease-out hover:border-accent/55 hover:bg-black/55 hover:shadow-glow-lg active:scale-95"
      >
        {muted ? (
          <svg
            className="h-5 w-5 opacity-80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden
          >
            <path
              d="M11 5L6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M23 9l-6 6M17 9l6 6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden
          >
            <path
              d="M11 5L6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a9 9 0 010 14.14" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </>
  );
}
