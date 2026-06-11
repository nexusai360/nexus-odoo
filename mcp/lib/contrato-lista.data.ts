// mcp/lib/contrato-lista.data.ts
// Fase B (Nex Especialista) , gate INCREMENTAL do contrato de lista.
//
// Toda tool que retorna lista deve: (1) query com orderBy deterministico,
// (2) declarar `ordenadoPor` no envelope, (3) topMaiores quando monetaria.
// Esta allowlist contem as tools AINDA NAO migradas; o teste de contrato
// (mcp/__tests__/contrato-lista.test.ts) FALHA se uma tool fora dela nao
// declarar ordenadoPor, e FALHA se uma migrada continuar listada (stale).
// Criterio de saida da Fase B: allowlist == [] (padrao TOOLS_SEM_FORMATADOR_REAL).
// Origem: docs/superpowers/research/2026-06-11-auditoria-contrato-lista.md

export const TOOLS_SEM_CONTRATO_DE_LISTA: readonly string[] = [
  "bi_consulta_avancada",
  "cadastros.res_partner_category.set_tags",
  "contabil_centro_custo",
  "contabil_conta_referencial",
  "contabil_estrutura_conta",
  "contabil_movimento_conta",
  "contabil_plano_de_contas",
  "contabil_resultado_por_natureza",
  "contabil_saldo_conta",
];
