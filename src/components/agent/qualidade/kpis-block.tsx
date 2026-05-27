"use client";

/**
 * KpisBlock , 6 KPI cards do dashboard /agente/qualidade.
 *
 * Cores semanticas: CORRETO verde (success), PARCIAL amarelo (warning),
 * ERRADO vermelho (danger), FORA_DO_ESCOPO neutro. Embaixo dos cards,
 * badge com contagens de PENDENTE e FALHA_TECNICA (fora do calculo de
 * % CORRETO).
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  Percent,
  Sigma,
  XCircle,
} from "lucide-react";

import { KpiCard } from "@/components/reports/kpi-card";
import type { QualityKpisV2 } from "@/lib/agent/quality/queries";

interface KpisBlockProps {
  kpis: QualityKpisV2;
  loading?: boolean;
}

const numberFmt = new Intl.NumberFormat("pt-BR");

export function KpisBlock({ kpis, loading = false }: KpisBlockProps) {
  const percentLabel =
    kpis.percentCorreto !== null
      ? `${kpis.percentCorreto.toFixed(1)}%`
      : ",";
  // Hints curtos, em minusculas e sem formula tecnica — padrao alinhado
  // com o card "Fora de escopo" para ficar leve e legivel.
  const percentHint =
    kpis.percentCorreto !== null
      ? "acertos sobre avaliados"
      : "sem avaliações";

  return (
    <div className="space-y-3" aria-busy={loading ? "true" : "false"}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Percent}
          label="% CORRETO"
          value={percentLabel}
          hint={percentHint}
          tone="success"
        />
        <KpiCard
          icon={Sigma}
          label="Total avaliado"
          value={numberFmt.format(kpis.totalAvaliado)}
          hint="sem pendentes"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Corretos"
          value={numberFmt.format(kpis.corretos)}
          tone="success"
        />
        <KpiCard
          icon={AlertCircle}
          label="Parciais"
          value={numberFmt.format(kpis.parciais)}
          tone="warning"
        />
        <KpiCard
          icon={XCircle}
          label="Errados"
          value={numberFmt.format(kpis.errados)}
          tone="danger"
        />
        <KpiCard
          icon={MinusCircle}
          label="Fora de escopo"
          value={numberFmt.format(kpis.foraDoEscopo)}
          hint="recusa correta"
        />
      </div>

      {(kpis.pendentes > 0 || kpis.falhasTecnicas > 0) && (
        <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
          {kpis.pendentes > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-sky-500" />
              <span className="font-medium text-foreground">
                {numberFmt.format(kpis.pendentes)}
              </span>{" "}
              pendente{kpis.pendentes === 1 ? "" : "s"} aguardando auditoria
            </span>
          )}
          {kpis.falhasTecnicas > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-violet-500" />
              <span className="font-medium text-foreground">
                {numberFmt.format(kpis.falhasTecnicas)}
              </span>{" "}
              falha{kpis.falhasTecnicas === 1 ? "" : "s"} técnica
              {kpis.falhasTecnicas === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
