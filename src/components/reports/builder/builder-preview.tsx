"use client";

// src/components/reports/builder/builder-preview.tsx
// F6 , Canvas de preview ao vivo. Valida a estrutura localmente (barato) e, quando
// valida, pede ao servidor a resolucao das secoes (previsualizarSecoes, sem
// persistir) e desenha via ReportRenderer. O botao de ampliar NAO abre modal:
// ele ESCONDE a conversa (relatorio ocupa tudo); o X traz a conversa de volta
// (controlado pelo workspace via `cheia`/`onToggleCheia`). Sem barra de filtros.
import { useState, useEffect } from "react";
import { LayoutDashboard, AlertTriangle, Eye, Maximize2, Minimize2 } from "lucide-react";
import { ReportRenderer, type EditavelFicha } from "./report-renderer";
import { previsualizarSecoes } from "@/lib/actions/builder";
import { validarReportEntry } from "@/lib/reports/builder/report-entry-schema";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

type EstadoPreview = "vazio" | "invalida" | "carregando" | "ok" | "erro";

function Moldura({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground/60 shadow-sm">
        {icon}
      </div>
      <div className="max-w-sm space-y-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function BuilderPreview({
  ficha,
  editavel,
  cheia = false,
  onToggleCheia,
}: {
  ficha: BuilderReportEntry | null;
  editavel?: EditavelFicha;
  /** Modo expandido (conversa escondida) , controlado pelo workspace. */
  cheia?: boolean;
  onToggleCheia?: () => void;
}) {
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
    previsualizarSecoes(ficha, {})
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

  return (
    <div className="flex h-full flex-col">
      {/* Barra do canvas , altura fixa (h-11) casada com o header da Conversa. */}
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-5 text-xs font-medium text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Pre-visualizacao
          {estado === "ok" && ficha ? (
            <span className="ml-1 truncate text-foreground">· {ficha.titulo}</span>
          ) : null}
        </div>
        {estado === "ok" && ficha && onToggleCheia ? (
          <button
            type="button"
            onClick={onToggleCheia}
            aria-label={cheia ? "Mostrar a conversa" : "Esconder a conversa (ampliar)"}
            title={cheia ? "Mostrar a conversa" : "Ampliar (esconder conversa)"}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
          >
            {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {/* Area do relatorio , SEM canvas/zoom/pan. So rolagem vertical, pagina limpa. */}
      <div
        className={
          estado === "ok"
            ? "relative flex-1 overflow-y-auto bg-background"
            : "relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px]"
        }
      >
        {estado === "vazio" ? (
          <Moldura icon={<LayoutDashboard className="h-8 w-8" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              O preview do relatorio aparece aqui
            </p>
            <p className="text-xs leading-relaxed">
              Converse com o construtor a esquerda. Conforme voce descreve o que
              quer, o relatorio vai sendo montado e renderizado nesta area.
            </p>
          </Moldura>
        ) : null}

        {estado === "invalida" ? (
          <Moldura icon={<AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              Ainda nao da para visualizar
            </p>
            <p className="text-xs leading-relaxed">
              O relatorio precisa de ao menos uma secao valida. Continue a conversa
              para completar.
            </p>
          </Moldura>
        ) : null}

        {estado === "erro" ? (
          <Moldura icon={<AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />}>
            <p className="text-sm font-medium text-foreground">
              Nao consegui montar o preview agora
            </p>
            <p className="text-xs leading-relaxed">Tente ajustar o pedido na conversa.</p>
          </Moldura>
        ) : null}

        {estado === "carregando" ? (
          <div className="mx-auto max-w-4xl p-6" aria-busy="true">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="h-7 w-2/5 animate-pulse rounded-lg bg-muted" />
              <div className="mt-2 h-4 w-3/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-5 h-56 w-full animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        ) : null}

        {estado === "ok" && ficha ? (
          <div className="mx-auto w-full max-w-5xl px-5 py-6">
            <ReportRenderer entry={ficha} dados={dados} editavel={editavel} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
