"use client";

/**
 * R1 router de catalogo: controles do admin.
 *
 * Inclui toggle (com gate de seguranca via dialog de bypass),
 * threshold, topK, retry expand threshold.
 *
 * Server action `updateRouterSettings` valida tudo no servidor inclusive
 * o gate.
 */

import { useState, useTransition } from "react";
import { Loader2, Settings, ShieldAlert } from "lucide-react";
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

export function RouterControls({ initial, eligibility }: Props) {
  const [state, setState] = useState<RouterSettingsSnapshot>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActivation, setPendingActivation] = useState(false);

  const apply = (
    patch: Partial<RouterSettingsSnapshot> & { bypassGate?: boolean },
  ) => {
    startTransition(async () => {
      setFeedback(null);
      const res = await updateRouterSettings(patch);
      if (res.ok) {
        setState(res.settings);
        setFeedback("Salvo.");
        setPendingActivation(false);
      } else {
        setFeedback(res.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4 text-violet-400" />
          Configuracao
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Toggle principal */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Router ativo</Label>
            <p className="text-xs text-muted-foreground">
              Off = shadow (catalogo inteiro). On = filtra catalogo por
              dominio.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {eligibility.eligible ? (
                <span className="text-emerald-400">
                  ✓ Elegivel: {eligibility.reason}
                </span>
              ) : (
                <span className="text-amber-400">
                  ⚠ {eligibility.reason}
                </span>
              )}
            </p>
          </div>
          <Switch
            checked={state.routerEnabled}
            disabled={pending}
            onCheckedChange={(next) => {
              if (next && !eligibility.eligible) {
                setPendingActivation(true);
                return;
              }
              apply({ routerEnabled: next });
            }}
          />
        </div>

        {/* Threshold */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">
            Threshold: {state.routerThreshold.toFixed(2)}
          </Label>
          <p className="text-xs text-muted-foreground">
            Score minimo para um dominio entrar no top-K (0.15 a 0.90). Com o
            modelo large, o ponto calibrado fica em torno de 0.30.
          </p>
          <Input
            type="number"
            min={0.15}
            max={0.9}
            step={0.05}
            value={state.routerThreshold}
            disabled={pending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v !== state.routerThreshold) {
                apply({ routerThreshold: v });
              }
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* TopK */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">
            Top-K: {state.routerTopK}
          </Label>
          <p className="text-xs text-muted-foreground">
            Quantos dominios entram no catalogo (1 a 6).
          </p>
          <Input
            type="number"
            min={1}
            max={6}
            step={1}
            value={state.routerTopK}
            disabled={pending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v !== state.routerTopK) {
                apply({ routerTopK: v });
              }
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* Retry threshold */}
        <div className="grid gap-2">
          <Label className="text-sm font-medium">
            Retry expand threshold: {state.routerRetryExpandBelow.toFixed(2)}
          </Label>
          <p className="text-xs text-muted-foreground">
            Em active mode, dispara retry com catalogo inteiro quando o
            validator V1-V5 detecta &quot;sem metrica&quot; E topScore
            menor que este valor.
          </p>
          <Input
            type="number"
            min={0.3}
            max={0.95}
            step={0.05}
            value={state.routerRetryExpandBelow}
            disabled={pending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (
                !Number.isNaN(v) &&
                v !== state.routerRetryExpandBelow
              ) {
                apply({ routerRetryExpandBelow: v });
              }
            }}
            className="max-w-[140px]"
          />
        </div>

        {/* Retry enabled */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Retry expandido</Label>
            <p className="text-xs text-muted-foreground">
              Habilita o retry corretivo com catalogo inteiro (default
              off).
            </p>
          </div>
          <Switch
            checked={state.routerRetryEnabled}
            disabled={pending}
            onCheckedChange={(v) => apply({ routerRetryEnabled: v })}
          />
        </div>

        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
          </div>
        )}
        {feedback && (
          <div className="text-xs text-muted-foreground">{feedback}</div>
        )}

        {/* Dialog de bypass do gate */}
        <Dialog open={pendingActivation} onOpenChange={setPendingActivation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                Ativar router sem o gate de seguranca?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  O router atual nao bate o criterio recomendado (Top-1
                  &gt;= 95% em 7 dias com &gt;= 200 decisoes). Ativar
                  agora pode degradar a qualidade do agente Nex.
                </span>
                <span className="block">Motivo do gate:</span>
                <span className="block rounded-md border border-border bg-muted/40 p-2 text-xs">
                  {eligibility.reason}
                </span>
                <span className="block">
                  Voce confirma a ativacao em modo super_admin?
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
                onClick={() =>
                  apply({ routerEnabled: true, bypassGate: true })
                }
                disabled={pending}
              >
                {pending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmar ativacao
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
