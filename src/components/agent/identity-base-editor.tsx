"use client";

/**
 * IdentityBaseEditor , edição da identidade base do agente (super_admin only).
 *
 * Campo grande de texto (textarea mono) com contador de caracteres.
 * Persiste via updateAgentSettings de agent-config.ts.
 *
 * Mesma proteção contra perda de trabalho usada em PromptConfigForm:
 *   - dirty state vs initial
 *   - rascunho automático em localStorage (restaurado silenciosamente ao
 *     remontar; banner amber sutil no topo só comunica "há alterações")
 *   - beforeunload nativo ao fechar/recarregar com mudanças pendentes
 *   - interceptação de clique em link interno (AlertDialog "Sair sem salvar?")
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Save, TriangleAlert } from "lucide-react";
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

const MAX_IDENTITY = 100_000;
const DRAFT_KEY = "agent-identity-draft-v1";

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
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  const isDirty = useMemo(
    () => identityBase !== (initial.identityBase ?? ""),
    [identityBase, initial.identityBase],
  );

  // Restaura rascunho do localStorage ao montar (silencioso).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { identityBase?: string };
      if (typeof draft.identityBase !== "string") return;
      if (draft.identityBase === (initial.identityBase ?? "")) {
        window.localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setIdentityBase(draft.identityBase);
      setRestoredFromDraft(true);
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste rascunho debounced enquanto dirty.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDirty) {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const t = setTimeout(() => {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ identityBase }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [isDirty, identityBase]);

  // beforeunload nativo.
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Interceptação de cliques em links internos.
  useEffect(() => {
    if (!isDirty) return;

    function getHref(target: EventTarget | null): {
      href: string | null;
      el: HTMLElement | null;
    } {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el instanceof HTMLAnchorElement && el.href) return { href: el.href, el };
        const dataHref = el.getAttribute?.("data-nav-href");
        if (dataHref) return { href: dataHref, el };
        el = el.parentElement;
      }
      return { href: null, el: null };
    }

    function isInternalRelative(href: string): string | null {
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        if (url.pathname === window.location.pathname && url.hash === "") return null;
        return url.pathname + url.search + url.hash;
      } catch {
        return null;
      }
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const { href, el } = getHref(e.target);
      if (!href || !el) return;
      if (el.closest("[data-skip-dirty]")) return;
      if (el.getAttribute?.("target") === "_blank") return;
      const relative = isInternalRelative(href);
      if (!relative) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNav(() => () => {
        try {
          router.push(relative);
        } catch {
          window.location.href = href;
        }
      });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirty, router]);

  // Intercepta back/forward do navegador (botões nativos).
  useEffect(() => {
    if (!isDirty) return;
    const trapState = { __nexusDirtyTrap: true } as const;
    window.history.pushState(trapState, "");
    function onPop(_e: PopStateEvent) {
      window.history.pushState(trapState, "");
      setPendingNav(() => () => {
        window.history.go(-2);
      });
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [isDirty]);

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
      if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
      setRestoredFromDraft(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Banner no topo: alerta de mudanças não salvas. */}
      {isDirty && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p className="leading-snug">
            {restoredFromDraft
              ? "Há alterações da sua última visita que ainda não foram aplicadas ao Agente Nex. Para aplicar, clique em “Salvar prompt”."
              : "Mudanças não salvas. Clique em “Salvar prompt” para aplicar."}
          </p>
        </div>
      )}

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
        placeholder="Defina aqui a identidade fixa do Agente Nex, quem ele é, o que faz, contexto da empresa…"
        disabled={isSaving}
        className={cn(
          "font-mono text-xs",
          isDirty &&
            "[&:not(:focus)]:border-amber-400/45 [&:not(:focus)]:bg-amber-400/[0.045]",
        )}
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
          disabled={isSaving || !isDirty}
          className={cn(
            "h-9 cursor-pointer bg-violet-600 hover:bg-violet-700 text-white",
            !isDirty && "opacity-60",
          )}
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar prompt
        </Button>
      </div>

      <AlertDialog
        open={pendingNav !== null}
        onOpenChange={(o) => {
          if (!o) setPendingNav(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem mudanças no prompt que ainda não foram aplicadas ao
              Agente Nex. Se sair agora sem salvar, elas só ficam guardadas
              como rascunho local e podem ser perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="default"
              onClick={() => setPendingNav(null)}
              className="!bg-violet-600 !text-white hover:!bg-violet-700"
            >
              Ficar e continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const nav = pendingNav;
                setPendingNav(null);
                nav?.();
              }}
            >
              Sair mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
