"use client";

/**
 * PromptConfigForm — edição de comportamento, tom e guardrails do Agente Nex.
 *
 * Rework F5-UI v2:
 * - Limites: comportamento e tom 1000 caracteres; cada guardrail 500.
 * - Guardrails sem limite de quantidade.
 * - "Modo de prompt manual" removido (era confuso; simplifica a UI).
 * - Botões menores verticalmente, ação no canto inferior direito.
 *
 * Persiste via updateAgentSettings de agent-config.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Shield, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExpandableTextarea } from "@/components/ui/expandable-textarea";
import { updateAgentSettings } from "@/lib/actions/agent-config";
import { cn } from "@/lib/utils";

const MAX_PERSONALITY = 1000;
const MAX_TONE = 1000;
const MAX_GUARDRAIL = 500;

interface PromptConfigFormProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    suggestionsEnabled: boolean;
  };
}

function counterClass(current: number, max: number): string {
  const ratio = current / max;
  if (current > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function PromptConfigForm({ initial }: PromptConfigFormProps) {
  const router = useRouter();

  const [personality, setPersonality] = useState(initial.personality);
  const [tone, setTone] = useState(initial.tone);
  const [guardrails, setGuardrails] = useState<string[]>(initial.guardrails);

  const [isSaving, startSave] = useTransition();

  const payload = useMemo(
    () => ({
      personality,
      tone,
      guardrails: guardrails.map((g) => g.trim()).filter((g) => g.length > 0),
      advancedOverride: undefined,
      terminology: initial.terminology,
      suggestionsEnabled: initial.suggestionsEnabled,
    }),
    [personality, tone, guardrails, initial.terminology, initial.suggestionsEnabled],
  );

  function handleAddGuardrail() {
    setGuardrails((prev) => [...prev, ""]);
  }

  function handleGuardrailChange(idx: number, next: string) {
    setGuardrails((prev) => {
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  function handleRemoveGuardrail(idx: number) {
    setGuardrails((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    startSave(async () => {
      const result = await updateAgentSettings(payload);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar configuração.");
        return;
      }
      toast.success("Comportamento do Agente Nex salvo.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      {/* Personalidade */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-personality" className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Personalidade
          </Label>
          <span
            className={cn(
              "text-xs tabular-nums",
              counterClass(personality.length, MAX_PERSONALITY),
            )}
          >
            {personality.length}/{MAX_PERSONALITY}
          </span>
        </div>
        <ExpandableTextarea
          id="agent-personality"
          label="Personalidade"
          value={personality}
          onChange={setPersonality}
          maxLength={MAX_PERSONALITY}
          rows={3}
          placeholder="Ex.: Direto, prático, prefere bullets curtos. Evita rodeios."
          disabled={isSaving}
          aria-describedby="agent-personality-help"
        />
        <p id="agent-personality-help" className="text-xs text-muted-foreground">
          Como o Agente Nex se comporta — voz, foco, atitude geral.
        </p>
      </div>

      {/* Tom */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-tone" className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
            Tom
          </Label>
          <span
            className={cn("text-xs tabular-nums", counterClass(tone.length, MAX_TONE))}
          >
            {tone.length}/{MAX_TONE}
          </span>
        </div>
        <ExpandableTextarea
          id="agent-tone"
          label="Tom"
          value={tone}
          onChange={setTone}
          maxLength={MAX_TONE}
          rows={3}
          placeholder="Ex.: Profissional, mas amigável. Em pt-BR. Use 'você'."
          disabled={isSaving}
          aria-describedby="agent-tone-help"
        />
        <p id="agent-tone-help" className="text-xs text-muted-foreground">
          Estilo de escrita — formalidade, calor humano, vocabulário.
        </p>
      </div>

      {/* Guardrails */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          Guardrails ({guardrails.length})
        </Label>
        <p className="text-xs text-muted-foreground">
          Regras que o Agente Nex nunca deve violar (ex.: &ldquo;Nunca exponha
          dados de outro tenant&rdquo;, &ldquo;Não simule ações
          destrutivas&rdquo;). Crie quantas precisar.
        </p>

        {guardrails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum guardrail definido. Clique em &ldquo;Adicionar regra&rdquo;
            para começar.
          </div>
        ) : (
          <ul className="space-y-2">
            {guardrails.map((g, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    aria-label={`Guardrail ${idx + 1}`}
                    value={g}
                    onChange={(e) => handleGuardrailChange(idx, e.currentTarget.value)}
                    maxLength={MAX_GUARDRAIL}
                    placeholder={`Regra ${idx + 1}`}
                    disabled={isSaving}
                    className="min-h-[40px]"
                  />
                  <span
                    className={cn(
                      "self-end text-[10px] tabular-nums",
                      counterClass(g.length, MAX_GUARDRAIL),
                    )}
                  >
                    {g.length}/{MAX_GUARDRAIL}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveGuardrail(idx)}
                  disabled={isSaving}
                  aria-label={`Remover guardrail ${idx + 1}`}
                  className="mt-1 h-8 w-8 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Botão de adicionar no canto inferior direito do componente. */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddGuardrail}
            disabled={isSaving}
            className="cursor-pointer"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar regra
          </Button>
        </div>
      </div>

      {/* Ação principal — canto inferior direito, botão compacto. */}
      <div className="flex items-center justify-end pt-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-9 cursor-pointer bg-violet-600 text-white hover:bg-violet-700"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar comportamento
        </Button>
      </div>
    </div>
  );
}
