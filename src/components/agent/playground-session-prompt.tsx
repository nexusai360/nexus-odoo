"use client";

/**
 * PlaygroundSessionPrompt — sub-tela de edição do prompt de uma sessão de
 * playground. NÃO é modal: entra e volta dentro do playground.
 *
 * G10 — layout espelha a tela `/agente/prompt`: cards Identidade base e
 * Comportamento (Personalidade + Tom + Guardrails). KB e Recursos ficam
 * no menu Prompt e refletem aqui via checkpoint (PRODUCTION/PLAYGROUND).
 *
 * Edições são por sessão; "Aplicar à produção" promove o prompt para
 * AgentSettings global.
 */

import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  savePlaygroundSessionPrompt,
  applyPlaygroundPromptToProduction,
} from "@/lib/actions/playground";
import type { PlaygroundPromptSnapshot } from "@/lib/actions/playground-types";

const MAX_IDENTITY = 50_000;
const MAX_PERSONALITY = 1000;
const MAX_TONE = 1000;
const MAX_GUARDRAIL = 500;

interface PlaygroundSessionPromptProps {
  sessionId: string;
  initial: PlaygroundPromptSnapshot;
  /** Volta para a tela de chat. Recebe o snapshot salvo (ou null se cancelado). */
  onBack: (saved: PlaygroundPromptSnapshot | null) => void;
}

