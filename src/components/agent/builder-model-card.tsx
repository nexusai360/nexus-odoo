"use client";

// src/components/agent/builder-model-card.tsx
// G1 , Card de modelo do agente construtor de relatorios (F6), na tela JA
// EXISTENTE de configuracao do agente. NAO e uma tela propria: e mais um card no
// padrao dos seletores de modelo dedicados (audio/imagem). Grava
// builderModelProvider/builderModelId em AgentSettings via server action.
import { useState } from "react";
import { FileBarChart, Loader2, Check } from "lucide-react";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { salvarModeloConstrutor } from "@/lib/actions/builder-config";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

export interface BuilderModelOption {
  value: string;
  label: string;
}

interface BuilderModelCardProps {
  initialProvider: string;
  initialModel: string;
  providers: string[];
  modelsByProvider: Record<string, BuilderModelOption[]>;
}

export function BuilderModelCard({
  initialProvider,
  initialModel,
  providers,
  modelsByProvider,
}: BuilderModelCardProps) {
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);

  const providerOptions: SelectOption[] = providers.map((p) => ({
    value: p,
    label: PROVIDER_LABEL[p] ?? p,
  }));
  const modelOptions: SelectOption[] = (modelsByProvider[provider] ?? []).map((m) => ({
    value: m.value,
    label: m.label,
  }));

  function trocarProvider(p: string) {
    setProvider(p);
    // Ao trocar de provedor, escolhe o primeiro modelo disponivel dele.
    const primeiro = modelsByProvider[p]?.[0]?.value ?? "";
    setModel(primeiro);
    setStatus("idle");
  }

  async function salvar() {
    setSalvando(true);
    setStatus("idle");
    setErro(null);
    try {
      const r = await salvarModeloConstrutor({ provider, model });
      if (r.ok) {
        setStatus("ok");
      } else {
        setStatus("erro");
        setErro(r.error);
      }
    } catch {
      setStatus("erro");
      setErro("Nao consegui salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <FileBarChart className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            Modelo do construtor de relatorios
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Modelo usado pelo assistente que monta relatorios. Independente do
            modelo de producao do Nex.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Provedor</span>
          <CustomSelect
            value={provider}
            onChange={trocarProvider}
            options={providerOptions}
            placeholder="Selecionar provedor"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Modelo</span>
          <CustomSelect
            value={model}
            onChange={(v) => {
              setModel(v);
              setStatus("idle");
            }}
            options={modelOptions}
            placeholder="Selecionar modelo"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {status === "ok" ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Salvo
          </span>
        ) : null}
        {status === "erro" ? (
          <span className="text-xs font-medium text-red-500">{erro}</span>
        ) : null}
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !model}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Salvar modelo
        </button>
      </div>
    </div>
  );
}
