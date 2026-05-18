"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Formata uma data como tempo relativo em pt-BR ("há 8 min", "há 2 h").
 * `agora` é injetável para testes.
 */
export function tempoRelativo(data: Date, agora: Date = new Date()): string {
  const segs = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (segs < 0) return "agora mesmo";
  if (segs < 60) return "agora mesmo";
  const min = Math.floor(segs / 60);
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

interface FreshnessIndicatorProps {
  /** Momento da última sincronização; `null` quando o fato ainda não rodou. */
  freshness: Date | null;
}

/**
 * Selo de frescor do dado — exibe o tempo relativo desde a última sync
 * ("Atualizado há 8 min") e o horário exato no `title`. Atualiza-se sozinho
 * a cada 30 s para não "envelhecer" em silêncio na tela.
 */
export function FreshnessIndicator({ freshness }: FreshnessIndicatorProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!freshness) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [freshness]);

  return (
    <p
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={
        freshness
          ? `Última sincronização: ${freshness.toLocaleString("pt-BR")}`
          : undefined
      }
    >
      <Clock className="size-3.5" aria-hidden />
      {freshness
        ? `Atualizado ${tempoRelativo(freshness)}`
        : "Relatório ainda sendo preparado"}
    </p>
  );
}
