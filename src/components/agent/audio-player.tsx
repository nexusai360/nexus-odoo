"use client";

/**
 * AudioPlayer , player customizado para mensagens de áudio do agente.
 *
 * Portado de nexus-insights/src/components/nex/audio-player.tsx.
 * Adaptações: renomeação nex→agent. Lógica e design inalterados.
 *
 * Controles:
 *  - Play / Pause.
 *  - Barra de progresso (input range bound em audio.currentTime).
 *  - Tempo mm:ss / mm:ss em fonte tabular (sem layout shift).
 *  - Botão cíclico de velocidade (1× → 1.25× → 1.5× → 1.75× → 2× → 1×).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §6
 */

import { Pause, Play } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
export type AudioSpeed = (typeof SPEEDS)[number];

export interface AudioPlayerProps {
  src: string;
  /** Duração conhecida em segundos (placeholder até `loadedmetadata`). */
  durationSeconds?: number;
  className?: string;
}

export function AudioPlayer({
  src,
  durationSeconds,
  className,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState<number>(durationSeconds ?? 0);
  const [speedIndex, setSpeedIndex] = React.useState(0);
  const speed: AudioSpeed = SPEEDS[speedIndex] ?? 1;

  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const handleTogglePlay = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const cycleSpeed = React.useCallback(() => {
    setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  }, []);

  const handleSeek = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const el = audioRef.current;
      if (!el) return;
      const next = Number(event.target.value);
      if (Number.isNaN(next)) return;
      el.currentTime = next;
      setCurrentTime(next);
    },
    [],
  );

  const onLoadedMetadata = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
  }, []);

  const onTimeUpdate = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
  }, []);

  const onPlay = React.useCallback(() => setIsPlaying(true), []);
  const onPause = React.useCallback(() => setIsPlaying(false), []);
  const onEnded = React.useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const max = duration > 0 ? duration : Math.max(currentTime, 1);

  return (
    <div
      className={cn(
        "flex w-full max-w-[320px] items-center gap-2 rounded-2xl bg-violet-600/15 px-3 py-2",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        className="sr-only"
      />

      <button
        type="button"
        onClick={handleTogglePlay}
        aria-label={isPlaying ? "Pausar" : "Tocar"}
        className={cn(
          "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-500",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5" />
        )}
      </button>

      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(currentTime, max)}
        onChange={handleSeek}
        aria-label="Progresso"
        className={cn(
          "h-1 flex-1 cursor-pointer appearance-none rounded-full bg-violet-200/60 accent-violet-600 dark:bg-violet-900/40",
        )}
      />

      <span
        className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Velocidade ${formatSpeed(speed)} (clique para próxima)`}
        title={`Velocidade ${formatSpeed(speed)} , clique para próxima`}
        className={cn(
          "flex h-5 min-w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-violet-500/30 bg-transparent px-1 font-mono text-[9px] font-medium tabular-nums text-violet-700 dark:text-violet-300",
          "transition-all duration-150 hover:scale-105 hover:border-violet-500/60 hover:bg-violet-500/20",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
        )}
      >
        {formatSpeed(speed)}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSpeed(value: AudioSpeed): string {
  return `${value.toString()}×`;
}
