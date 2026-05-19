"use client";

/**
 * KpiRow — linha de KPIs da tela de consumo de LLM.
 *
 * Exibe 6 cartões separados: Conversas, Iterações LLM, Tokens entrada,
 * Tokens saída, Custo USD, Custo BRL. Separação explícita de conversas e
 * iterações corrige o BUG 8 (rótulos antes eram ambíguos).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 */

import { motion, useReducedMotion } from "framer-motion";
import {
  BrainCircuit,
  Coins,
  DollarSign,
  Hash,
  MessageSquare,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("pt-BR");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

// ---------------------------------------------------------------------------
// Sub-componente KpiCard
// ---------------------------------------------------------------------------

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "amber";
  delay?: number;
  isLoading?: boolean;
}

function KpiCard({ icon: Icon, label, value, subtitle, tone = "default", delay = 0, isLoading }: KpiCardProps) {
  const prefersReducedMotion = useReducedMotion();

  const iconBg = tone === "amber" ? "bg-amber-500/10" : "bg-violet-600/10";
  const iconColor = tone === "amber" ? "text-amber-500" : "text-violet-400";

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: prefersReducedMotion ? 0 : delay }}
      className="group relative min-h-[128px] rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {isLoading ? (
            <div className="mt-2 h-9 w-32 animate-pulse rounded-md bg-muted/60" />
          ) : (
            <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
              {value}
            </div>
          )}
          {subtitle && !isLoading ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// KpiRow principal
// ---------------------------------------------------------------------------

export interface KpiRowData {
  /** Número de Conversations (threads) — BUG 8: separado de iterações. */
  totalConversations: number;
  /** Número de chamadas LLM individuais — BUG 8. */
  totalIterations: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  totalCostBrl: number;
  unknownCount: number;
}

interface KpiRowProps {
  data: KpiRowData | null;
  isLoading?: boolean;
}

export function KpiRow({ data, isLoading }: KpiRowProps) {
  const hasCost = data && (data.totalCostUsd > 0 || data.totalCostBrl > 0);

  const unknownBadge =
    data && data.unknownCount > 0
      ? `${numberFmt.format(data.unknownCount)} sem preço`
      : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard
        icon={MessageSquare}
        label="Conversas"
        value={data ? numberFmt.format(data.totalConversations) : "—"}
        subtitle="threads distintos"
        delay={0}
        isLoading={isLoading}
      />
      <KpiCard
        icon={BrainCircuit}
        label="Iterações LLM"
        value={data ? numberFmt.format(data.totalIterations) : "—"}
        subtitle="chamadas ao modelo"
        delay={0.05}
        isLoading={isLoading}
      />
      <KpiCard
        icon={Hash}
        label="Tokens entrada"
        value={data ? numberFmt.format(data.totalTokensInput) : "—"}
        subtitle="no período"
        delay={0.1}
        isLoading={isLoading}
      />
      <KpiCard
        icon={Zap}
        label="Tokens saída"
        value={data ? numberFmt.format(data.totalTokensOutput) : "—"}
        subtitle="no período"
        delay={0.15}
        isLoading={isLoading}
      />
      <KpiCard
        icon={DollarSign}
        label="Custo USD"
        value={data ? usdFmt.format(data.totalCostUsd) : "—"}
        subtitle={unknownBadge}
        delay={0.2}
        isLoading={isLoading}
      />
      <KpiCard
        icon={Coins}
        label="Custo BRL"
        value={data ? brlFmt.format(data.totalCostBrl) : "—"}
        subtitle={hasCost && data ? `≈ ${data.totalCostUsd > 0 ? (data.totalCostBrl / data.totalCostUsd).toFixed(2) : "—"} por USD` : undefined}
        tone={data && data.unknownCount > 0 ? "amber" : "default"}
        delay={0.25}
        isLoading={isLoading}
      />
    </div>
  );
}
