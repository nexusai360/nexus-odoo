import { Card } from "@/components/ui/card";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";

export type NumberFormat = "inteiro" | "decimal" | "moeda";
export type ChartState = "ok" | "preparando" | "vazio" | "erro";

/** Formata um número no padrão pt-BR conforme o formato pedido. */
export function formatNumber(valor: number, formato: NumberFormat): string {
  if (formato === "moeda") {
    return valor.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
    });
  }
  if (formato === "decimal") {
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

interface KPICardProps {
  valor: number;
  rotulo: string;
  formato: NumberFormat;
  estado?: ChartState;
  onRetry?: () => void;
}

/** Cartão de indicador — número único com rótulo. */
export function KPICard({
  valor, rotulo, formato, estado = "ok", onRetry,
}: KPICardProps) {
  if (estado === "preparando") return <ChartPreparing />;
  if (estado === "vazio") return <ChartEmpty />;
  if (estado === "erro") {
    return (
      <ChartError
        message="Erro ao carregar o indicador."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }
  return (
    <Card className="gap-1 px-4 py-4">
      <span className="text-2xl font-semibold tabular-nums">
        {formatNumber(valor, formato)}
      </span>
      <span className="text-sm text-muted-foreground">{rotulo}</span>
    </Card>
  );
}
