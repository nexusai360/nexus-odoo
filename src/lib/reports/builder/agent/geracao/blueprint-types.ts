// src/lib/reports/builder/agent/geracao/blueprint-types.ts
// Tipos PUROS do blueprint (a "spec" do relatorio que o pipeline produz no Gerar).
// Sem import de journey -> pode ser importado por journey/state (ultimoBlueprint)
// sem fechar ciclo de dependencia.
import type { ReportTemplate } from "@/lib/reports/types";
import type { ShapeDerivado } from "../../types";

/** Uma secao do blueprint, ja machine-applicable (args das tools de build). */
export interface BlueprintSecao {
  template: ReportTemplate;
  fato: string;
  shapeDerivado: ShapeDerivado;
  /** Config aplicavel da secao (titulo, eixos, metrica, cor...). */
  config: Record<string, unknown>;
  /** Por que esta secao existe (liga ao objetivo) , alimenta a auto-critica. */
  justificativa?: string;
}

/** Blueprint completo: a estrutura do relatorio antes do build. */
export interface Blueprint {
  titulo: string;
  objetivo: string;
  secoes: BlueprintSecao[];
  /** Filtros sugeridos no nivel do relatorio (opcional). */
  filtros?: Record<string, unknown>;
}
