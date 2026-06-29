"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

/**
 * Indicador "atualizado há X" das telas da Diretoria. Recalcula o relativo a cada
 * 30s e, a cada 60s, consulta o endpoint de freshness: se o ciclo de sync nativo
 * gravou um timestamp novo, faz um soft-refresh (atualiza os dados da tela sem o
 * usuário precisar recarregar e preservando as abas/estado client).
 */
export function FreshnessBadge({ iso }: { iso: string | null }) {
  const router = useRouter();
  const [agora, setAgora] = useState<number | null>(null);

  // Relógio relativo.
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Polling do sync nativo: refresh só quando há timestamp novo.
  useEffect(() => {
    let vivo = true;
    const checar = async () => {
      try {
        const r = await fetch("/api/diretoria/freshness", { cache: "no-store" });
        if (!r.ok) return;
        const { iso: novo } = (await r.json()) as { iso: string | null };
        if (vivo && novo && novo !== iso) {
          router.refresh();
        }
      } catch {
        // silencioso: rede instável não deve poluir a UI
      }
    };
    const t = setInterval(checar, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [router, iso]);

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
