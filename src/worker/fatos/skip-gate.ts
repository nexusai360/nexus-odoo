// src/worker/fatos/skip-gate.ts
//
// Skip-gate de dirtiness (otimização de sync, 2026-07-23). Decide se um builder
// PRECISA rodar num ciclo: se nenhum insumo dele mudou desde o último build REAL,
// o full rebuild produziria um fato IDÊNTICO , então pula (prova trivial de correção).
//
// Sinal de mudança = `raw.synced_at > fato.ultimoBuildAt` (synced_at avança em TODA
// escrita na raw, inclusive campos computados do job de atendimento e marcações de
// raw_deleted feitas pela reconciliação , ver reconcile.ts). Dependências entre fatos
// (ex.: fato_pedido_item usa fato_produto) são tratadas comparando ultimoBuildAt do
// pai vs do filho, o que também cobre pais que rodam DEPOIS no ciclo (ex.: fato_parceiro),
// com o mesmo lag de 1 ciclo que o full rebuild já tem hoje.
//
// FAIL-SAFE: fato AUSENTE de INSUMOS_BUILDER, sem ultimoBuildAt, com pai nunca buildado,
// ou no primeiro ciclo após boot => SEMPRE roda. Nunca pula por falta de informação.
// O mapa foi conferido 1:1 lendo cada builder (perícia 2026-07-23); qualquer rawSource
// faltando vira dado velho silencioso, por isso a omissão default é "rodar", não "pular".

import type { PrismaClient } from "../../generated/prisma/client";

export interface InsumosBuilder {
  /** Tabelas raw_* físicas que o builder lê. */
  rawSources: string[];
  /** Fatos dos quais o RESULTADO depende (join/leitura/escrita cruzada). */
  dependsOn?: string[];
}

/**
 * Insumos por fato. Conferido lendo cada builder + helpers (classificarPedidosDoRaw,
 * carregarParticipantesGrupo, origensDeNota, loadEmpresasDoGrupo). Nomes físicos batem
 * com os @@map do schema. Fato ausente daqui => sempre roda (fail-safe).
 */
export const INSUMOS_BUILDER: Record<string, InsumosBuilder> = {
  // snapshot
  fato_estoque_local: { rawSources: ["raw_sped_participante", "raw_estoque_local"] },
  fato_estoque_saldo: { rawSources: ["raw_sped_produto", "raw_estoque_saldo_hoje"] },
  fato_lista_material_item: {
    rawSources: ["raw_sped_produto_lista_material", "raw_sped_produto_lista_material_item"],
  },
  fato_serial_saldo: {
    rawSources: ["raw_estoque_saldo_rastreabilidade_hoje"],
    dependsOn: ["fato_estoque_local", "fato_produto"],
  },
  fato_estoque_movimento: { rawSources: ["raw_estoque_extrato"] },
  fato_produto_parado: {
    rawSources: ["raw_estoque_saldo_hoje", "raw_estoque_saldo_hoje_duracao_dias"],
  },
  fato_financeiro_saldo: { rawSources: ["raw_finan_banco_saldo_hoje"] },
  // incremental
  fato_financeiro_movimento: { rawSources: ["raw_finan_fluxo_caixa"] },
  fato_financeiro_titulo: { rawSources: ["raw_finan_lancamento", "raw_sped_documento"] },
  fato_pedido: {
    rawSources: ["raw_pedido_etapa", "raw_pedido_documento", "raw_sped_documento_item"],
    dependsOn: ["fato_parceiro"],
  },
  fato_pedido_parcela: { rawSources: ["raw_pedido_parcela"] },
  // dependsOn fato_parceiro: classificaReceita usa carregarParticipantesGrupo (lê
  // fato_parceiro) para decidir is_venda_externa , se um parceiro muda de/para intragrupo,
  // a classificação da nota muda sem a raw da nota mudar. Ver fato-nota-fiscal.ts:146.
  fato_nota_fiscal: { rawSources: ["raw_sped_documento"], dependsOn: ["fato_parceiro"] },
  fato_nota_fiscal_item: { rawSources: ["raw_sped_documento", "raw_sped_documento_item"] },
  fato_produto: { rawSources: ["raw_sped_produto"] },
  fato_pedido_item: { rawSources: ["raw_sped_documento_item"], dependsOn: ["fato_produto"] },
  fato_pedido_classificacao: {
    rawSources: ["raw_pedido_etapa", "raw_sped_documento_item"],
    dependsOn: ["fato_parceiro", "fato_pedido", "fato_nota_fiscal"],
  },
  fato_parceiro: { rawSources: ["raw_sped_participante"] },
  fato_conta_contabil: { rawSources: ["raw_contabil_conta"] },
  fato_preco: { rawSources: ["raw_sped_tabela_preco_regra"] },
  fato_servico: { rawSources: ["raw_sped_servico"] },
  fato_apuracao: { rawSources: ["raw_sped_apuracao"] },
  fato_carta_correcao: { rawSources: ["raw_sped_carta_correcao"] },
  fato_certificado: { rawSources: ["raw_sped_certificado"] },
  fato_referencia: {
    rawSources: [
      "raw_sped_ncm", "raw_sped_cfop", "raw_sped_cest", "raw_sped_cnae", "raw_sped_nbs",
      "raw_sped_natureza_operacao", "raw_sped_unidade", "raw_sped_cst_icms",
      "raw_sped_cst_icms_sn", "raw_sped_cst_ipi", "raw_sped_cst_pis_cofins",
      "raw_sped_cst_cibs", "raw_sped_municipio", "raw_sped_pais", "raw_sped_estado",
    ],
  },
  fato_dfe: { rawSources: ["raw_sped_consulta_dfe_item"] },
  fato_pedido_historico: { rawSources: ["raw_pedido_documento_historico"] },
  fato_financeiro_lancamento_item: {
    rawSources: ["raw_finan_lancamento", "raw_finan_lancamento_item"],
  },
  fato_contabil_conta_referencial: { rawSources: ["raw_contabil_conta_referencial"] },
  fato_contabil_lancamento: { rawSources: ["raw_contabil_lancamento"] },
  fato_contabil_lancamento_item: {
    rawSources: ["raw_contabil_lancamento_item"],
    dependsOn: ["fato_conta_contabil", "fato_contabil_lancamento"],
  },
  fato_mdfe: { rawSources: ["raw_sped_mdfe"] },
  fato_reinf_evento: { rawSources: ["raw_reinf_evento"] },
  fato_retorno_item: { rawSources: ["raw_finan_retorno_item"] },
  fato_retorno_bancario: { rawSources: ["raw_finan_retorno"] },
  fato_remessa_bancaria: { rawSources: ["raw_finan_remessa"] },
  fato_carteira_cobranca: { rawSources: ["raw_finan_carteira"] },
  fato_cheque: { rawSources: ["raw_finan_cheque"] },
  fato_pix: { rawSources: ["raw_finan_pix"] },
  fato_cotacao: { rawSources: ["raw_pedido_documento_cotacao"] },
  fato_comissao: { rawSources: ["raw_pedido_comissao"] },
  fato_producao_processo: { rawSources: ["raw_producao_processo"] },
  fato_estoque_min_max: { rawSources: ["raw_estoque_minimo_maximo"] },
  fato_serial: {
    rawSources: ["raw_sped_produto_lote_serie", "raw_sped_documento_item_rastreabilidade"],
    dependsOn: ["fato_nota_fiscal_item", "fato_nota_fiscal"],
  },
  fato_compra: { rawSources: ["raw_pedido_documento"] },
  fato_crm_pipeline: { rawSources: ["raw_crm_pipeline"] },
  fato_auditoria_regra: { rawSources: ["raw_auditoria_regra"] },
};

