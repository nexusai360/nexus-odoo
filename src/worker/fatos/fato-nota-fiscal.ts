// src/worker/fatos/fato-nota-fiscal.ts
// Builder do fato_nota_fiscal , fonte: raw_sped_documento (modelo sped.documento).
//
// tipoMovimento é derivado de entrada_saida: "1"→"saida", "0"→"entrada", else→"outro".
// Nunca é null , alinhado com @default("outro") no schema (achado P-I6).
// dataEmissao/dataEntradaSaida/dataAutorizacao usam sufixo T00:00:00Z (parsing
// em UTC , canônico e TZ-independente; alinha com os boundaries UTC das queries
// de período. Datas Odoo são date-only).
// Valores monetários via Number(... ?? 0). mapper não produz atualizadoEm (@default(now())).

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../lib/fiscal/grupo";
import { classificaReceita } from "../../lib/fiscal/regras/classificacao-receita";

export interface FatoNotaFiscalRow {
  odooId: number;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  entradaSaida: string | null;
  tipoMovimento: string;
  situacaoNfe: string | null;
  finalidadeNfe: string | null;
  chave: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  naturezaOperacaoId: number | null;
  naturezaOperacaoNome: string | null;
  // Operação fiscal (sped.documento.operacao_id, ex.: [3, "AOP1 - Venda LR"]). É o único
  // campo que separa venda de venda interna , as duas compartilham a mesma natureza.
  operacaoId: number | null;
  operacaoNome: string | null;
  empresaId: number | null;
  empresaNome: string | null;
  dataEmissao: Date | null;
  dataEntradaSaida: Date | null;
  dataAutorizacao: Date | null;
  vrNf: number;
  vrProdutos: number;
  vrFatura: number;
  vrIbpt: number;
  vrIcmsProprio: number;
  vrDesconto: number;
  // NÃO inclui atualizadoEm , @default(now()) no schema (decisão N5)
}

/**
 * Deriva tipoMovimento a partir do campo entrada_saida.
 * "1" → "saida", "0" → "entrada", qualquer outro (incluindo null/undefined) → "outro".
 */
export function derivarTipoMovimento(entradaSaida: string): string {
  if (entradaSaida === "1") return "saida";
  if (entradaSaida === "0") return "entrada";
  // Ramo "outro" , inclui null, undefined, string desconhecida
  console.warn(`[fato-nota-fiscal] entradaSaida desconhecida: ${JSON.stringify(entradaSaida)} → tipoMovimento="outro"`);
  return "outro";
}

export function mapNotaFiscalRow(raw: Record<string, unknown>): FatoNotaFiscalRow {
  const entradaSaida = typeof raw.entrada_saida === "string" ? raw.entrada_saida : null;
  return {
    odooId: Number(raw.id),
    numero: typeof raw.numero === "string" ? raw.numero : null,
    serie: typeof raw.serie === "string" ? raw.serie : null,
    modelo: typeof raw.modelo === "string" ? raw.modelo : null,
    entradaSaida,
    tipoMovimento: derivarTipoMovimento(entradaSaida as string),
    situacaoNfe: typeof raw.situacao_nfe === "string" ? raw.situacao_nfe : null,
    finalidadeNfe: typeof raw.finalidade_nfe === "string" ? raw.finalidade_nfe : null,
    chave: typeof raw.chave === "string" ? raw.chave : null,
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    naturezaOperacaoId: relId(raw.natureza_operacao_id as OdooM2O),
    naturezaOperacaoNome: relNome(raw.natureza_operacao_id as OdooM2O),
    operacaoId: relId(raw.operacao_id as OdooM2O),
    operacaoNome: relNome(raw.operacao_id as OdooM2O),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaNome: relNome(raw.empresa_id as OdooM2O),
    dataEmissao: typeof raw.data_emissao === "string" ? new Date(`${raw.data_emissao}T00:00:00Z`) : null,
    dataEntradaSaida: typeof raw.data_entrada_saida === "string" ? new Date(`${raw.data_entrada_saida}T00:00:00Z`) : null,
    dataAutorizacao: typeof raw.data_autorizacao === "string" ? new Date(`${raw.data_autorizacao}T00:00:00Z`) : null,
    vrNf: Number(raw.vr_nf ?? 0),
    vrProdutos: Number(raw.vr_produtos ?? 0),
    vrFatura: Number(raw.vr_fatura ?? 0),
    vrIbpt: Number(raw.vr_ibpt ?? 0),
    vrIcmsProprio: Number(raw.vr_icms_proprio ?? 0),
    vrDesconto: Number(raw.vr_desconto ?? 0),
  };
}

