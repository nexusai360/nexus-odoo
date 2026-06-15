"use client";

/**
 * Card "Perícia automática (Claude)" no painel Backtest.
 *
 * Configura o intervalo (em minutos) do agendador host-side que dispara a
 * perícia agêntica via Claude Code (Opus) sobre as avaliações PENDENTE e em
 * REAVALIAÇÃO. Default 240 min (4h). Conversor dinâmico mostra equivalência em
 * "X horas e Y minutos" em tempo real conforme o usuário digita.
 *
 * Server action: src/lib/actions/quality-heuristic-config.ts (mantém o campo
 * `qualityHeuristicIntervalMinutes`, agora intervalo da perícia , sem migration).
 * Agendador: src/lib/agent/quality/judge-scheduler.ts (local-only).
 */

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateQualityHeuristicConfig } from "@/lib/actions/quality-heuristic-config";

interface Props {
  initialMinutes: number;
}

const MIN = 1;
const MAX = 1440;

function formatEquivalencia(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) {
    return "valor inválido";
  }
  const m = Math.floor(minutes);
  if (m < 60) {
    return `${m} minuto${m === 1 ? "" : "s"}`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hPart = `${h} hora${h === 1 ? "" : "s"}`;
  if (rest === 0) return hPart;
  return `${hPart} e ${rest} minuto${rest === 1 ? "" : "s"}`;
}

export function AutoHeuristicConfig({ initialMinutes }: Props) {
  const [value, setValue] = useState<number>(initialMinutes);
  const [saved, setSaved] = useState<number>(initialMinutes);
  const [pending, startTransition] = useTransition();

  const dirty = value !== saved;
  const valid =
    Number.isFinite(value) && Number.isInteger(value) && value >= MIN && value <= MAX;

  const handleSave = () => {
    if (!valid || !dirty) return;
    startTransition(async () => {
      const res = await updateQualityHeuristicConfig({ intervalMinutes: value });
      if (res.ok) {
        setSaved(res.intervalMinutes);
        toast.success(
          `Intervalo salvo: ${formatEquivalencia(res.intervalMinutes)}. ` +
            `O worker reaplica em até 60s.`,
        );
      } else {
        toast.error(`Falha ao salvar: ${res.error}`);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-violet-400" />
          Perícia automática (Claude)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Frequência em que o Claude Code (Opus) repericia as avaliações
          pendentes e em reavaliação, refazendo a consulta e conferindo a
          verdade do dado. Roda local, em background.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label
            htmlFor="auto-heuristic-minutes"
            className="text-sm font-medium"
          >
            Intervalo entre execuções (em minutos)
          </Label>
          <span
            className={
              valid
                ? "inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                : "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
            }
          >
            {valid ? `≈ ${formatEquivalencia(value)}` : "valor inválido"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="auto-heuristic-minutes"
            type="number"
            min={MIN}
            max={MAX}
            step={1}
            value={value}
            disabled={pending}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setValue(Math.floor(n));
              else setValue(NaN);
            }}
            className="max-w-[160px] tabular-nums"
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || !valid || !dirty}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aceita de <strong>{MIN}</strong> a <strong>{MAX}</strong> minutos
          (24 horas).
        </p>
        {dirty && valid && (
          <p className="text-xs text-amber-400">
            Você tem alterações não salvas. Clique em &quot;Salvar&quot;
            para aplicar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
