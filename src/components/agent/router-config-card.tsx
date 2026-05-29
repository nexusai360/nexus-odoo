"use client";

/**
 * R2-ctx: bloco "Configuração de Router" da Configuração do Agente Nex.
 * Dois sub-blocos:
 *  - Construção da pergunta (Camada 2): modelo barato que reformula a pergunta
 *    com contexto quando o embedding não classifica. Provedor/Modelo/Chave.
 *  - Embeddings: provedor/modelo (só modelos de embedding) + chave. A credencial
 *    é a fonte única compartilhada com o RAG (setEmbeddingCredential).
 * As pílulas do bloco gatilham a Construção da pergunta (routerReformCheckpoint);
 * o embedding é o motor base (governado no Monitoramento).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Route } from "lucide-react";
import { toast } from "sonner";
import { ResourceCard } from "@/components/agent/resource-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ApiKeySelect, type ApiKeyOption } from "@/components/ui/api-key-select";
import {
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import {
  PROVIDER_META,
  listEmbeddingModels,
  modelDescription,
  type ModelEntry,
} from "@/lib/agent/llm/catalog";
import { updateRouterConfig } from "@/lib/actions/agent-config";
import { setEmbeddingCredential } from "@/lib/actions/router-embedding-credential";
import type { LlmProvider } from "@/lib/agent/llm/types";

const EMBEDDING_PROVIDER: LlmProvider = "openai";
const ROUTER_PANEL_HREF = "/agente/monitoramento/router";

interface RouterConfigCardProps {
  initial: {
    routerReformCheckpoint: CheckpointState;
    routerReformProvider: string | null;
    routerReformModel: string | null;
    routerReformCredentialId: string | null;
    routerReformNPairs: number;
    routerEmbeddingModel: string | null;
  };
  /** Provedores de chat com credencial cadastrada -> opções de chave (com sufixo). */
  reformProviders: LlmProvider[];
  credentialsByProvider: Record<string, ApiKeyOption[]>;
  chatModelsByProvider: Record<string, ModelEntry[]>;
  /** Embeddings (fonte única do RAG): chave ativa + opções. */
  embeddingActiveId: string | null;
  embeddingOptions: ApiKeyOption[];
}

function modelOptions(models: ModelEntry[]) {
  return models.map((m) => ({ value: m.id, label: m.label, notes: modelDescription(m) }));
}