function counterClass(len: number, max: number): string {
  if (len > max) return "text-destructive";
  if (len > max * 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function PlaygroundSessionPrompt({
  sessionId,
  initial,
  onBack,
}: PlaygroundSessionPromptProps) {
  const [identityBase, setIdentityBase] = useState(initial.identityBase ?? "");
  const [personality, setPersonality] = useState(initial.personality);
  const [tone, setTone] = useState(initial.tone);
  const [guardrails, setGuardrails] = useState<string[]>(initial.guardrails);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const overLimit =
    identityBase.length > MAX_IDENTITY ||
    personality.length > MAX_PERSONALITY ||
    tone.length > MAX_TONE ||
    guardrails.some((g) => g.length > MAX_GUARDRAIL);

  function snapshot(): PlaygroundPromptSnapshot {
    return {
      identityBase: identityBase.trim() === "" ? null : identityBase,
      personality,
      tone,
      guardrails: guardrails.map((g) => g.trim()).filter((g) => g.length > 0),
    };
  }

  async function handleSave() {
    if (overLimit) {
      toast.error("Há campos acima do limite de caracteres.");
      return;
    }
    setIsSaving(true);
    const snap = snapshot();
    const res = await savePlaygroundSessionPrompt({ sessionId, prompt: snap });
    setIsSaving(false);
    if (res.success) {
      toast.success("Prompt da sessão salvo.");
      onBack(snap);
    } else {
      toast.error(res.error ?? "Erro ao salvar.");
    }
  }

  async function handleApplyToProduction() {
    if (overLimit) {
      toast.error("Há campos acima do limite de caracteres.");
      return;
    }
    setIsApplying(true);
    // Garante que a sessão tem o snapshot atual antes de promover.
    await savePlaygroundSessionPrompt({ sessionId, prompt: snapshot() });
    const res = await applyPlaygroundPromptToProduction(sessionId);
    setIsApplying(false);
    if (res.success) {
      toast.success("Prompt aplicado à produção do Agente Nex.");
    } else {
      toast.error(res.error ?? "Erro ao aplicar à produção.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho da sub-tela */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onBack(null)}
                  aria-label="Voltar para o chat"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
              }
            />
            <TooltipContent>Voltar ao chat</TooltipContent>
          </Tooltip>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Prompt da sessão
            </h2>
            <p className="text-xs text-muted-foreground">
              Alterações valem só nesta sessão — não afetam a produção até
              você aplicar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleApplyToProduction}
                  disabled={isApplying || isSaving || overLimit}
                  className="h-9 text-xs"
                >
                  {isApplying ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <UploadCloud className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  )}
                  Aplicar à produção
                </Button>
              }
            />
            <TooltipContent>
              Substitui o prompt do Agente Nex em produção pelo desta sessão
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || isApplying || overLimit}
                  className="h-9 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  )}
                  Salvar prompt
                </Button>
              }
            />
            <TooltipContent>Salva apenas no contexto desta sessão</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Conteúdo rolável — mesmo layout da tela /agente/prompt */}
      <div className="flex-1 overflow-y-auto bg-muted/10 px-4 py-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Identidade base */}
          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Identidade base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pb-5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pg-identity" className="text-xs font-medium">
                  Quem é o Agente Nex
                </Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    counterClass(identityBase.length, MAX_IDENTITY),
                  )}
                >
                  {identityBase.length}/{MAX_IDENTITY}
                </span>
              </div>
              <Textarea
                id="pg-identity"
                value={identityBase}
                onChange={(e) => setIdentityBase(e.currentTarget.value)}
                maxLength={MAX_IDENTITY}
                rows={8}
                placeholder="Identidade base do Agente Nex. Vazio usa a identidade padrão."
                className="resize-y text-sm"
              />
            </CardContent>
          </Card>

          {/* Comportamento (Personalidade + Tom + Guardrails) */}
          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Comportamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pb-5">
              <section className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pg-personality" className="text-xs font-medium">
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
                <Textarea
                  id="pg-personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.currentTarget.value)}
                  maxLength={MAX_PERSONALITY}
                  rows={3}
                  placeholder="Como o Agente Nex se comporta."
                  className="resize-y text-sm"
                />
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pg-tone" className="text-xs font-medium">
                    Tom de voz
                  </Label>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      counterClass(tone.length, MAX_TONE),
                    )}
                  >
                    {tone.length}/{MAX_TONE}
                  </span>
                </div>
                <Textarea
                  id="pg-tone"
                  value={tone}
                  onChange={(e) => setTone(e.currentTarget.value)}
                  maxLength={MAX_TONE}
                  rows={3}
                  placeholder="Tom das respostas do Agente Nex."
                  className="resize-y text-sm"
                />
              </section>

              <section className="space-y-2">
                <Label className="text-xs font-medium">Guardrails</Label>
                <div className="space-y-2">
                  {guardrails.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma regra de guardrail.
                    </p>
                  ) : (
                    guardrails.map((g, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="flex-1">
                          <Textarea
                            value={g}
                            onChange={(e) => {
                              const next = [...guardrails];
                              next[i] = e.currentTarget.value;
                              setGuardrails(next);
                            }}
                            maxLength={MAX_GUARDRAIL}
                            rows={2}
                            placeholder={`Regra ${i + 1}`}
                            className="resize-y text-sm"
                          />
                          <span
                            className={cn(
                              "mt-0.5 block text-right text-xs tabular-nums",
                              counterClass(g.length, MAX_GUARDRAIL),
                            )}
                          >
                            {g.length}/{MAX_GUARDRAIL}
                          </span>
                        </div>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={() =>
                                  setGuardrails(
                                    guardrails.filter((_, idx) => idx !== i),
                                  )
                                }
                                aria-label={`Remover regra ${i + 1}`}
                                className="mt-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            }
                          />
                          <TooltipContent>Remover guardrail</TooltipContent>
                        </Tooltip>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setGuardrails([...guardrails, ""])}
                    className="h-8 text-xs"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Adicionar guardrail
                  </Button>
                </div>
              </section>
            </CardContent>
          </Card>

          {/* Recursos & KB — referência informativa */}
          <Card className="rounded-2xl border border-dashed border-border bg-muted/20 p-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Recursos e Base de conhecimento
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-muted-foreground">
              Áudio, imagem, sugestões e base de conhecimento são controlados
              em{" "}
              <span className="font-medium text-foreground">
                Prompt → Recursos
              </span>{" "}
              (no menu principal). Esta sub-tela edita apenas o prompt da
              sessão.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
