import { cn } from "@/lib/utils";

import type { CostTier } from "@/lib/agent/llm/types";

export type { CostTier };

const TIER_CONFIG: Record<
  CostTier,
  { symbols: string; title: string; className: string }
> = {
  free: {
    symbols: "FREE",
    title: "Modelo gratuito",
    className:
      "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  low: {
    symbols: "$",
    title: "Consumo baixo (< $1 / 1M tokens)",
    className:
      "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  medium: {
    symbols: "$$",
    title: "Consumo médio ($1-$10 / 1M tokens)",
    className:
      "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  high: {
    symbols: "$$$",
    title: "Consumo alto ($10-$30 / 1M tokens)",
    className:
      "border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  premium: {
    symbols: "$$$$",
    title: "Consumo premium (> $30 / 1M tokens)",
    className: "border-red-500/40 bg-red-500/15 text-red-500",
  },
};

export function TierBadge({
  tier,
  className,
}: {
  tier: CostTier;
  className?: string;
}) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      title={cfg.title}
      aria-label={cfg.title}
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        cfg.className,
        className,
      )}
    >
      {cfg.symbols}
    </span>
  );
}
