"use client";

/**
 * PlaygroundSessionPrompt — sub-tela de edição do prompt de uma sessão de
 * playground. Espelha visualmente `/agente/prompt`: usa os MESMOS
 * componentes (ExpandableTextarea), os mesmos ícones (FileText, Sparkles,
 * Wand2, Shield), os mesmos rótulos e os mesmos limites de caracteres.
 *
 * Diferenças funcionais (esperadas, escondidas do usuário):
 * - Salva no snapshot da sessão (savePlaygroundSessionPrompt) em vez de
 *   AgentSettings global.
 * - Botão extra "Aplicar à produção" promove o snapshot para
 *   AgentSettings via applyPlaygroundPromptToProduction.
 *
 * KB e Recursos ficam no menu Prompt principal (refletem aqui via
 * checkpoint PLAYGROUND/PRODUCTION).
 */

import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExpandableTextarea } from "@/components/ui/expandable-textarea";
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

function counterClass(current: number, max: number): string {
  const ratio = current / max;
  if (current > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
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
                  onClick={handleApplyToProduction}
                  disabled={isApplying || isSaving || overLimit}
                  className="h-9 bg-violet-600 text-white shadow-md shadow-violet-600/30 hover:bg-violet-700"
                >
                  {isApplying ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <UploadCloud className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  )}
                  Colocar em produção
                </Button>
              }
            />
            <TooltipContent>
              Substitui o prompt do Agente Nex em produção pelo desta sessão
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Conteúdo rolável — mesmo layout/Cards/labels da tela /agente/prompt */}
      <div className="flex-1 overflow-y-auto bg-muted/10 px-4 py-5">
        <div className="mx-auto space-y-8">
          {/* ─────── Identidade base (espelha IdentityBaseEditor) ─────── */}
          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Identidade base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-5">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="pg-identity-base"
                  className="flex items-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Texto do prompt
                </Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    counterClass(identityBase.length, MAX_IDENTITY),
                  )}
                >
                  {identityBase.length.toLocaleString("pt-BR")}/
                  {MAX_IDENTITY.toLocaleString("pt-BR")}
                </span>
              </div>
              <ExpandableTextarea
                id="pg-identity-base"
                label="Identidade base"
                value={identityBase}
                onChange={setIdentityBase}
                maxLength={MAX_IDENTITY}
                rows={8}
                placeholder="Defina aqui a identidade fixa do Agente Nex — quem ele é, o que faz, contexto da empresa…"
                disabled={isSaving || isApplying}
                className="font-mono text-xs"
                aria-describedby="pg-identity-base-help"
              />
              <p
                id="pg-identity-base-help"
                className="text-xs text-muted-foreground"
              >
                Identidade base injetada no início do system prompt, antes de
                personalidade e tom. Pode ser longa: descreva quem é o agente,
                a operação e os dados disponíveis.
              </p>
              <div className="flex justify-end pt-3">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isApplying || overLimit}
                  className="h-9 bg-violet-600 text-white hover:bg-violet-700"
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Salvar prompt
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ─────── Comportamento (espelha PromptConfigForm) ─────── */}
          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Comportamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-7 pb-5">
              {/* Personalidade */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="pg-personality"
                    className="flex items-center gap-2"
                  >
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
                  id="pg-personality"
                  label="Personalidade"
                  value={personality}
                  onChange={setPersonality}
                  maxLength={MAX_PERSONALITY}
                  rows={3}
                  placeholder="Ex.: Direto, prático, prefere bullets curtos. Evita rodeios."
                  disabled={isSaving || isApplying}
                  aria-describedby="pg-personality-help"
                />
                <p
                  id="pg-personality-help"
                  className="text-xs text-muted-foreground"
                >
                  Como o Agente Nex se comporta — voz, foco, atitude geral.
                </p>
              </div>

              {/* Tom */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="pg-tone"
                    className="flex items-center gap-2"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Tom
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
                <ExpandableTextarea
                  id="pg-tone"
                  label="Tom"
                  value={tone}
                  onChange={setTone}
                  maxLength={MAX_TONE}
                  rows={3}
                  placeholder="Ex.: Profissional, mas amigável. Em pt-BR. Use 'você'."
                  disabled={isSaving || isApplying}
                  aria-describedby="pg-tone-help"
                />
                <p
                  id="pg-tone-help"
                  className="text-xs text-muted-foreground"
                >
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
                  Regras que o Agente Nex nunca deve violar (ex.: &ldquo;Nunca
                  exponha dados de outro tenant&rdquo;, &ldquo;Não simule
                  ações destrutivas&rdquo;). Crie quantas precisar.
                </p>

                {guardrails.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum guardrail definido. Clique em &ldquo;Adicionar
                    regra&rdquo; para começar.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {guardrails.map((g, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <div className="flex flex-1 flex-col gap-1">
                          <Input
                            aria-label={`Guardrail ${idx + 1}`}
                            value={g}
                            onChange={(e) => {
                              const next = [...guardrails];
                              next[idx] = e.currentTarget.value;
                              setGuardrails(next);
                            }}
                            maxLength={MAX_GUARDRAIL}
                            placeholder={`Regra ${idx + 1}`}
                            disabled={isSaving || isApplying}
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
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setGuardrails(
                                    guardrails.filter((_, i) => i !== idx),
                                  )
                                }
                                disabled={isSaving || isApplying}
                                aria-label={`Remover guardrail ${idx + 1}`}
                                className="mt-1 h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <TooltipContent>Remover regra</TooltipContent>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGuardrails([...guardrails, ""])}
                    disabled={isSaving || isApplying}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Adicionar regra
                  </Button>
                </div>
              </div>

              {/* Ação principal */}
              <div className="flex items-center justify-end pt-3">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isApplying || overLimit}
                  className="h-9 bg-violet-600 text-white hover:bg-violet-700"
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Salvar comportamento
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recursos da sessão — espelha a estrutura do menu Prompt */}
          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Recursos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-5 text-xs text-muted-foreground">
              <p>
                Entrada de áudio, Entrada de anexo e Sugestões clicáveis seguem
                o checkpoint definido em{" "}
                <span className="font-medium text-foreground">
                  Prompt → Recursos
                </span>{" "}
                — regra evolutiva:{" "}
                <span className="font-medium">PRODUÇÃO</span> aparece no
                Playground; <span className="font-medium">PLAYGROUND</span>{" "}
                aparece só aqui;{" "}
                <span className="font-medium">DESATIVADO</span> não aparece em
                lugar nenhum.
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Override por sessão (mudar recurso só para esta sessão) será
                liberado em rodada futura — pede mudança no schema.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-muted/30 p-2">
            <CardHeader className="pb-3">
              <CardTitle>Base de conhecimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-5 text-xs text-muted-foreground">
              <p>
                Documentos da base de conhecimento têm checkpoint próprio em{" "}
                <span className="font-medium text-foreground">
                  Prompt → Base de conhecimento
                </span>
                . Documentos marcados{" "}
                <span className="font-medium">PRODUÇÃO</span> aparecem aqui;{" "}
                <span className="font-medium">PLAYGROUND</span> só no Playground;{" "}
                <span className="font-medium">DESATIVADO</span> não compõe o
                prompt.
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Adicionar/desativar documentos por sessão será liberado em
                rodada futura.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
