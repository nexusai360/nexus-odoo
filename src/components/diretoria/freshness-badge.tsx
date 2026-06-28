"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function tempoRelativo(iso: string, agora: number): string {
  const diffMs = agora - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

/** Indicador "atualizado há X" das telas da Diretoria. Auto-atualiza a cada 30s. */
export function FreshnessBadge({ iso }: { iso: string | null }) {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!iso) return null;
  const titulo = new Date(iso).toLocaleString("pt-BR");

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`Última sincronização: ${titulo}`}
    >
      <Clock className="h-3.5 w-3.5" />
      {agora ? `Atualizado ${tempoRelativo(iso, agora)}` : "Atualizado"}
    </span>
  );
}
