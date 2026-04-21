"use client";

/**
 * Minimal bar visualization driven by the playing <audio> element (AnalyserNode).
 * Canvas rAF loop — no per-frame React state. Remount via parent `key` when `src` changes.
 */

import { useCallback, useEffect, useRef } from "react";

const BAR_COUNT = 32;

export function StoryAudioWithWaveform({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const connectedRef = useRef(false);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levelsRef = useRef<number[]>(Array(BAR_COUNT).fill(0.12));

  const ensureGraph = useCallback(async () => {
    const el = audioRef.current;
    if (!el || connectedRef.current) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    const buf = new ArrayBuffer(analyser.frequencyBinCount);
    dataRef.current = new Uint8Array(buf);
    connectedRef.current = true;
  }, []);

  useEffect(() => {
    levelsRef.current = Array(BAR_COUNT).fill(0.12);
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
      connectedRef.current = false;
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const analyser = analyserRef.current;
      const data = dataRef.current;
      const el = audioRef.current;
      const levels = levelsRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w < 2 || h < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (analyser && data && el && !el.paused && el.readyState >= 2) {
        analyser.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += data[i * step + j] ?? 0;
          }
          const avg = sum / step / 255;
          levels[i] = Math.min(1, 0.1 + avg * 0.92);
        }
      } else {
        for (let i = 0; i < BAR_COUNT; i++) {
          levels[i] = Math.max(0.08, levels[i] * 0.9);
        }
      }

      c2d.clearRect(0, 0, w, h);
      const gap = 2;
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      const baseY = h - 2;
      for (let i = 0; i < BAR_COUNT; i++) {
        const lh = levels[i] ?? 0.12;
        const bh = Math.max(4, lh * (h - 6));
        const x = i * (barW + gap);
        const y = baseY - bh;
        c2d.fillStyle = "rgba(167, 139, 250, 0.52)";
        c2d.fillRect(x, y, barW, bh);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => {
      void ensureGraph();
    };

    el.addEventListener("play", onPlay);
    return () => el.removeEventListener("play", onPlay);
  }, [ensureGraph, src]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div
        className="rounded-xl border border-accent/15 bg-parchment-deep/40 px-2 py-2 shadow-[inset_0_0_20px_rgba(91,33,182,0.06)]"
        aria-label="Audio waveform"
        role="img"
      >
        <canvas ref={canvasRef} className="h-14 w-full block" aria-hidden />
      </div>
      <audio
        ref={audioRef}
        controls
        className="w-full rounded-xl accent-accent opacity-95"
        src={src}
        preload="metadata"
      >
        Your browser does not support audio.
      </audio>
    </div>
  );
}
