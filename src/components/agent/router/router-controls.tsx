"use client";

/**
 * R1 router de catalogo: controles do admin.
 *
 * Edicao em rascunho local: o usuario mexe nos campos e so persiste ao clicar
 * em "Salvar" (botao desabilitado/fosco quando nao ha alteracao). Ativar o
 * router sem elegibilidade passa pelo dialog de bypass do gate.
 */

import { useMemo, useState, useTransition } from "react";
import { Loader2, Settings, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateRouterSettings,
  type RouterSettingsSnapshot,
} from "@/lib/actions/router-settings";
import type { RouterEligibility } from "@/lib/agent/router/queries";

interface Props {
  initial: RouterSettingsSnapshot;
  eligibility: RouterEligibility;
}

function sameSettings(
  a: RouterSettingsSnapshot,
  b: RouterSettingsSnapshot,
): boolean {
  return (
    a.routerEnabled === b.routerEnabled &&
    a.routerThreshold === b.routerThreshold &&
    a.routerTopK === b.routerTopK &&
    a.routerRetryExpandBelow === b.routerRetryExpandBelow &&
    a.routerRetryEnabled === b.routerRetryEnabled
  );
}

export function RouterControls({ initial, eligibility }: Props) {
  // baseline = ultimo estado salvo; draft = edicao em andamento.
  const [baseline, setBaseline] = useState<RouterSettingsSnapshot>(initial);
  const [draft, setDraft] = useState<RouterSettingsSnapshot>(initial);
  const [pending, startTransition] = useTransition();
  const [pendingActivation, setPendingActivation] = useState(false);

  const dirty = useMemo(() => !sameSettings(draft, baseline), [draft, baseline]);

  const set = (patch: Partial<RouterSettingsSnapshot>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const commit = (bypassGate: boolean) => {
    startTransition(async () => {
      const res = await updateRouterSettings({ ...draft, bypassGate });
      if (res.ok) {
        setBaseline(res.settings);
        setDraft(res.settings);
        setPendingActivation(false);
        toast.success("Configuração salva.");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleSave = () => {
    // Ativar sem elegibilidade -> confirma no dialog antes de salvar.
    if (draft.routerEnabled && !baseline.routerEnabled && !eligibility.eligible) {
      setPendingActivation(true);
      return;
    }
    commit(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4 text-violet-400" />
          Configuração
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Parâmetros do router de catálogo do Agente Nex.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Toggle principal */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Router ativo</Label>
            <p className="text-xs text-muted-foreground">
              Off = shadow (catálogo inteiro). On = filtra por domínio.
            </p>
            <p
              className="mt-1 truncate text-xs"
              title={eligibility.reason}
            >
              {eligibility.eligible ? (
                <span className="text-emerald-400">
                  ✓ Elegível para ativação
                </span>
              ) : (
                <span className="text-amber-400">⚠ Ainda não elegível</span>
              )}
            </p>
          </div>
          <Switch
            checked={draft.routerEnabled}
            disabled={pending}
            onCheckedChange={(next) => set({ routerEnabled: next })}
          />
        </div>

        {/* Threshold */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">
            Threshold: {draft.routerThreshold.toFixed(2)}
          </Label>
          <p className="text-xs text-muted-foreground">
            Score mínimo para um domínio entrar no top-K (0.15 a 0.90).
          </p>
          <Input
            type="number"
            min={0.15}
            max={0.9}
            step={0.05}
            value={draft.routerThreshold}
            disabled={pending}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) set({ routerThreshold: v });
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* TopK */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">Top-K: {draft.routerTopK}</Label>
          <p className="text-xs text-muted-foreground">
            Quantos domínios entram no catálogo (1 a 6).
          </p>
          <Input
            type="number"
            min={1}
            max={6}
            step={1}
            value={draft.routerTopK}
            disabled={pending}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) set({ routerTopK: v });
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* Retry threshold */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">
            Retry expand threshold: {draft.routerRetryExpandBelow.toFixed(2)}
          </Label>
          <p className="text-xs text-muted-foreground">
            Em active, refaz com catálogo inteiro quando falta métrica.
          </p>
          <Input
            type="number"
            min={0.3}
            max={0.95}
            step={0.05}
            value={draft.routerRetryExpandBelow}
            disabled={pending}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) set({ routerRetryExpandBelow: v });
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* Retry enabled */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Retry expandido</Label>
            <p className="text-xs text-muted-foreground">
              Habilita o retry corretivo com catálogo inteiro (default off).
            </p>
          </div>
          <Switch
            checked={draft.routerRetryEnabled}
            disabled={pending}
            onCheckedChange={(v) => set({ routerRetryEnabled: v })}
          />
        </div>

        {/* Rodape: aviso de alteracoes nao salvas + botao Salvar (fosco quando
            nao ha alteracao, ativo quando ha). */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          {dirty ? (
            <p className="text-xs text-amber-400">
              Você tem alterações não salvas. Clique em &quot;Salvar&quot; para
              aplicar.
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>

        {/* Dialog de bypass do gate */}
        <Dialog open={pendingActivation} onOpenChange={setPendingActivation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                Ativar router sem o gate de segurança?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  O router atual não bate o critério recomendado (cobertura
                  Top-K &gt;= 95% em 7 dias com &gt;= 200 decisões). Ativar
                  agora pode degradar a qualidade do agente Nex.
                </span>
                <span className="block">Motivo do gate:</span>
                <span className="block rounded-md border border-border bg-muted/40 p-2 text-xs">
                  {eligibility.reason}
                </span>
                <span className="block">
                  Você confirma a ativação em modo super_admin?
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPendingActivation(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => commit(true)}
                disabled={pending}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar e salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
