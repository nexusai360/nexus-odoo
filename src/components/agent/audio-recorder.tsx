"use client";

/**
 * AudioRecorder — UI de gravação de áudio para o chat do agente.
 *
 * Portado de nexus-insights/src/components/nex/audio-recorder.tsx.
 * Adaptações: renomeação nex→agent. Lógica e design inalterados.
 *
 * Modos:
 *  - `standalone` (default): botão Mic em idle e barra completa em recording/paused.
 *  - `embedded`: expõe controle imperativo via useImperativeHandle (start/pauseOrResume/cancel/sendNow).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §6
 */

import { Mic, Pause, Play, Send, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */

export type AudioRecorderMode = "standalone" | "embedded";

export interface AudioRecorderHandle {
  start: () => Promise<void>;
  pauseOrResume: () => void;
  cancel: () => void;
  sendNow: () => void;
}

export interface AudioRecorderProps {
  onSend: (blob: Blob, durationSeconds: number) => void;
  onCancel?: () => void;
  onRecordingStateChange?: (active: boolean) => void;
  mode?: AudioRecorderMode;
  className?: string;
}

type Status = "idle" | "recording" | "paused";

const MAX_DURATION_SEC = 5 * 60;

const PREFERRED_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

/* -------------------------------------------------------------------------- */

function AudioRecorderImpl(
  {
    onSend,
    onCancel,
    onRecordingStateChange,
    mode = "standalone",
    className,
  }: AudioRecorderProps,
  ref: React.Ref<AudioRecorderHandle>,
) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [elapsed, setElapsed] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recordedMsRef = React.useRef<number>(0);
  const segmentStartedAtRef = React.useRef<number>(0);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = React.useRef(false);

  React.useEffect(() => {
    onRecordingStateChange?.(status !== "idle");
  }, [status, onRecordingStateChange]);

  const cleanup = React.useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    recordedMsRef.current = 0;
    segmentStartedAtRef.current = 0;
  }, []);

  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const [supported, setSupported] = React.useState<boolean>(true);
  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setSupported(ok);
  }, []);

  const pickMimeType = React.useCallback((): string | undefined => {
    if (typeof window === "undefined") return undefined;
    const MR = window.MediaRecorder;
    if (!MR) return undefined;
    for (const mime of PREFERRED_MIMES) {
      try {
        if (MR.isTypeSupported(mime)) return mime;
      } catch {
        /* ignora */
      }
    }
    return undefined;
  }, []);

  const sendNowRef = React.useRef<() => void>(() => {});

  const startTick = React.useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
    }
    tickRef.current = setInterval(() => {
      const segMs = Date.now() - segmentStartedAtRef.current;
      const totalMs = recordedMsRef.current + segMs;
      const seconds = Math.floor(totalMs / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_DURATION_SEC) {
        toast.message("Limite de 5 min — enviando…");
        sendNowRef.current();
      }
    }, 250);
  }, []);

  const start = React.useCallback(async () => {
    if (!supported) {
      toast.error("Gravação de áudio não suportada neste navegador");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current = rec;
      chunksRef.current = [];
      recordedMsRef.current = 0;
      segmentStartedAtRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");

      rec.start(250);
      startTick();
    } catch (err) {
      cleanup();
      setStatus("idle");
      const isPermissionError =
        err instanceof DOMException && err.name === "NotAllowedError";
      toast.error(
        isPermissionError
          ? "Acesso ao microfone negado"
          : "Não foi possível acessar o microfone",
      );
    }
  }, [cleanup, pickMimeType, startTick, supported]);

  const pauseOrResume = React.useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (status === "recording") {
      try {
        rec.pause();
        recordedMsRef.current += Date.now() - segmentStartedAtRef.current;
        if (tickRef.current !== null) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setStatus("paused");
      } catch {
        /* alguns browsers não suportam pause */
      }
    } else if (status === "paused") {
      try {
        rec.resume();
        segmentStartedAtRef.current = Date.now();
        startTick();
        setStatus("recording");
      } catch {
        /* idem */
      }
    }
  }, [startTick, status]);

  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    cleanup();
    setElapsed(0);
    setStatus("idle");
    onCancel?.();
  }, [cleanup, onCancel]);

  const sendNow = React.useCallback(() => {
    if (sendingRef.current) return;
    const rec = recorderRef.current;
    if (!rec) return;
    sendingRef.current = true;

    const totalMs =
      recordedMsRef.current +
      (rec.state === "recording"
        ? Date.now() - segmentStartedAtRef.current
        : 0);
    const duration = Math.max(1, Math.floor(totalMs / 1000));
    const mime = rec.mimeType || "audio/webm";

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      cleanup();
      setElapsed(0);
      setStatus("idle");
      sendingRef.current = false;
      onSend(blob, duration);
    };

    if (rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        sendingRef.current = false;
        cleanup();
        setStatus("idle");
      }
    } else {
      sendingRef.current = false;
    }
  }, [cleanup, onSend]);

  React.useEffect(() => {
    sendNowRef.current = sendNow;
  }, [sendNow]);

  React.useImperativeHandle(
    ref,
    () => ({
      start,
      pauseOrResume,
      cancel,
      sendNow,
    }),
    [start, pauseOrResume, cancel, sendNow],
  );

  const isRecording = status === "recording";

  // Modo "embedded"
  if (mode === "embedded") {
    if (status === "idle") return null;
    return (
      <div
        role="group"
        aria-label="Gravação de áudio"
        className={cn("flex w-full items-center gap-2", className)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            isRecording
              ? "animate-pulse bg-rose-500 motion-reduce:animate-none"
              : "bg-muted-foreground/50",
          )}
        />

        <span className="text-xs font-medium text-foreground">
          {isRecording ? "Gravando" : "Pausado"}
        </span>

        <span
          aria-live="polite"
          aria-atomic="true"
          className="font-mono text-xs tabular-nums text-muted-foreground"
        >
          {formatTime(elapsed)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={pauseOrResume}
            aria-label={isRecording ? "Pausar gravação" : "Retomar gravação"}
            className={cn(
              "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
            )}
          >
            {isRecording ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="ml-0.5 h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={cancel}
            aria-label="Cancelar gravação"
            className={cn(
              "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-rose-500/10 hover:text-rose-500",
              "focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Modo "standalone"
  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          void start();
        }}
        disabled={!supported}
        aria-label="Gravar áudio"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "cursor-pointer",
          className,
        )}
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Gravação de áudio"
      className={cn(
        "flex w-full items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-600/5 px-2.5 py-1.5",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          isRecording
            ? "animate-pulse bg-rose-500 motion-reduce:animate-none"
            : "bg-muted-foreground/50",
        )}
      />

      <span className="text-xs font-medium text-foreground">
        {isRecording ? "Gravando" : "Pausado"}
      </span>

      <span
        aria-live="polite"
        aria-atomic="true"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {formatTime(elapsed)}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={pauseOrResume}
          aria-label={isRecording ? "Pausar gravação" : "Retomar gravação"}
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
          )}
        >
          {isRecording ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={cancel}
          aria-label="Cancelar gravação"
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:bg-rose-500/10 hover:text-rose-500",
            "focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={sendNow}
          aria-label="Enviar áudio"
          className={cn(
            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-violet-600 text-white transition-colors",
            "hover:bg-violet-500",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:outline-none",
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const AudioRecorder = React.forwardRef<
  AudioRecorderHandle,
  AudioRecorderProps
>(AudioRecorderImpl);

AudioRecorder.displayName = "AudioRecorder";

/* -------------------------------------------------------------------------- */

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
