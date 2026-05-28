"use client";

/**
 * Card "Auditoria automática" no painel Backtest.
 *
 * Configura o intervalo (em minutos) do cron BullMQ que processa as
 * avaliações PENDENTE via heurística (sem custo de LLM). Default 240 min
 * (4h). Conversor dinâmico mostra equivalência em "X horas e Y minutos"
 * em tempo real conforme o usuário digita.
 *
 * Server action: src/lib/actions/quality-heuristic-config.ts.
 * Cron BullMQ no worker: aplicarAgendamentoAutoHeuristic re-agenda em
 * <= 60s via JOB_CONFIG_CHECK.
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
          Auditoria automática
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Frequência com que o worker varre as avaliações pendentes (canais
          Agente Nex e Playground) e aplica a classificação heurística. Sem
          custo de LLM — apenas regex e padrões locais. O ciclo dispara
          quantas vezes for necessário; só processa o que está como{" "}
          <strong>Pendente</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label
            htmlFor="auto-heuristic-minutes"
            className="text-sm font-medium"
          >
            Intervalo entre execuções (em minutos)
          </Label>
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
            Aceita de <strong>{MIN}</strong> a <strong>{MAX}</strong>{" "}
            minutos (24 horas).
          </p>
        </div>

        {/* Conversor dinâmico */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Equivalência
          </div>
          <div className="mt-1 font-medium">
            {valid ? formatEquivalencia(value) : "valor inválido"}
          </div>
          {dirty && valid && (
            <div className="mt-1 text-xs text-amber-400">
              Você tem alterações não salvas. Clique em &quot;Salvar&quot;
              para aplicar.
            </div>
          )}
          {!dirty && (
            <div className="mt-1 text-xs text-muted-foreground">
              Configuração atual sincronizada com o banco.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