/** Cliente mínimo usado pelo gate (queryRawUnsafe). */
export type SkipGateClient = Pick<PrismaClient, "$queryRawUnsafe">;

const NOME_RAW_VALIDO = /^raw_[a-z0-9_]+$/;

/**
 * Alguma das raws tem linha com `synced_at > desde`? Uma query por builder (OR de
 * EXISTS). Nomes de tabela são constantes de código (INSUMOS_BUILDER), não input;
 * ainda assim validados por regex antes de interpolar. Retorna true (fail-safe) se
 * a lista ficar vazia após validação.
 */
export async function algumInsumoMudou(
  client: SkipGateClient,
  rawSources: string[],
  desde: Date,
): Promise<boolean> {
  const tabelas = rawSources.filter((t) => NOME_RAW_VALIDO.test(t));
  if (tabelas.length === 0) return true;
  const clauses = tabelas
    .map((t) => `EXISTS(SELECT 1 FROM ${t} WHERE synced_at > $1)`)
    .join(" OR ");
  const rows = await client.$queryRawUnsafe<{ sujo: boolean }[]>(
    `SELECT (${clauses}) AS sujo`,
    desde,
  );
  return Boolean(rows[0]?.sujo);
}

export interface DecisaoGateArgs {
  client: SkipGateClient;
  nome: string;
  /** ultimoBuildAt do PRÓPRIO fato (null = nunca buildado). */
  ultimoBuildAt: Date | null;
  /** Mapa fato -> ultimoBuildAt (atualizado durante o ciclo conforme builders rodam). */
  mapaBuildAt: Map<string, Date>;
  /** Força tudo (1º ciclo após boot / deploy). */
  forcarTudo: boolean;
}

/**
 * Decide se o builder PRECISA rodar. Fail-safe para true em qualquer incerteza.
 * Dependência entre fatos: roda se algum pai foi buildado mais recentemente que eu
 * (cobre pai que rodou antes OU depois no ciclo, com lag de 1 ciclo idêntico ao full).
 */
export async function builderDeveRodar(args: DecisaoGateArgs): Promise<boolean> {
  const { client, nome, ultimoBuildAt, mapaBuildAt, forcarTudo } = args;
  if (forcarTudo) return true;
  const insumo = INSUMOS_BUILDER[nome];
  if (!insumo) return true; // não mapeado => sempre roda
  if (!ultimoBuildAt) return true; // nunca buildado
  for (const pai of insumo.dependsOn ?? []) {
    const paiBuildAt = mapaBuildAt.get(pai);
    if (!paiBuildAt) return true; // pai nunca buildado => roda por segurança
    if (paiBuildAt > ultimoBuildAt) return true; // pai mais novo que eu => reprocessa
  }
  return algumInsumoMudou(client, insumo.rawSources, ultimoBuildAt);
}
