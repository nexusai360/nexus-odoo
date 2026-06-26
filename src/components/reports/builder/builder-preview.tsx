"use client";

// src/components/reports/builder/builder-preview.tsx
// F2b , Preview ao vivo da ficha em construcao. Valida a estrutura localmente
// (barato) e, quando valida, pede ao servidor a resolucao das secoes
// (previsualizarSecoes, sem persistir) e desenha via ReportRenderer. Os dois
// niveis (validacao local + resolucao no server) evitam ir ao banco a cada
// tecla e dao feedback imediato de ficha incompleta.
import { useState, useEffect } from "react";
import { LayoutDashboard, AlertTriangle } from "lucide-react";
import { ReportRenderer } from "./report-renderer";
import { previsualizarSecoes } from "@/lib/actions/builder";
import { validarReportEntry } from "@/lib/reports/builder/report-entry-schema";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

type EstadoPreview = "vazio" | "invalida" | "carregando" | "ok" | "erro";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      {children}
    </div>
  );
}

export function BuilderPreview({ ficha }: { ficha: BuilderReportEntry | null }) {
  const [estado, setEstado] = useState<EstadoPreview>("vazio");
  const [dados, setDados] = useState<Record<string, SecaoResolvida>>({});

  useEffect(() => {
    if (!ficha) {
      setEstado("vazio");
      return;
    }
    const v = validarReportEntry(ficha);
    if (!v.ok || v.entry.secoes.length === 0) {
      setEstado("invalida");
      return;
    }
    let cancelado = false;
    setEstado("carregando");
    previsualizarSecoes(ficha)
      .then((r) => {
        if (cancelado) return;
        if (r.tipo === "ok") {
          setDados(r.dados);
          setEstado("ok");
        } else {
          setEstado(r.tipo === "invalida" ? "invalida" : "erro");
        }
      })
      .catch(() => {
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [ficha]);

  if (estado === "vazio") {
    return (
      <Moldura>
        <LayoutDashboard className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="max-w-xs text-sm">
          O preview do relatorio aparece aqui conforme voce conversa com o construtor.
        </p>
      </Moldura>
    );
  }

  if (estado === "invalida") {
    return (
      <Moldura>
        <AlertTriangle className="h-9 w-9 text-amber-500" aria-hidden />
        <p className="max-w-xs text-sm">
          Ainda nao da para visualizar: o relatorio precisa de ao menos uma secao
          valida. Continue a conversa para completar.
        </p>
      </Moldura>
    );
  }

  if (estado === "erro") {
    return (
      <Moldura>
        <AlertTriangle className="h-9 w-9 text-red-500" aria-hidden />
        <p className="max-w-xs text-sm">
          Nao consegui montar o preview agora. Tente ajustar o pedido na conversa.
        </p>
      </Moldura>
    );
  }

  if (estado === "carregando") {
    return (
      <div className="space-y-3 p-6" aria-busy="true">
        <div className="h-7 w-2/5 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-muted/70" />
        <div className="mt-4 h-48 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // estado === "ok"
  return (
    <div className="h-full overflow-y-auto p-6">
      <ReportRenderer entry={ficha!} dados={dados} />
    </div>
  );
}