/** Abaixo disto, a regra nova está claramente quebrada (e não apenas divergindo em casos
 *  de borda). O dono pediu explicitamente esse gatilho: "ainda mais se o valor da busca por
 *  esse novo modelo for zero ou muito abaixo, você já usa sempre o valor da busca pelo nome". */
const PISO_SANIDADE_NATUREZA = 0.9;

interface LinhaClassificada {
  vrNf: number;
  isVendaExterna: boolean;
  vendaPorNatureza: boolean;
}

/**
 * GUARDA-CORPO agregado do modo sombra.
 *
 * A trava contra prejuízo já é estrutural (`is_venda_externa` recebe SEMPRE a regra antiga,
 * então nenhum número pode se mover por causa da regra nova). Este alerta serve para o outro
 * lado: avisar que a regra NOVA desabou, antes de alguém propor virar a chave.
 *
 * Dispara quando a natureza reconhece ZERO receita havendo receita pelo nome, ou quando ela
 * fica abaixo de 90% do total do nome. Um catálogo de naturezas desatualizado (operação nova
 * cadastrada na Tauga) apareceria exatamente assim.
 */
export function alertaGuardaCorpo(linhas: LinhaClassificada[]): void {
  const totalNome = linhas.reduce((s, l) => s + (l.isVendaExterna ? l.vrNf : 0), 0);
  const totalNatureza = linhas.reduce((s, l) => s + (l.vendaPorNatureza ? l.vrNf : 0), 0);
  if (totalNome <= 0) return;

  const razao = totalNatureza / totalNome;
  if (razao < PISO_SANIDADE_NATUREZA) {
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    console.warn(
      `[classificacao-receita] GUARDA-CORPO: a regra por NATUREZA caiu para ` +
        `${(razao * 100).toFixed(1)}% da regra por NOME (${fmt(totalNatureza)} contra ` +
        `${fmt(totalNome)}). O numero exibido esta protegido (quem manda e o nome), mas o ` +
        `catalogo de naturezas provavelmente esta desatualizado. Ver o painel de divergencias.`,
    );
  }
}

/** Reconstrói fato_nota_fiscal a partir de raw_sped_documento.
 * Filtra rawDeleted=false. Transação: deleteMany + createMany + markFatoBuilt.
 * Timeout estendido: com a base real (~47 mil documentos) o createMany passa
 * dos 5s padrão da transação interativa do Prisma (P2028). */
export async function rebuildFatoNotaFiscal(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedDocumento.findMany({
    where: { rawDeleted: false },
  });

  // is_venda_externa é gravado JUNTO com a nota, na mesma transação. Antes ele era
  // materializado só no builder de classificação, que roda três builders depois: entre o
  // truncate+insert daqui e o passo de lá, a coluna ficava NULL na tabela inteira , e como
  // o dashboard, os relatórios e o agente Nex leem essa coluna, o faturamento aparecia como
  // R$ 0,00 nessa janela, a cada ciclo do worker (3 min). Calculado aqui, ela nunca é nula.
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  const mapped = rawRows.map((r) => {
    const row = mapNotaFiscalRow(r.data as Record<string, unknown>);
    // MODO SOMBRA: as duas regras correm juntas. `decisao` (= a regra do NOME) é o que a
    // plataforma enxerga; o resto é observação para o painel de divergências. Ver
    // classificacao-receita.ts e o laudo docs/pericia-classificacao-receita-2026-07-13.md.
    const c = classificaReceita({
      entradaSaida: row.entradaSaida,
      situacaoNfe: row.situacaoNfe,
      modelo: row.modelo,
      operacaoNome: row.operacaoNome,
      finalidadeNfe: row.finalidadeNfe,
      naturezaOperacaoId: row.naturezaOperacaoId,
      intragrupo: ehNotaIntragrupo(
        { participanteId: row.participanteId, participanteNome: row.participanteNome },
        participantesGrupo,
      ),
    });
    return {
      ...row,
      isVendaExterna: c.decisao,
      vendaPorNatureza: c.porNatureza,
      classificacaoDivergente: c.divergente,
      naturezaDesconhecida: c.naturezaDesconhecida,
    };
  });

  alertaGuardaCorpo(mapped);

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoNotaFiscal.deleteMany({});
      if (mapped.length) {
        await tx.fatoNotaFiscal.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_nota_fiscal");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
