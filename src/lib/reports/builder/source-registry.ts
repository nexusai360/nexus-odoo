// src/lib/reports/builder/source-registry.ts
// Registry de fontes do construtor: mapeia (fato, shapeDerivado) -> produtor.
// O produtor roda a query auditada certa e monta o RawSourceData padronizado.
// Onda 1: apenas estoque (queries comprovadas). Freshness ligado em B2.
import { prisma } from "@/lib/prisma";
import {
  querySaldoProduto,
  queryConcentracao,
} from "@/lib/reports/queries/estoque";
import type {
  RawSourceData,
  ShapeDerivado,
  SourceContract,
} from "./types";

export type FiltrosFonte = {
  armazemId?: number;
  familiaId?: number;
  termo?: string;
};

type Produtor = (filtros: FiltrosFonte) => Promise<RawSourceData>;

interface FonteDef {
  contract: SourceContract;
  produtores: Partial<Record<ShapeDerivado, Produtor>>;
}

const fatoEstoqueSaldo: FonteDef = {
  contract: {
    fato: "fato_estoque_saldo",
    modeloFonte: "estoque.saldo.hoje",
    dominio: "estoque",
    shapes: ["tabela", "kpis", "agregacaoCategorica"],
    campos: {
      tabela: [
        { key: "produtoNome", label: "Produto", tipo: "texto" },
        { key: "familiaNome", label: "Familia", tipo: "texto" },
        { key: "marcaNome", label: "Marca", tipo: "texto" },
        { key: "saldoTotal", label: "Saldo", tipo: "numero" },
        { key: "valorTotal", label: "Valor", tipo: "moeda" },
      ],
      kpis: [
        { key: "totalProdutos", label: "Produtos", tipo: "numero" },
        { key: "produtosNegativos", label: "Negativos", tipo: "numero" },
        { key: "valorTotal", label: "Valor total", tipo: "moeda" },
      ],
      agregacaoCategorica: [
        { key: "rotulo", label: "Categoria", tipo: "texto" },
        { key: "valor", label: "Valor", tipo: "moeda" },
      ],
    },
  },
  produtores: {
    tabela: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return {
        linhas: d.linhas as unknown as Record<string, unknown>[],
        kpis: { ...d.kpis },
        freshness: null,
      };
    },
    kpis: async (filtros) => {
      const d = await querySaldoProduto(prisma, filtros);
      return { linhas: [], kpis: { ...d.kpis }, freshness: null };
    },
    agregacaoCategorica: async () => {
      const d = await queryConcentracao(prisma);
      return {
        linhas: d.familiasBruto as unknown as Record<string, unknown>[],
        freshness: null,
      };
    },
  },
};

const REGISTRY: Record<string, FonteDef> = {
  fato_estoque_saldo: fatoEstoqueSaldo,
};

/** Lista os contratos publicos de todas as fontes (alimenta o agente). */
export function listarFontes(): SourceContract[] {
  return Object.values(REGISTRY).map((f) => f.contract);
}

/** Contrato de uma fonte por fato. */
export function obterContrato(fato: string): SourceContract | undefined {
  return REGISTRY[fato]?.contract;
}

/** Produtor de dado para um par (fato, shapeDerivado). */
export function obterProdutor(
  fato: string,
  shape: ShapeDerivado,
): Produtor | undefined {
  return REGISTRY[fato]?.produtores[shape];
}
