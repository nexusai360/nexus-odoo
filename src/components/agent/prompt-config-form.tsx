"use client";

/**
 * PromptConfigForm — edição de personalidade, tom, guardrails e modo manual.
 *
 * Portado de nexus-insights/src/components/agente-nex/prompt-config-form.tsx.
 * Adaptações:
 * - Renomeação nex→agent; usa updateAgentSettings de agent-config.ts.
 * - Remove KB/URLs/identityBase (separados em outros componentes).
 * - Sem previewSystemPromptAction (out of scope para onda 3).
 * - router.refresh() após salvar.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  HelpCircle,
  Loader2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateAgentSettings } from "@/lib/actions/agent-config";
import { cn } from "@/lib/utils";

const MAX_PERSONALITY = 500;
const MAX_TONE = 500;
const MAX_GUARDRAIL = 300;
const MAX_GUARDRAILS = 20;
const MAX_OVERRIDE = 50_000;

const MANUAL_DISABLED_HELP =
  "Desativado pelo Modo manual ativo. Desligue acima para editar.";
const MANUAL_WARNING_TEXT =
  "O Modo manual substitui completamente o prompt composto (personalidade, tom, guardrails). Use apenas se sabe exatamente o que está fazendo.";

interface PromptConfigFormProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    audioInputEnabled: boolean;
    kbEnabled: boolean;
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
  const [overrideOn, setOverrideOn] = useState(
    !!initial.advancedOverride && initial.advancedOverride.trim().length > 0,
  );
  const [override, setOverride] = useState(initial.advancedOverride ?? "");
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false);

  const [isSaving, startSave] = useTransition();

  const canAddGuardrail = guardrails.length < MAX_GUARDRAILS;
  const fieldsDisabled = overrideOn || isSaving;

  const payload = useMemo(
    () => ({
      personality,
      tone,
      guardrails: guardrails.map((g) => g.trim()).filter((g) => g.length > 0),
      advancedOverride: overrideOn ? override : undefined,
      terminology: initial.terminology,
      audioInputEnabled: initial.audioInputEnabled,
      kbEnabled: initial.kbEnabled,
      suggestionsEnabled: initial.suggestionsEnabled,
    }),
    [
      personality,
      tone,
      guardrails,
      overrideOn,
      override,
      initial.terminology,
      initial.audioInputEnabled,
      initial.kbEnabled,
      initial.suggestionsEnabled,
    ],
  );

  function handleAddGuardrail() {
    if (!canAddGuardrail) {
      toast.error(`Limite de ${MAX_GUARDRAILS} guardrails atingido`);
      return;
    }
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

  function handleOverrideToggle(checked: boolean) {
    if (checked) {
      setConfirmActivateOpen(true);
      return;
    }
    setOverrideOn(false);
  }

  function handleSave() {
    if (overrideOn && override.trim().length === 0) {
      toast.error("Modo manual ativo precisa de texto não-vazio.");
      return;
    }
    startSave(async () => {
      const result = await updateAgentSettings(payload);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar configuração.");
        return;
      }
      toast.success("Configuração do agente salva.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Badge MODO MANUAL ATIVO */}
      {overrideOn && (
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          MODO MANUAL ATIVO
        </div>
      )}

      {/* Personalidade */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-personality" className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Personalidade
          </Label>
          <span className={cn("text-xs tabular-nums", counterClass(personality.length, MAX_PERSONALITY))}>
            {personality.length}/{MAX_PERSONALITY}
          </span>
        </div>
        <Textarea
          id="agent-personality"
          value={personality}
          onChange={(e) => setPersonality(e.currentTarget.value)}
          maxLength={MAX_PERSONALITY}
          rows={3}
          placeholder="Ex.: Direto, prático, prefere bullets curtos. Evita rodeios."
          disabled={fieldsDisabled}
          aria-describedby="agent-personality-help"
        />
        <p id="agent-personality-help" className="text-xs text-muted-foreground">
          Como o agente se comporta — voz, foco, atitude geral.
        </p>
        {overrideOn && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        )}
      </div>

      {/* Tom */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-tone" className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
            Tom
          </Label>
          <span className={cn("text-xs tabular-nums", counterClass(tone.length, MAX_TONE))}>
            {tone.length}/{MAX_TONE}
          </span>
        </div>
        <Textarea
          id="agent-tone"
          value={tone}
          onChange={(e) => setTone(e.currentTarget.value)}
          maxLength={MAX_TONE}
          rows={3}
          placeholder="Ex.: Profissional, mas amigável. Em pt-BR. Use 'você'."
          disabled={fieldsDisabled}
          aria-describedby="agent-tone-help"
        />
        <p id="agent-tone-help" className="text-xs text-muted-foreground">
          Estilo de escrita — formalidade, calor humano, vocabulário.
        </p>
        {overrideOn && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        )}
      </div>

      {/* Guardrails */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Guardrails ({guardrails.length}/{MAX_GUARDRAILS})
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Regras que o agente nunca deve violar (ex.: &ldquo;Nunca exponha dados
          de outro tenant&rdquo;, &ldquo;Não simule ações destrutivas&rdquo;).
        </p>

        {guardrails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum guardrail definido. Clique em &ldquo;Adicionar regra&rdquo; para começar.
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
                    disabled={fieldsDisabled}
                    className="min-h-[40px]"
                  />
                  <span className={cn("self-end text-[10px] tabular-nums", counterClass(g.length, MAX_GUARDRAIL))}>
                    {g.length}/{MAX_GUARDRAIL}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveGuardrail(idx)}
                  disabled={fieldsDisabled}
                  aria-label={`Remover guardrail ${idx + 1}`}
                  className="mt-1 h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddGuardrail}
          disabled={!canAddGuardrail || fieldsDisabled}
          className="cursor-pointer"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar regra
        </Button>
        {overrideOn && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        )}
      </div>

      {/* Modo prompt manual */}
      <div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">Modo prompt manual</p>
              <span
                role="img"
                aria-label="Ajuda sobre Modo prompt manual"
                title="Substitui completamente o prompt composto por um texto bruto. Use apenas se você sabe exatamente o que está fazendo."
                className="inline-flex h-4 w-4 cursor-help items-center justify-center text-muted-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Substitui o prompt composto por um texto bruto.
            </p>
          </div>
          <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
            <Switch
              checked={overrideOn}
              onCheckedChange={handleOverrideToggle}
              disabled={isSaving}
              aria-label={overrideOn ? "Desativar Modo prompt manual" : "Ativar Modo prompt manual"}
            />
          </span>
        </div>

        {overrideOn && (
          <div className="space-y-2">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="leading-snug">{MANUAL_WARNING_TEXT}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="agent-override" className="text-xs">
                Prompt completo (manual)
              </Label>
              <span className={cn("text-xs tabular-nums", counterClass(override.length, MAX_OVERRIDE))}>
                {override.length.toLocaleString("pt-BR")}/{MAX_OVERRIDE.toLocaleString("pt-BR")}
              </span>
            </div>
            <Textarea
              id="agent-override"
              value={override}
              onChange={(e) => setOverride(e.currentTarget.value)}
              maxLength={MAX_OVERRIDE}
              rows={12}
              placeholder="prompt completo — substitui Personalidade, Tom e Guardrails"
              disabled={isSaving}
              className="font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="min-h-[44px] cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>

      {/* AlertDialog confirmação modo manual */}
      <AlertDialog
        open={confirmActivateOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmActivateOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Ativar Modo prompt manual?
            </AlertDialogTitle>
            <AlertDialogDescription>{MANUAL_WARNING_TEXT}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmActivateOpen(false)}
              className="cursor-pointer"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                setOverrideOn(true);
                setConfirmActivateOpen(false);
              }}
              className="cursor-pointer bg-amber-600 text-white hover:bg-amber-700"
            >
              Ativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
