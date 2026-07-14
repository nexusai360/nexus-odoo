// src/lib/fiscal/divergencias.ts
//
// O PLACAR do modo sombra. É o que o dono pediu para poder decidir a virada com prova:
// "eu quero saber quantos acertos está tendo. Se tiver vários acertos e não tiver nenhum
// erro ou quase nenhum, a gente já começa a estudar e a mudar definitivamente."
//
// Tudo aqui é LEITURA das colunas que o worker materializou (venda_por_natureza,
// classificacao_divergente, natureza_desconhecida). Nada disto entra em KPI, relatório ou
// resposta do Nex , é uma tela de acompanhamento, e só.
//
// Respeita a data de início das análises (`sync.corte_dados`), como toda leitura de
// histórico da plataforma.

import type { PrismaClient } from "@/generated/prisma/client";
import { corteAtualDate } from "@/lib/corte-dados";

export interface PlacarClassificacao {
  /** Notas de saída autorizada (55/65, não devolução) desde a data de início das análises. */
  notasAvaliadas: number;
  /** As duas regras chegaram à mesma conclusão. */
  concordancias: number;
  /** Percentual de acerto entre as duas regras. */
  percentualAcerto: number;
  /** Total de divergências (as duas somadas). */
  divergencias: number;
  /** Faturamento pela regra que MANDA hoje (nome da operação). É o número da plataforma. */
  totalPorNome: number;
  /** Faturamento que a regra nova (natureza) daria, se estivesse valendo. */
  totalPorNatureza: number;
  /** Naturezas de operação que ninguém mapeou ainda. */
  naturezasDesconhecidas: number;
}

export interface LinhaDivergencia {
  odooId: number;
  numero: string | null;
  dataEmissao: Date | null;
  vrNf: number;
  participanteNome: string | null;
  operacaoNome: string | null;
  naturezaOperacaoNome: string | null;
  /** O que a regra de HOJE (nome) decidiu , e é o que vale no dashboard. */
  porNome: boolean;
  /** O que a regra NOVA (natureza) teria decidido. */
  porNatureza: boolean;
  /** A natureza dessa nota não está no catálogo. */
  naturezaDesconhecida: boolean;
}

/** Só notas que podem virar receita: saída, autorizada, NF-e/NFC-e, não devolução. */
const CANDIDATAS_A_RECEITA = {
  entradaSaida: "1",
  situacaoNfe: "autorizada",
  modelo: { in: ["55", "65"] },
  NOT: { finalidadeNfe: "4" },
};

export async function obterPlacar(prisma: PrismaClient): Promise<PlacarClassificacao> {
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: { ...CANDIDATAS_A_RECEITA, dataEmissao: { gte: corteAtualDate() } },
    select: {
      vrNf: true,
      isVendaExterna: true,
      vendaPorNatureza: true,
      classificacaoDivergente: true,
      naturezaDesconhecida: true,
    },
  });

  let concordancias = 0;
  let divergencias = 0;
  let naturezasDesconhecidas = 0;
  let totalPorNome = 0;
  let totalPorNatureza = 0;

  for (const n of notas) {
    const valor = Number(n.vrNf);
    if (n.isVendaExterna) totalPorNome += valor;
    if (n.vendaPorNatureza) totalPorNatureza += valor;
    if (n.classificacaoDivergente) divergencias++;
    else concordancias++;
    if (n.naturezaDesconhecida) naturezasDesconhecidas++;
  }

  const notasAvaliadas = notas.length;
  return {
    notasAvaliadas,
    concordancias,
    divergencias,
    percentualAcerto: notasAvaliadas ? (concordancias / notasAvaliadas) * 100 : 100,
    totalPorNome,
    totalPorNatureza,
    naturezasDesconhecidas,
  };
}

/** As notas em que as duas regras discordaram. É a lista para calibrar o catálogo. */
export async function listarDivergencias(
  prisma: PrismaClient,
  limite = 200,
): Promise<LinhaDivergencia[]> {
  const linhas = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...CANDIDATAS_A_RECEITA,
      dataEmissao: { gte: corteAtualDate() },
      classificacaoDivergente: true,
    },
    orderBy: [{ vrNf: "desc" }],
    take: limite,
    select: {
      odooId: true,
      numero: true,
      dataEmissao: true,
      vrNf: true,
      participanteNome: true,
      operacaoNome: true,
      naturezaOperacaoNome: true,
      isVendaExterna: true,
      vendaPorNatureza: true,
      naturezaDesconhecida: true,
    },
  });

  return linhas.map((l) => ({
    odooId: l.odooId,
    numero: l.numero,
    dataEmissao: l.dataEmissao,
    vrNf: Number(l.vrNf),
    participanteNome: l.participanteNome,
    operacaoNome: l.operacaoNome,
    naturezaOperacaoNome: l.naturezaOperacaoNome,
    porNome: l.isVendaExterna ?? false,
    porNatureza: l.vendaPorNatureza ?? false,
    naturezaDesconhecida: l.naturezaDesconhecida ?? false,
  }));
}

export interface NaturezaDesconhecida {
  naturezaOperacaoId: number | null;
  naturezaOperacaoNome: string | null;
  notas: number;
  valor: number;
  /** Quanto disso a regra de hoje já conta como receita (pelo nome da operação). */
  valorContadoHoje: number;
}

/**
 * As naturezas que ninguém mapeou. É O ALERTA que impede o próximo prejuízo silencioso:
 * uma operação nova cadastrada na Tauga aparece AQUI, com o valor envolvido, em vez de
 * simplesmente sumir do faturamento como sumiram os R$ 538 mil da venda futura.
 */
export async function listarNaturezasDesconhecidas(
  prisma: PrismaClient,
): Promise<NaturezaDesconhecida[]> {
  const linhas = await prisma.fatoNotaFiscal.findMany({
    where: {
      ...CANDIDATAS_A_RECEITA,
      dataEmissao: { gte: corteAtualDate() },
      naturezaDesconhecida: true,
    },
    select: {
      naturezaOperacaoId: true,
      naturezaOperacaoNome: true,
      vrNf: true,
      isVendaExterna: true,
    },
  });

  const porNatureza = new Map<string, NaturezaDesconhecida>();
  for (const l of linhas) {
    const chave = String(l.naturezaOperacaoId ?? "sem-natureza");
    const atual = porNatureza.get(chave) ?? {
      naturezaOperacaoId: l.naturezaOperacaoId,
      naturezaOperacaoNome: l.naturezaOperacaoNome,
      notas: 0,
      valor: 0,
      valorContadoHoje: 0,
    };
    atual.notas++;
    atual.valor += Number(l.vrNf);
    if (l.isVendaExterna) atual.valorContadoHoje += Number(l.vrNf);
    porNatureza.set(chave, atual);
  }

  return [...porNatureza.values()].sort((a, b) => b.valor - a.valor);
}
