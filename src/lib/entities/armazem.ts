import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, Resolver, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";
import { normalizar, scoreFuzzy } from "./_fuzzy";
import { rankearPorNome, type OpcoesRanking } from "./_ranking";

/**
 * Defaults conservadores de armazem (local de estoque). topN limita as candidatas
 * de uma resolucao ambigua; limiarFuzzy e o minimo aceito no ramo de nome (abaixo
 * disso => nenhuma, nunca chuta); margemFolga e a distancia minima do 1o sobre o 2o
 * para promover a unica.
 */
export const DEFAULTS_ARMAZEM = { topN: 3, limiarFuzzy: 0.8, margemFolga: 0.1 } as const;

/**
 * Candidata canonica de armazem, mapeada do Json `raw_estoque_local.data`.
 * Fonte = RawEstoqueLocal (`data` Json). NAO existe `code` no model (spec 4.1);
 * a chave forte textual e o `nome_unico` (slug lowercase sem espaco, ex.: "proprio").
 */
export interface ArmazemCandidata {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  nomeUnico: string | null;
  parentPath: string | null;
  localSuperiorId: number | null;
  nivel: number | null;
  tipo: string | null;
  // codigoBarras so aparece quando o Odoo manda um valor textual real; false/null
  // do Odoo nao vira campo (evita poluir a candidata com "false").
  codigoBarras?: string;
}

type RowLike = { odooId: number; data: unknown };

/** String util ou null. Odoo manda `false` no lugar de vazio; tratamos como ausente. */
function texto(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

/** Numero util ou null. Aceita id puro ou tupla Odoo many2one [id, label]. */
function relId(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (Array.isArray(v) && typeof v[0] === "number") return v[0];
  return null;
}

/**
 * Mapeia uma linha de `raw_estoque_local` (odooId + data Json) para a candidata canonica.
 * Funcao pura. Keys ausentes viram null; `codigo_barras` false/null e ignorado.
 */
export function mapArmazemRow(row: RowLike): ArmazemCandidata {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const candidata: ArmazemCandidata = {
    odooId: row.odooId,
    nome: texto(d.nome),
    nomeCompleto: texto(d.nome_completo),
    nomeUnico: texto(d.nome_unico),
    parentPath: texto(d.parent_path),
    localSuperiorId: relId(d.local_superior_id),
    nivel: typeof d.nivel === "number" ? d.nivel : null,
    tipo: texto(d.tipo),
  };
  const cb = texto(d.codigo_barras);
  if (cb !== null) candidata.codigoBarras = cb;
  return candidata;
}

/** Ultimo segmento de um nome_completo hierarquico ("a / b / c" => "c"). */
function ultimoSegmento(nomeCompleto: string): string {
  const partes = nomeCompleto.split("/");
  return (partes[partes.length - 1] ?? nomeCompleto).trim();
}

/**
 * Score hierarquico: melhor entre casar o `nome_completo` inteiro e casar so o ultimo
 * segmento dele (armadilha 4.1a , o usuario costuma digitar so a folha "Estoque SP",
 * nao o caminho "Proprio / Filial SP / Estoque SP"). Cai para `nome` quando nao ha
 * nome_completo.
 */
function scoreHierarquico(ref: string, c: ArmazemCandidata): number {
  const alvoCompleto = c.nomeCompleto ?? c.nome ?? "";
  const folha = c.nomeCompleto ? ultimoSegmento(c.nomeCompleto) : (c.nome ?? "");
  return Math.max(scoreFuzzy(ref, alvoCompleto), scoreFuzzy(ref, folha));
}

/**
 * Resolve uma referencia textual (id, nome_unico ou nome hierarquico) para um local de
 * estoque do cache. Estrategia:
 *  1. ref classificada como id (`^\d{1,9}$`) => findUnique por odooId. Achou: unica score 1.
 *     Nao achou: NUNCA cai em fuzzy de nome (CS4) , id numerico que nao existe e `nenhuma`,
 *     senao "123" viraria match textual de algum nome contendo "123".
 *  2. codigo numerico longo (`^\d{10,18}$`) ou chave/documento: armazem nao tem essas
 *     chaves, entao tambem retorna `nenhuma` sem fuzzy (CS4).
 *  3. nome_unico exato (slug, comparado normalizado) => unica.
 *  4. nome fuzzy-hierarquico sobre `nome_completo` e seu ultimo segmento; aplica filtros
 *     de `opcoes.filtros` (tipo, local_superior_id) antes de decidir ambiguidade.
 * Nunca devolve armazem falso: ambiguo => candidatas top-N; sem match => nenhuma.
 *
 * `findMany` sem filtro de nome no banco e aceitavel aqui pela cardinalidade baixa
 * (~centenas de locais), ao contrario de parceiro/produto (dezenas de milhares); o
 * match hierarquico precisa do conjunto em memoria. Carrega so where rawDeleted=false.
 */
export const resolverArmazem: Resolver<ArmazemCandidata> = async (
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<ArmazemCandidata>> => {
  const r = ref.trim();
  if (r.length === 0) return { status: "nenhuma" };

  const tipoRef = classificarRef(r);

  // Ramo id: findUnique direto. Nao achou => nenhuma (CS4, nunca fuzzy de numero).
  if (tipoRef === "id") {
    const row = await prisma.rawEstoqueLocal.findUnique({ where: { odooId: Number(r) } });
    if (row) return { status: "unica", entidade: mapArmazemRow(row), score: 1 };
    return { status: "nenhuma" };
  }

  // Codigo numerico longo / chave / documento: armazem nao tem essas chaves fortes.
  // Curto-circuito CS4: nao deixa um numero virar match fuzzy de algum nome.
  if (tipoRef === "codigo_numerico_longo" || tipoRef === "chave_nfe" || tipoRef === "documento") {
    return { status: "nenhuma" };
  }

  // Carrega a base ativa (cardinalidade baixa) e mapeia.
  const rows = await prisma.rawEstoqueLocal.findMany({ where: { rawDeleted: false } });
  const candidatos = rows.map(mapArmazemRow);

  // Ramo nome_unico exato (slug normalizado).
  const alvo = normalizar(r);
  const exatos = candidatos.filter((c) => c.nomeUnico !== null && normalizar(c.nomeUnico) === alvo);
  if (exatos.length === 1) return { status: "unica", entidade: exatos[0], score: 1 };

  // Aplica filtros de opcoes antes do ranking (desempate por tipo / local_superior_id).
  const filtros = opcoes?.filtros ?? {};
  const filtrados = candidatos.filter((c) => {
    if (typeof filtros.tipo === "string" && c.tipo !== filtros.tipo) return false;
    if (typeof filtros.local_superior_id === "number" && c.localSuperiorId !== filtros.local_superior_id) {
      return false;
    }
    return true;
  });

  // Ramo fuzzy-hierarquico: score = melhor entre nome_completo inteiro e ultimo segmento.
  const opc: OpcoesRanking = {
    topN: opcoes?.topN ?? DEFAULTS_ARMAZEM.topN,
    limiarFuzzy: opcoes?.limiarFuzzy ?? DEFAULTS_ARMAZEM.limiarFuzzy,
    margemFolga: opcoes?.margemFolga ?? DEFAULTS_ARMAZEM.margemFolga,
  };
  return rankearPorNome(
    filtrados,
    r,
    (c) => c.nomeCompleto ?? c.nome ?? "",
    opc,
    "nome",
    (c) => scoreHierarquico(r, c),
  );
};
