"use client";

/**
 * R1 router de catalogo: botao de calibragem offline (Wave D4f + E4).
 *
 * Dispara POST /api/admin/router/calibrate, que roda pickDomains contra as 291
 * perguntas das rodadas R8-R23 (~30s, sem LLM de chat). Ao terminar, mostra os
 * KPIs do ultimo run (Top-1, Top-K, fallbacks, latencia p95) e um selo de
 * aprovacao quando Top-1 >= 85% (criterio de promocao do PLAN v3 §11.3).
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.7.
 */

import { useState } from "react";
import {
  Loader2,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CalibrationResult } from "@/lib/agent/router/calibrate";

interface CalibrateResponse {
  ok?: boolean;
  result?: CalibrationResult;
  error?: string;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function RouterCalibrationButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/router/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as CalibrateResponse;
      if (!res.ok || !data.ok || !data.result) {
        setError(data.error ?? `Falha (HTTP ${res.status}).`);
      } else {
        setResult(data.result);
      }
    } catch {
      setError("Nao foi possivel contatar o servidor. Tente novamente.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-violet-400" />
          Calibragem offline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Roda o seletor de dominios contra as 291 perguntas das rodadas
          historicas (R8 a R23) e mede a acuracia sem chamar o LLM de chat.
          Leva um a dois minutos e custa centavos em embeddings.
        </p>

        <Button onClick={run} disabled={running} className="w-full sm:w-auto">
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calibrando, aguarde
            </>
          ) : (
            <>
              <Gauge className="mr-2 h-4 w-4" />
              {result ? "Recalibrar" : "Rodar calibragem"}
            </>
          )}
        </Button>

        {running && (
          <p
            className="text-xs text-muted-foreground"
            aria-live="polite"
          >
            Gerando embeddings das 291 perguntas. Isso pode levar um a dois
            minutos, nao feche a aba.
          </p>
        )}

        {error && !running && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Calibragem nao concluida</p>
              <p className="mt-0.5 text-red-300/90">{error}</p>
            </div>
          </div>
        )}

        {result && !running && (
          <div className="space-y-3" aria-live="polite">
            {/* Selo de aprovacao: icone + texto, nunca so a cor. */}
            <div
              className={
                result.promotable
                  ? "flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
                  : "flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
              }
            >
              {result.promotable ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>
                {result.promotable
                  ? "Apto para ativacao: Top-1 atingiu o minimo de 85%."
                  : "Abaixo do minimo de 85% no Top-1. Ajustar domain-vocabulary e recalibrar."}
              </span>
            </div>

            {/* KPIs compactos, numeros tabulares para alinhar. */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Top-1
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {pct(result.top1Accuracy)}
                </dd>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {result.top1CorrectCount}/{result.mappableCount}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Top-K
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {pct(result.topKAccuracy)}
                </dd>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {result.topKCorrectCount}/{result.mappableCount}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Fallbacks
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {result.fallbacks}
                </dd>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  de {result.datasetSize}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Latencia p95
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {result.latencyP95}ms
                </dd>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  p50 {result.latencyP50}ms
                </p>
              </div>
            </dl>

            <p className="text-[11px] text-muted-foreground">
              threshold {result.threshold.toFixed(2)} · topK {result.topK}
              {result.reportPath ? " · relatorio salvo em docs/" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
