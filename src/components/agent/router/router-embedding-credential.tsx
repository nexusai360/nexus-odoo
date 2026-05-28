"use client";

/**
 * R1 router de catalogo: gerenciamento da credencial OpenAI usada pelos
 * embeddings (router + RAG).
 *
 * Restrito ao provider 'openai' por enquanto. Quando nada esta configurado
 * mas ha pelo menos uma chave OpenAI cadastrada, mostra alerta amarelo +
 * botao "Usar esta agora" para auto-configurar.
 */

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  setEmbeddingCredential,
  type EmbeddingCredentialStatus,
} from "@/lib/actions/router-embedding-credential";

interface Props {
  initial: EmbeddingCredentialStatus;
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function RouterEmbeddingCredential({ initial }: Props) {
  const [state, setState] = useState<EmbeddingCredentialStatus>(initial);
  const [selectedId, setSelectedId] = useState<string>(
    initial.active?.id ?? initial.options[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    msg: string;
  } | null>(null);

  const apply = (credentialId: string) => {
    if (!credentialId) {
      setFeedback({
        type: "error",
        msg: "Selecione uma credencial antes de salvar.",
      });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const res = await setEmbeddingCredential({ credentialId });
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          active: res.active,
          needsBootstrap: false,
        }));
        setSelectedId(res.active.id);
        setFeedback({ type: "ok", msg: "Credencial atualizada." });
      } else {
        setFeedback({ type: "error", msg: res.error });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-violet-400" />
          Credencial OpenAI para embeddings
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Chave usada pelo `embed()` do agente (router e RAG). Por enquanto
          apenas provider <strong>OpenAI</strong>. Para cadastrar uma chave
          nova, use o menu <em>Chaves de API</em>.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.options.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1 text-amber-100">
              <p className="font-medium">
                Nenhuma chave OpenAI cadastrada.
              </p>
              <p className="text-xs text-amber-200/80">
                Acesse <em>Agente Nex → Chaves de API</em> e adicione uma
                credencial do provider <strong>openai</strong>. Depois volte
                aqui para selecionar.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Estado atual */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                {state.active ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>
                      Ativa: <strong>{state.active.label}</strong>{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        ····{state.active.last4}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <span className="text-amber-100">
                      Nenhuma credencial configurada. O router e o RAG
                      lancam erro <em>EmbeddingUnavailable</em>.
                    </span>
                  </>
                )}
              </div>
              {state.active && (
                <Badge
                  variant="outline"
                  className="border-border bg-background text-[11px]"
                >
                  OpenAI
                </Badge>
              )}
            </div>

            {state.needsBootstrap && state.options.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Voce ja tem chave(s) OpenAI cadastrada(s), mas nenhuma
                  esta configurada para os embeddings. Selecione abaixo e
                  clique em &quot;Usar esta&quot;.
                </span>
              </div>
            )}

            {/* Selecao + acao */}
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="cred-select">
                Credencial OpenAI
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <CustomSelect
                  value={selectedId}
                  onChange={setSelectedId}
                  options={state.options.map((c) => ({
                    value: c.id,
                    label: c.label,
                    description: `····${c.last4} · cadastrada em ${dateFmt.format(c.createdAt)}`,
                  }))}
                  placeholder="Selecione a credencial"
                />
                <Button
                  type="button"
                  onClick={() => apply(selectedId)}
                  disabled={
                    pending ||
                    !selectedId ||
                    selectedId === state.active?.id
                  }
                >
                  {pending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {state.active ? "Trocar credencial" : "Usar esta"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A chave selecionada substitui imediatamente o uso atual
                (proximas chamadas de embedding usam ela).
              </p>
            </div>

            {feedback && (
              <p
                className={
                  feedback.type === "ok"
                    ? "text-xs text-emerald-400"
                    : "text-xs text-red-400"
                }
              >
                {feedback.msg}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