export function RouterConfigCard({
  initial,
  reformProviders,
  credentialsByProvider,
  chatModelsByProvider,
  embeddingActiveId,
  embeddingOptions,
}: RouterConfigCardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const [cp, setCp] = useState<CheckpointState>(initial.routerReformCheckpoint);
  const [reformProvider, setReformProvider] = useState<LlmProvider | "">(
    (initial.routerReformProvider as LlmProvider | null) ?? reformProviders[0] ?? "",
  );
  const [reformModel, setReformModel] = useState<string>(initial.routerReformModel ?? "");
  const [reformCredId, setReformCredId] = useState<string>(initial.routerReformCredentialId ?? "");
  const [embeddingModel, setEmbeddingModel] = useState<string>(
    initial.routerEmbeddingModel ?? "text-embedding-3-large",
  );

  const chatModels = reformProvider ? chatModelsByProvider[reformProvider] ?? [] : [];
  const reformCreds = reformProvider ? credentialsByProvider[reformProvider] ?? [] : [];
  const embeddingModels = listEmbeddingModels(EMBEDDING_PROVIDER);

  function persist(next: Partial<RouterConfigCardProps["initial"]>) {
    setPending(true);
    startTransition(async () => {
      const r = await updateRouterConfig({
        routerReformCheckpoint: next.routerReformCheckpoint ?? cp,
        routerReformProvider: next.routerReformProvider ?? reformProvider ?? null,
        routerReformModel: next.routerReformModel ?? reformModel ?? null,
        routerReformCredentialId:
          next.routerReformCredentialId !== undefined
            ? next.routerReformCredentialId
            : reformCredId || null,
        routerReformNPairs: initial.routerReformNPairs,
        routerEmbeddingModel: next.routerEmbeddingModel ?? embeddingModel ?? null,
      });
      setPending(false);
      if (!r.success) {
        toast.error(r.error ?? "Erro ao salvar configuração do router.");
        router.refresh();
        return;
      }
      toast.success("Configuração do router atualizada.");
      router.refresh();
    });
  }

  function persistEmbeddingCredential(credentialId: string) {
    setPending(true);
    startTransition(async () => {
      const r = await setEmbeddingCredential({ credentialId });
      setPending(false);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao trocar credencial de embedding.");
        router.refresh();
        return;
      }
      toast.success("Credencial de embedding atualizada.");
      router.refresh();
    });
  }

  return (
    <ResourceCard
      id="config-router"
      collapsible
      defaultCollapsed={cp === "OFF"}
      icon={<Route className={`h-4 w-4 ${checkpointIconClass(cp)}`} aria-hidden />}
      title="Configuração de Router"
      subtitle="Quando o embedding não classifica a pergunta (fallback), um modelo barato a reescreve com contexto e o router tenta de novo. As pílulas controlam essa reformulação; o embedding é sempre usado pelo router."
      checkpoint={cp}
      onCheckpointChange={(next) => {
        setCp(next);
        persist({ routerReformCheckpoint: next });
      }}
      loading={pending}
      ariaLabel="Estado da construção da pergunta do router"
    >
      <div className="flex flex-col gap-6">
        {/* Sub-bloco: Construção da pergunta */}
        <section className="flex flex-col gap-3 border-l-2 border-violet-500/30 pl-3">
          <h4 className="text-sm font-medium text-foreground">Construção da pergunta</h4>
          <p className="text-xs text-muted-foreground">
            Modelo barato que reescreve a pergunta com os últimos pares quando o embedding cai em fallback.
          </p>
          {reformProviders.length === 0 ? (
            <NoKeysHint />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldBlock label="Provedor">
                <CustomSelect
                  aria-label="Provedor da construção da pergunta"
                  value={reformProvider}
                  onChange={(v) => {
                    const p = v as LlmProvider;
                    setReformProvider(p);
                    const firstModel = (chatModelsByProvider[p] ?? [])[0]?.id ?? "";
                    const firstCred = credentialsByProvider[p]?.[0]?.id ?? "";
                    setReformModel(firstModel);
                    setReformCredId(firstCred);
                    persist({
                      routerReformProvider: p,
                      routerReformModel: firstModel,
                      routerReformCredentialId: firstCred || null,
                    });
                  }}
                  options={reformProviders.map((p) => ({ value: p, label: PROVIDER_META[p].label }))}
                />
              </FieldBlock>
              <FieldBlock label="Modelo">
                <SearchableSelect
                  value={reformModel}
                  onChange={(v) => {
                    setReformModel(v);
                    persist({ routerReformModel: v });
                  }}
                  options={modelOptions(chatModels)}
                  placeholder="Selecionar modelo"
                  searchPlaceholder="Buscar modelo…"
                />
              </FieldBlock>
              <FieldBlock label="Chave de API">
                <ApiKeySelect
                  aria-label="Chave da construção da pergunta"
                  value={reformCredId}
                  onChange={(v) => {
                    setReformCredId(v);
                    persist({ routerReformCredentialId: v || null });
                  }}
                  options={reformCreds}
                  provider={reformProvider || "openai"}
                  providerLabel={reformProvider ? PROVIDER_META[reformProvider as LlmProvider].label : "OpenAI"}
                />
              </FieldBlock>
            </div>
          )}
        </section>

        {/* Sub-bloco: Embeddings */}
        <section className="flex flex-col gap-3 border-l-2 border-violet-500/30 pl-3">
          <h4 className="text-sm font-medium text-foreground">Embeddings</h4>
          <p className="text-xs text-muted-foreground">
            Modelo e chave de embedding do router. A credencial é a mesma usada pela base de conhecimento (RAG).
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldBlock label="Provedor">
              <CustomSelect
                aria-label="Provedor de embeddings"
                value={EMBEDDING_PROVIDER}
                onChange={() => undefined}
                options={[{ value: EMBEDDING_PROVIDER, label: PROVIDER_META[EMBEDDING_PROVIDER].label }]}
              />
            </FieldBlock>
            <FieldBlock label="Modelo">
              <SearchableSelect
                value={embeddingModel}
                onChange={(v) => {
                  setEmbeddingModel(v);
                  persist({ routerEmbeddingModel: v });
                }}
                options={modelOptions(embeddingModels)}
                placeholder="Selecionar modelo"
                searchPlaceholder="Buscar modelo…"
              />
            </FieldBlock>
            <FieldBlock label="Chave de API">
              <ApiKeySelect
                aria-label="Chave de embeddings"
                value={embeddingActiveId ?? ""}
                onChange={persistEmbeddingCredential}
                options={embeddingOptions}
                provider={EMBEDDING_PROVIDER}
                providerLabel={PROVIDER_META[EMBEDDING_PROVIDER].label}
              />
            </FieldBlock>
          </div>
        </section>

        {/* Atalho para o painel do router */}
        <Link
          href={ROUTER_PANEL_HREF}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Acessar painel do router
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </ResourceCard>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function NoKeysHint() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
      Nenhuma chave de API cadastrada. Cadastre uma em Chaves de API para habilitar a construção da pergunta.
    </div>
  );
}
