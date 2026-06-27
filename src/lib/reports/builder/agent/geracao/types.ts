// src/lib/reports/builder/agent/geracao/types.ts
// Contratos do motor de geracao (pipeline do Gerar). Importa journey + blueprint-types.
import type { ProviderClient } from "@/lib/agent/llm/types";
import type { LogUsageArgs } from "@/lib/agent/llm/usage-logger";
import type { BuilderReportEntry } from "../../types";
import type { IntencaoColeta } from "../../journey/intencao";

export type FaseGeracao = "blueprint" | "revisao" | "build" | "validacao";

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
}

export interface SaidaGeracao {
  ficha: BuilderReportEntry;
  /** O que foi descartado por estar fora do catalogo (VISIVEL no reveal). */
  omitidos: string[];
}

export interface GeracaoDeps {
  /** Reusa criarClienteConstrutorPadrao (mesmo cliente do runBuilder). */
  criarCliente: () => Promise<ProviderClient | { erro: string }>;
  /** Billing isolado: logUsage({origin:"construtor"}) a cada chamada LLM. */
  logUsage: (args: LogUsageArgs) => Promise<void>;
}
