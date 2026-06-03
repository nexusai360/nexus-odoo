"use client";

/**
 * RouterDecisionDrilldown , painel inline expansivel sob a linha clicada da
 * tabela de Requisicoes do Router. Mostra o veredito do roteamento
 * (concordante/discordancia) com explicacao, os scores por dominio, o que o
 * router escolheu vs a tool de fato chamada, fallback/reformulacao, e a
 * resposta final do agente. Busca o detalhe lazy via server action.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchRouterDecisionDetail } from "@/lib/actions/router-decisions";
import type { RouterDecisionDetail } from "@/lib/agent/router/queries";
import { MarkdownSnapshot } from "@/components/agent/monitoramento/markdown-snapshot";

const DOMAIN_DISPLAY: Record<string, string> = {
  caminho3: "BI avançado",
  "dominios-vazios": "cobertura",
  chat: "chat",
};
function displayDomain(d: string): string {
  return DOMAIN_DISPLAY[d] ?? d;
}

export function RouterDecisionDrilldown({ id }: { id: string }) {
  const [detail, setDetail] = useState<RouterDecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetchRouterDecisionDetail(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando detalhes…
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Não foi possível carregar os detalhes desta decisão.
      </div>
    );
  }

  const semTool = detail.toolsActuallyUsed.length === 0;
  const verdito = detail.discordante
    ? "discordancia"
    : semTool
      ? "chat"
      : "concordante";

  const maxScore = detail.scores[0]?.score ?? 1;

  return (
    // Renderizado FORA do scroller da tabela (largura normal do card), entao o
    // texto quebra linha naturalmente com break-words , sem corte nem rolagem.
    <div className="w-full space-y-5 [overflow-wrap:anywhere]">
      {/* Veredito , banner em BLOCO (a frase e' <p> de bloco, quebra linha
          dentro da caixa, que cresce na vertical; ocupa a largura toda). */}
      {verdito === "discordancia" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Roteamento divergente (oportunidade de calibragem)
          </p>
          <p className="text-sm text-muted-foreground">
            O agente usou{" "}
            <strong>{detail.toolsDomains.map(displayDomain).join(", ")}</strong>,
            fora do que o router ofertou (
            {detail.pickedDomains.length === 0
              ? "fallback"
              : detail.pickedDomains.map(displayDomain).join(", ")}
            ). Em modo <strong>{detail.mode}</strong> não bloqueia a resposta; só
            sinaliza que, com o router filtrando, esse domínio poderia faltar.
            Calibrar o vocabulário do domínio resolve.
          </p>
        </div>
      ) : verdito === "chat" ? (
        <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <MessageSquare className="h-4 w-4 shrink-0" />
            Turno conversacional (sem tool)
          </p>
          <p className="text-sm text-muted-foreground">
            O agente respondeu sem acionar nenhuma ferramenta (saudação,
            follow-up ou pedido de esclarecimento). O router registrou a decisão,
            mas não houve tool a comparar.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Roteamento concordante
          </p>
          <p className="text-sm text-muted-foreground">
            O router ofereceu o domínio que o agente de fato usou (
            {detail.toolsDomains.map(displayDomain).join(", ")}). Com o router
            ativo, a IA teria recebido a ferramenta correta.
          </p>
        </div>
      )}

      {/* Router escolheu vs Tool chamada */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Router escolheu
          </p>
          <div className="flex flex-wrap gap-1">
            {detail.pickedDomains.length === 0 ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                fallback{detail.fallbackReason ? ` (${detail.fallbackReason})` : ""}
              </Badge>
            ) : (
              detail.pickedDomains.map((d) => (
                <Badge key={d} variant="outline" className="font-mono text-[11px]">
                  {displayDomain(d)}
                </Badge>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Tool de fato chamada
          </p>
          <div className="flex flex-wrap gap-1">
            {semTool ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                chat
              </Badge>
            ) : (
              detail.toolsActuallyUsed.map((t, i) => (
                <Badge
                  key={`${t}-${i}`}
                  variant="outline"
                  className="font-mono text-[11px]"
                >
                  {t}
                </Badge>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scores por dominio */}
      {detail.scores.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">
            Similaridade por domínio
            <span className="ml-2 font-normal text-muted-foreground">
              (threshold {detail.threshold !== null ? detail.threshold.toFixed(2) : "?"})
            </span>
          </p>
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
            Proximidade (cosseno) da pergunta com cada domínio. O router oferta
            os que passam do threshold (barras em roxo). Vale o ranking, não o
            valor absoluto.
          </p>
          <div className="mx-auto max-w-2xl space-y-1">
            {detail.scores.map((s) => {
              const passou =
                detail.threshold !== null && s.score >= detail.threshold;
              const escolhido = detail.pickedDomains.includes(s.domain);
              return (
                <div
                  key={s.domain}
                  className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs"
                >
                  <span className="truncate font-mono text-muted-foreground">
                    {displayDomain(s.domain)}
                  </span>
                  <div className="relative h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded",
                        escolhido ? "bg-violet-500" : "bg-muted-foreground/30",
                      )}
                      style={{ width: `${(s.score / maxScore) * 100}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-right tabular-nums",
                      passou ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.score.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reformulacao (R2-ctx) */}
      {detail.usedReformulation && detail.reformulatedQuestion && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            Pergunta reformulada (Construção de pergunta)
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium">Original:</span> {detail.userQuestion}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium">Reformulada:</span>{" "}
            {detail.reformulatedQuestion}
          </p>
        </div>
      )}

      {/* Metadados */}
      <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Similaridade top:{" "}
          {detail.topScore !== null ? detail.topScore.toFixed(2) : "-"}
        </span>
        <span>
          Tempo do pick:{" "}
          {detail.pickDurationMs !== null ? `${detail.pickDurationMs}ms` : "-"}
        </span>
        <span>Versão: {detail.routerVersion}</span>
        <span>Modo: {detail.mode}</span>
        {detail.originalFallback && <span>Camada 1 caiu em fallback</span>}
      </div>

      {/* Resposta final do agente */}
      {detail.finalAnswer && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Resposta do agente
          </p>
          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <MarkdownSnapshot content={detail.finalAnswer} />
          </div>
        </div>
      )}
    </div>
  );
}
