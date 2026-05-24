"use client";

/**
 * IdentityBaseEditor — edição da identidade base do agente (super_admin only).
 *
 * Campo grande de texto (textarea mono) com contador de caracteres.
 * Persiste via updateAgentSettings de agent-config.ts.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ExpandableTextarea } from "@/components/ui/expandable-textarea";
import { updateAgentSettings } from "@/lib/actions/agent-config";
import { cn } from "@/lib/utils";

const MAX_IDENTITY = 50_000;

interface IdentityBaseEditorProps {
  initial: {
    identityBase: string | null;
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

export function IdentityBaseEditor({ initial }: IdentityBaseEditorProps) {
  const router = useRouter();
  const [identityBase, setIdentityBase] = useState(initial.identityBase ?? "");
  const [isSaving, startSave] = useTransition();

  function handleSave() {
    startSave(async () => {
      const result = await updateAgentSettings({
        identityBase,
        personality: initial.personality,
        tone: initial.tone,
        guardrails: initial.guardrails,
        advancedOverride: initial.advancedOverride ?? undefined,
        terminology: initial.terminology,
        suggestionsEnabled: initial.suggestionsEnabled,
      });
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar identidade base.");
        return;
      }
      toast.success("Identidade base salva.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="agent-identity-base" className="flex items-center gap-2">
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
        id="agent-identity-base"
        label="Identidade base"
        value={identityBase}
        onChange={setIdentityBase}
        maxLength={MAX_IDENTITY}
        rows={8}
        placeholder="Defina aqui a identidade fixa do Agente Nex — quem ele é, o que faz, contexto da empresa…"
        disabled={isSaving}
        className="font-mono text-xs"
        aria-describedby="agent-identity-base-help"
      />
      <p id="agent-identity-base-help" className="text-xs text-muted-foreground">
        Escreva aqui a identidade base do Agente Nex, injetada no início de
        todo system prompt, antes de personalidade e tom. Pode ser longo:
        descreva quem é o agente, o contexto da empresa, a operação e os dados
        disponíveis.
      </p>
      <div className="flex justify-end pt-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-9 cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar prompt
        </Button>
      </div>
    </div>
  );
}
