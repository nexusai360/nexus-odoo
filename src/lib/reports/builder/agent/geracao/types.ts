// src/lib/reports/builder/agent/geracao/types.ts
// Contratos do motor de geracao (pipeline do Gerar). Importa journey + plano-types.
import type { ProviderClient } from "@/lib/agent/llm/types";
import type { LogUsageArgs } from "@/lib/agent/llm/usage-logger";
import type { BuilderReportEntry } from "../../types";
import type { IntencaoColeta } from "../../journey/intencao";
import type { Plano } from "./plano-types";

export type FaseGeracao = "compositor" | "amostra" | "critico" | "build" | "validacao";

export interface ProgressoGeracao {
  fase: FaseGeracao;
  /** 0..100, monotonico (nunca recua). */
  pct: number;
  /** Frase amigavel especifica da fase (sem termos tecnicos). */
  frase: string;
}

export interface EntradaGeracao {
  entendimento: string;
  intencao: IntencaoColeta;
  historico: { role: "user" | "assistant"; content: string }[];
  user: { id: string };
  /** Ajuste em linguagem natural do "regenerar" (ausente na geracao normal). */
  ajuste?: string;
  /** Dominios acessiveis ao usuario (camada 1 do RBAC). Onda 1: ["estoque"]. */
  dominiosPermitidos?: string[];
  /** "gerar_ja": template deterministico (0 LLM). Default: completo (compositor+critico). */
  modo?: "completo" | "gerar_ja";
  /** Dominio do template no "gerar_ja" (ex.: "financeiro"). Default: o da intencao. */
  dominioTemplate?: string;
  /** Plano anterior, para o "regenerar" barato (pula o compositor). */
  ultimoPlano?: Plano;
}

export interface SaidaGeracao {
  ficha: BuilderReportEntry;
  /** O que foi descartado por estar fora do catalogo (VISIVEL no reveal). */
  omitidos: string[];
  /** Plano final (guardado em ultimoPlano para o "regenerar" barato). */
  plano: Plano;
}

export interface GeracaoDeps {
  /** Reusa criarClienteConstrutorPadrao (mesmo cliente do runBuilder). */
  criarCliente: () => Promise<ProviderClient | { erro: string }>;
  /** Billing isolado: logUsage({origin:"construtor"}) a cada chamada LLM. */
  logUsage: (args: LogUsageArgs) => Promise<void>;
  /** Resolve dado cru de um (fato, shape) para a amostra leve do critico/revisor. */
  resolver: (
    fato: string,
    shape: string,
  ) => Promise<{ linhas: Record<string, unknown>[]; kpis?: Record<string, number> }>;
}
