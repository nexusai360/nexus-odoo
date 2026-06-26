"use client";

// src/components/agent/builder-model-card.tsx
// G1 (v2) , Card de modelo do agente construtor de relatorios (F6), na tela JA
// EXISTENTE de configuracao do agente. Espelha EXATAMENTE o padrao do bloco
// "Configuracao do Router": Provedor / Modelo (com busca) / Chave de API, em
// linha; provedores so os que tem chave cadastrada; modelos so os que usam
// ferramentas (exclui embedding/audio); chave com atalho "Nova chave". Sem botao
// salvar , cada mudanca aplica na hora e mostra um toast (igual ao router).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { ResourceCard } from "@/components/agent/resource-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ApiKeySelect, type ApiKeyOption } from "@/components/ui/api-key-select";
import { TierBadge } from "@/components/ui/tier-badge";
import {
  PROVIDER_META,
  modelDescription,
  type ModelEntry,
} from "@/lib/agent/llm/catalog";
import { salvarModeloConstrutor } from "@/lib/actions/builder-config";
import type { LlmProvider } from "@/lib/agent/llm/types";

interface BuilderModelCardProps {
  initial: { provider: string; model: string; credentialId: string | null };
  /** Provedores com chave de API cadastrada. */
  providers: LlmProvider[];
  credentialsByProvider: Record<string, ApiKeyOption[]>;
  modelsByProvider: Record<string, ModelEntry[]>;
}

/** So modelos que usam ferramentas: exclui embedding e audio (transcricao). */
function usaFerramentas(m: ModelEntry): boolean {
  return m.use !== "embedding" && m.use !== "áudio" && !m.audio;
}

function modelOptions(models: ModelEntry[]) {
  return models.map((m) => ({
    value: m.id,
    label: m.label,
    notes: modelDescription(m),
    endAdornment: <TierBadge tier={m.tier} />,
  }));
}

export function BuilderModelCard({
  initial,
  providers,
  credentialsByProvider,
  modelsByProvider,
}: BuilderModelCardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [provider, setProvider] = useState<LlmProvider | "">(
    (initial.provider as LlmProvider) || providers[0] || "",
  );
  const [model, setModel] = useState(initial.model);
  const [credId, setCredId] = useState(initial.credentialId ?? "");

  const modelos = provider
    ? (modelsByProvider[provider] ?? []).filter(usaFerramentas)
    : [];
  const creds = provider ? credentialsByProvider[provider] ?? [] : [];

  function persist(next: { provider?: string; model?: string; credentialId?: string | null }) {
    startTransition(async () => {
      const r = await salvarModeloConstrutor({
        provider: next.provider ?? provider,
        model: next.model ?? model,
        credentialId:
          next.credentialId !== undefined ? next.credentialId : credId || null,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar o modelo do construtor.");
        router.refresh();
        return;
      }
      toast.success("Modelo do construtor atualizado.");
      router.refresh();
    });
  }

  return (
    <ResourceCard
      id="config-construtor-modelo"
      collapsible
      hideCheckpoint
      checkpoint="PRODUCTION"
      onCheckpointChange={() => undefined}
      icon={<Wrench className="h-4 w-4 text-violet-500" aria-hidden />}
      title="Configuração do LLM"
      subtitle="Modelo que monta os relatorios a partir da conversa. Independente do modelo de producao do Nex. So aparecem modelos capazes de usar ferramentas."
      loading={false}
      ariaLabel="Modelo do construtor de relatorios"
    >
      <section className="flex flex-col gap-3">
        {providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            Nenhuma chave de API cadastrada. Cadastre uma em Chaves de API para
            habilitar o construtor.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldBlock label="Provedor">
              <CustomSelect
                aria-label="Provedor do construtor"
                value={provider}
                onChange={(v) => {
                  const p = v as LlmProvider;
                  setProvider(p);
                  const primeiroModelo =
                    (modelsByProvider[p] ?? []).filter(usaFerramentas)[0]?.id ?? "";
                  const primeiraChave = credentialsByProvider[p]?.[0]?.id ?? "";
                  setModel(primeiroModelo);
                  setCredId(primeiraChave);
                  persist({
                    provider: p,
                    model: primeiroModelo,
                    credentialId: primeiraChave || null,
                  });
                }}
                options={providers.map((p) => ({ value: p, label: PROVIDER_META[p].label }))}
              />
            </FieldBlock>
            <FieldBlock label="Modelo">
              <SearchableSelect
                value={model}
                onChange={(v) => {
                  setModel(v);
                  persist({ model: v });
                }}
                options={modelOptions(modelos)}
                placeholder="Selecionar modelo"
                searchPlaceholder="Buscar modelo…"
              />
            </FieldBlock>
            <FieldBlock label="Chave de API">
              <ApiKeySelect
                aria-label="Chave do construtor"
                value={credId}
                onChange={(v) => {
                  setCredId(v);
                  persist({ credentialId: v || null });
                }}
                options={creds}
                provider={provider || "openai"}
                providerLabel={
                  provider ? PROVIDER_META[provider as LlmProvider].label : "OpenAI"
                }
              />
            </FieldBlock>
          </div>
        )}
      </section>
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
