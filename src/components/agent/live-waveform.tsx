"use client";

/**
 * LiveWaveform , visualização de áudio ao vivo durante a gravação.
 *
 * Lê o MediaStream do microfone via Web Audio API (AnalyserNode) e anima um
 * conjunto de barras verticais que reagem ao som captado (estilo "ouvindo").
 *
 * Performance (ui-ux-pro-max §7): anima só `transform: scaleY` via refs no
 * loop de requestAnimationFrame , zero re-render do React por frame, zero
 * animação de width/height (sem reflow). `prefers-reduced-motion` cai para
 * barras estáticas (sem AudioContext nem rAF).
 *
 * Quando `active=false` (pausado), o loop suaviza as barras para uma linha de
 * base calma em vez de congelar abruptamente.
 */

import { useReducedMotion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface LiveWaveformProps {
  /** Stream do microfone (de getUserMedia). Null = sem áudio ainda. */
  stream: MediaStream | null;
  /** true = gravando (anima com o som); false = pausado (linha de base calma). */
  active: boolean;
  /** Número de barras. Default 24. */
  barCount?: number;
  className?: string;
}

const BASELINE = 0.14; // altura mínima visível (silêncio / pausado)

export function LiveWaveform({
  stream,
  active,
  barCount = 24,
  className,
}: LiveWaveformProps) {
  const reduceMotion = useReducedMotion();
  const barsRef = React.useRef<Array<HTMLSpanElement | null>>([]);
  const activeRef = React.useRef(active);

  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  React.useEffect(() => {
    if (!stream || reduceMotion) return;
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    let source: MediaStreamAudioSourceNode;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; // 32 bins , suficiente p/ barras de voz
    analyser.smoothingTimeConstant = 0.8;
    try {
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      try {
        void ctx.close();
      } catch {
        /* noop */
      }
      return;
    }
    void ctx.resume?.();

    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);
    const usable = Math.max(1, Math.floor(bins * 0.7)); // ignora agudos quase mudos
    let raf = 0;
    let cancelled = false;

    const render = () => {
      if (cancelled) return;
      const bars = barsRef.current;
      if (activeRef.current) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < bars.length; i++) {
          const el = bars[i];
          if (!el) continue;
          const idx = Math.floor((i / bars.length) * usable);
          const v = data[idx] / 255; // 0..1
          const scale = BASELINE + Math.min(1, v * 1.7) * (1 - BASELINE);
          el.style.transform = `scaleY(${scale.toFixed(3)})`;
        }
      } else {
        // pausado: suaviza em direção à linha de base
        for (const el of bars) {
          if (!el) continue;
          const cur = currentScale(el);
          const next = cur + (BASELINE - cur) * 0.2;
          el.style.transform = `scaleY(${next.toFixed(3)})`;
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* noop */
      }
      try {
        analyser.disconnect();
      } catch {
        /* noop */
      }
      try {
        void ctx.close();
      } catch {
        /* noop */
      }
    };
  }, [stream, reduceMotion]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-6 w-full items-center justify-between",
        className,
      )}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-[2.5px] shrink-0 origin-center rounded-full bg-violet-500 motion-reduce:bg-violet-500/70"
          style={
            reduceMotion
              ? { transform: `scaleY(${staticScale(i, barCount)})` }
              : { transform: `scaleY(${BASELINE})` }
          }
        />
      ))}
    </div>
  );
}

/** Lê o scaleY atual de um elemento (para suavização no modo pausado). */
function currentScale(el: HTMLElement): number {
  const t = el.style.transform;
  const m = /scaleY\(([\d.]+)\)/.exec(t);
  return m ? Number(m[1]) : BASELINE;
}

/** Padrão estático (reduced-motion): forma de onda suave e simétrica. */
function staticScale(i: number, total: number): number {
  const phase = (i / Math.max(1, total - 1)) * Math.PI;
  return Number((0.25 + Math.sin(phase) * 0.6).toFixed(3));
}
