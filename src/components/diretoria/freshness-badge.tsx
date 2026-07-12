"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, RefreshCw } from "lucide-react";

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
 * pede os dados novos ao servidor num soft-refresh: as abas e o estado do cliente ficam de
 * pé, e o conteúdo só esmaece de leve enquanto o servidor responde (`data-atualizando` no
 * <html>, estilizado no globals.css). Em um piscar de olhos os números trocam.
 *
 * O usuário nunca vê tela zerada: a troca do cache no worker é atômica (cada fato é
 * reconstruído dentro de uma transação), então até o commit a leitura enxerga o dado antigo.
 */
export function FreshnessBadge({ iso }: { iso: string | null }) {
  const router = useRouter();
  const [agora, setAgora] = useState<number | null>(null);
  const [atualizando, startTransition] = useTransition();
  // O carimbo que já disparou refresh, para não pedir a mesma atualização duas vezes.
  const jaAtualizado = useRef<string | null>(null);

  // Relógio relativo.
  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Marca o <html> enquanto o servidor recalcula, para o conteúdo esmaecer (globals.css).
  useEffect(() => {
    const raiz = document.documentElement;
    if (atualizando) raiz.dataset.atualizando = "1";
    else delete raiz.dataset.atualizando;
    return () => {
      delete raiz.dataset.atualizando;
    };
  }, [atualizando]);

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

  if (atualizando) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Atualizando…
      </span>
    );
  }

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
