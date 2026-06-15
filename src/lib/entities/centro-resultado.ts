import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, Resolver, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";
import { rankearPorNome, type OpcoesRanking } from "./_ranking";

/**
 * Centro de resultado: dimensao desnormalizada em FatoFinanceiroLancamentoItem
 * (centro_resultado_id, centro_resultado_nome). Nao existe model proprio; a fonte
 * canonica e o DISTINCT dos centros efetivamente usados em lancamentos.
 * GAP CONHECIDO (spec 4.9): so aparecem centros que ja foram usados em algum
 * lancamento financeiro; centros cadastrados no Odoo mas nunca movimentados nao
 * sao resolviveis por aqui.
 */
export interface CentroResultado {
  odooId: number;
  nome: string;
}

/**
 * Defaults conservadores do resolvedor de centro de resultado.
 * limiarFuzzy mais alto (0.75) e margemFolga 0.1 para evitar centro falso num
 * universo de poucos distintos (so 6 no cache).
 */
export const DEFAULTS_CENTRO = { topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 } as const;

/**
 * Carrega os centros de resultado distintos do cache.
 * Cardinalidade baixa documentada (so 6 distintos): findMany com distinct sobre o
 * indice centro_resultado_id, filtrando nulos. Nao e um findMany cego; a clausula
 * where descarta linhas sem centro e o distinct colapsa as repeticoes. Reuso direto
 * desta lista no ramo id e no ramo nome (evita duas idas ao banco).
 */
async function carregarCentros(prisma: PrismaClient): Promise<CentroResultado[]> {
  const linhas = await prisma.fatoFinanceiroLancamentoItem.findMany({
    where: { centroResultadoId: { not: null } },
    distinct: ["centroResultadoId"],
    select: { centroResultadoId: true, centroResultadoNome: true },
  });
  return linhas
    .filter((l): l is { centroResultadoId: number; centroResultadoNome: string | null } => l.centroResultadoId !== null)
    .map((l) => ({ odooId: l.centroResultadoId, nome: l.centroResultadoNome ?? "" }));
}

/**
 * Resolve uma referencia textual (id ou nome) para um centro de resultado.
 * Estrategia: classificarRef da ref; se for id, igualdade exata por centroResultadoId
 * (nunca chuta). Caso contrario, ramo nome fuzzy (rankearPorNome) sobre os centros
 * distintos. Nunca devolve centro falso: top abaixo do limiar => nenhuma; empate
 * dentro da margem => ambigua com candidatas top-N; senao unica.
 * Candidata shape `{ odooId, nome }`.
 */
export const resolverCentroResultado: Resolver<CentroResultado> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<CentroResultado>> => {
  const r = ref.trim();
  if (r === "") return { status: "nenhuma" };

  const opcoesRanking: OpcoesRanking = {
    topN: opcoes?.topN ?? DEFAULTS_CENTRO.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_CENTRO.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_CENTRO.margemFolga,
  };

  const tipo = classificarRef(r);

  // Ramo id: igualdade exata por centroResultadoId (Int do odooId). Filtra no banco,
  // distinct para colapsar as repeticoes do mesmo centro em varios lancamentos.
  if (tipo === "id") {
    const idNum = Number(r);
    const linhas = await prisma.fatoFinanceiroLancamentoItem.findMany({
      where: { centroResultadoId: idNum },
      distinct: ["centroResultadoId"],
      select: { centroResultadoId: true, centroResultadoNome: true },
    });
    const match = linhas.find((l) => l.centroResultadoId === idNum);
    if (match && match.centroResultadoId !== null) {
      return { status: "unica", entidade: { odooId: match.centroResultadoId, nome: match.centroResultadoNome ?? "" }, score: 1 };
    }
    // id inexistente como centro: nao cai para nome (id puro nao e nome textual).
    return { status: "nenhuma" };
  }

  // Ramo nome fuzzy: carrega os centros distintos (cardinalidade 6) e rankeia.
  const centros = await carregarCentros(prisma);
  return rankearPorNome(centros, r, (c) => c.nome, opcoesRanking, "nome");
};
