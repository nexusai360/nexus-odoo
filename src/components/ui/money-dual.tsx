/**
 * MoneyDual , exibe um valor em BRL como principal e USD como referência
 * secundária menor ao lado. Padrão visual usado em telas onde o consumo/saldo
 * é cobrado em USD pelo provedor mas o usuário pensa em reais.
 *
 * Quando `rate` não está disponível (cotação stale ou falha), cai pra USD
 * sozinho , preferimos um dado correto a uma conversão chutada.
 */

import { cn } from "@/lib/utils";

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtUSD = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface MoneyDualProps {
  /** Valor em USD (origem). */
  usd: number;
  /** Cotação USD→BRL já com encargos (PTAX × spread × IOF). */
  rate: number | null;
  /** Tamanho do valor BRL principal. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<MoneyDualProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export function MoneyDual({
  usd,
  rate,
  size = "md",
  className,
}: MoneyDualProps) {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return (
      <span
        className={cn(
          "font-semibold tabular-nums text-foreground",
          SIZE[size],
          className,
        )}
      >
        {fmtUSD.format(usd)}
      </span>
    );
  }
  const brl = usd * rate;
  return (
    <span
      className={cn("inline-flex items-baseline gap-1.5", className)}
      title={`${fmtBRL.format(brl)} (${fmtUSD.format(usd)} × R$ ${rate.toFixed(4).replace(".", ",")}/USD com IOF e spread)`}
    >
      <span
        className={cn(
          "font-semibold tabular-nums text-foreground",
          SIZE[size],
        )}
      >
        {fmtBRL.format(brl)}
      </span>
      <span className="text-[10px] font-normal tabular-nums text-muted-foreground">
        ≈ {fmtUSD.format(usd)}
      </span>
    </span>
  );
}
