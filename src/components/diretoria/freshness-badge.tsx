"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

/** De quanto em quanto tempo se pergunta ao servidor se o ciclo terminou. */
const INTERVALO_CHECAGEM_MS = 20_000;

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
 * Indicador "atualizado há X" das telas da Diretoria, e o gatilho da atualização automática.
 *
 * O endpoint de freshness devolve o carimbo do último ciclo CONCLUÍDO (ingestão mais
 * reconstrução dos fatos, ver lib/diretoria/freshness.ts). Quando esse carimbo muda, a tela
 * pede os dados novos ao servidor num soft-refresh COMPLETAMENTE SILENCIOSO: nada pisca, nada
 * esmaece, nenhum spinner. O `router.refresh()` do Next só re-renderiza os Server Components e
 * reconcilia , NÃO desmonta os client components, então abas, modais, filtros, ordenação,
 * larguras de coluna, scroll e qualquer análise em andamento ficam INTACTOS. Os números só
 * trocam de valor no lugar, sem interferir no que o usuário está fazendo (decisão do dono
 * 2026-07-24: atualização de bastidores, zero feedback de carregamento).
 *
 * O usuário nunca vê tela zerada: a troca do cache no worker é atômica (cada fato é
 * reconstruído dentro de uma transação), então até o commit a leitura enxerga o dado antigo.
 * O startTransition mantém a página interativa durante o recálculo (refresh não-bloqueante).
 */
export function FreshnessBadge({ iso }: { iso: string | null }) {
  const router = useRouter();
  const [agora, setAgora] = useState<number | null>(null);
  // startTransition => refresh não-bloqueante (a página segue interativa); o isPending é
  // deliberadamente IGNORADO na UI para não haver feedback visual algum.
  const [, startTransition] = useTransition();
  // O carimbo que já disparou refresh, para não pedir a mesma atualização duas vezes.
  const jaAtualizado = useRef<string | null>(null);

  // Relógio relativo.
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Polling do ciclo do worker: refresh só quando um ciclo NOVO terminou.
  useEffect(() => {
    let vivo = true;
    const checar = async () => {
      try {
        const r = await fetch("/api/diretoria/freshness", { cache: "no-store" });
        if (!r.ok) return;
        const { iso: novo } = (await r.json()) as { iso: string | null };
        if (!vivo || !novo || novo === iso || novo === jaAtualizado.current) return;
        jaAtualizado.current = novo;
        startTransition(() => {
          router.refresh();
        });
      } catch {
        // silencioso: rede instável não deve poluir a UI
      }
    };
    const t = setInterval(checar, INTERVALO_CHECAGEM_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [router, iso]);

  if (!iso) return null;
  const titulo = new Date(iso).toLocaleString("pt-BR");

  // Sempre o mesmo badge passivo (nunca "Atualizando…"): a atualização é de bastidores.
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
