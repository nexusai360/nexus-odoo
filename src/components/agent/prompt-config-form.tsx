"use client";

/**
 * PromptConfigForm , edição de comportamento, tom e guardrails do Agente Nex.
 *
 * Rework F5-UI v2:
 * - Limites: comportamento e tom 1000 caracteres; cada guardrail 500.
 * - Guardrails sem limite de quantidade.
 * - "Modo de prompt manual" removido (era confuso; simplifica a UI).
 * - Botões menores verticalmente, ação no canto inferior direito.
 *
 * Persiste via updateAgentSettings de agent-config.ts.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Loader2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ExpandableTextarea } from "@/components/ui/expandable-textarea";
import { updateAgentSettings } from "@/lib/actions/agent-config";
import { cn } from "@/lib/utils";

const MAX_PERSONALITY = 1000;
const MAX_TONE = 1000;
const MAX_GUARDRAIL = 500;
const DRAFT_KEY = "agent-prompt-draft-v1";

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
  const [autoFocusIdx, setAutoFocusIdx] = useState<number | null>(null);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [draftBannerOpen, setDraftBannerOpen] = useState(false);

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

  // Dirty state: difere do initial.
  const isDirty = useMemo(() => {
    if (personality !== initial.personality) return true;
    if (tone !== initial.tone) return true;
    const cleaned = guardrails.map((g) => g.trim()).filter((g) => g.length > 0);
    if (cleaned.length !== initial.guardrails.length) return true;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] !== initial.guardrails[i]) return true;
    }
    return false;
  }, [personality, tone, guardrails, initial]);

  // Carrega rascunho do localStorage ao montar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as {
        personality?: string;
        tone?: string;
        guardrails?: string[];
      };
      const sameAsInitial =
        draft.personality === initial.personality &&
        draft.tone === initial.tone &&
        JSON.stringify(draft.guardrails ?? []) ===
          JSON.stringify(initial.guardrails);
      if (sameAsInitial) {
        window.localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setDraftBannerOpen(true);
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste rascunho no localStorage sempre que dirty.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDirty) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const t = setTimeout(() => {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ personality, tone, guardrails }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [isDirty, personality, tone, guardrails]);

  // beforeunload nativo do browser (close/reload).
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function restoreDraft() {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setDraftBannerOpen(false);
      return;
    }
    try {
      const draft = JSON.parse(raw) as {
        personality?: string;
        tone?: string;
        guardrails?: string[];
      };
      if (typeof draft.personality === "string") setPersonality(draft.personality);
      if (typeof draft.tone === "string") setTone(draft.tone);
      if (Array.isArray(draft.guardrails)) setGuardrails(draft.guardrails);
    } catch {
      // ignora
    }
    setDraftBannerOpen(false);
  }

  function discardDraft() {
    if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
    setDraftBannerOpen(false);
  }

  function handleAddGuardrail() {
    setGuardrails((prev) => {
      const next = [...prev, ""];
      setAutoFocusIdx(next.length - 1);
      return next;
    });
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
    setAutoFocusIdx(null);
  }

  function handleGuardrailBlur(idx: number) {
    // Auto-remove guardrail vazio no blur. Não cria a regra no banco se
    // o usuário abriu o campo e clicou fora sem digitar nada.
    if (guardrails[idx]?.trim().length === 0) {
      setGuardrails((prev) => prev.filter((_, i) => i !== idx));
    }
    if (autoFocusIdx === idx) setAutoFocusIdx(null);
  }

  function handleSave() {
    startSave(async () => {
      const result = await updateAgentSettings(payload);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar configuração.");
        return;
      }
      toast.success("Comportamento do Agente Nex salvo.");
      if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
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
            {personality.length.toLocaleString("pt-BR")}/{MAX_PERSONALITY.toLocaleString("pt-BR")}
          </span>
        </div>
        <ExpandableTextarea
          id="agent-personality"
          label="Personalidade"
          value={personality}
          onChange={setPersonality}
          maxLength={MAX_PERSONALITY}
          rows={1}
          placeholder="Ex.: Direto, prático, prefere bullets curtos. Evita rodeios."
          disabled={isSaving}
          aria-describedby="agent-personality-help"
          className="min-h-[40px] max-h-[88px] field-sizing-content"
        />
        <p id="agent-personality-help" className="text-xs text-muted-foreground">
          Como o Agente Nex se comporta. Defina voz, foco e atitude geral.
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
            {tone.length.toLocaleString("pt-BR")}/{MAX_TONE.toLocaleString("pt-BR")}
          </span>
        </div>
        <ExpandableTextarea
          id="agent-tone"
          label="Tom"
          value={tone}
          onChange={setTone}
          maxLength={MAX_TONE}
          rows={1}
          placeholder="Ex.: Profissional, mas amigável. Em pt-BR. Use 'você'."
          disabled={isSaving}
          aria-describedby="agent-tone-help"
          className="min-h-[40px] max-h-[88px] field-sizing-content"
        />
        <p id="agent-tone-help" className="text-xs text-muted-foreground">
          Estilo de escrita: formalidade, calor humano e vocabulário.
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
                  <ExpandableTextarea
                    label={`Guardrail ${idx + 1}`}
                    value={g}
                    onChange={(next) => handleGuardrailChange(idx, next)}
                    maxLength={MAX_GUARDRAIL}
                    rows={1}
                    placeholder={`Regra ${idx + 1}`}
                    disabled={isSaving}
                    aria-describedby={`guardrail-counter-${idx}`}
                    className="min-h-[40px] max-h-[88px] field-sizing-content"
                  />
                  <span
                    id={`guardrail-counter-${idx}`}
                    className={cn(
                      "self-end text-[10px] tabular-nums",
                      counterClass(g.length, MAX_GUARDRAIL),
                    )}
                  >
                    {g.length.toLocaleString("pt-BR")}/{MAX_GUARDRAIL.toLocaleString("pt-BR")}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveGuardrail(idx)}
                        disabled={isSaving}
                        aria-label={`Remover guardrail ${idx + 1}`}
                        className="mt-1 h-8 w-8 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      />
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent>Remover guardrail</TooltipContent>
                </Tooltip>
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

      {/* Ação principal , canto inferior direito, botão compacto. */}
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
