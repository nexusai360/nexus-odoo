// src/lib/reports/report-icons.ts
import {
  Boxes,
  Coins,
  ArrowLeftRight,
  Clock,
  TrendingUp,
  PieChart,
  type LucideIcon,
} from "lucide-react";

/**
 * Mapa nome-do-ícone -> componente LucideIcon.
 *
 * O catálogo (`catalog.ts`) guarda apenas a string do ícone para permanecer
 * serializável na fronteira Server -> Client Component. Componentes/funções
 * não cruzam essa fronteira. Os client components resolvem a string aqui.
 *
 * Nomes válidos: "Boxes" | "Coins" | "ArrowLeftRight" | "Clock"
 *               | "TrendingUp" | "PieChart".
 */
const REPORT_ICONS: Record<string, LucideIcon> = {
  Boxes,
  Coins,
  ArrowLeftRight,
  Clock,
  TrendingUp,
  PieChart,
};

/** Resolve o nome de ícone do catálogo para o componente LucideIcon. */
export function resolveReportIcon(nome: string): LucideIcon {
  return REPORT_ICONS[nome] ?? Boxes;
}
