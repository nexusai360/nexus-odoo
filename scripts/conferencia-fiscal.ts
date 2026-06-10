// scripts/conferencia-fiscal.ts
// BASE DE CONFERENCIA fiscal: confronta as metricas (TS) contra o dado bruto (SQL
// independente), por ano, e acusa qualquer divergencia. E o "raio-x" de sanidade que
// garante que os numeros de receita sao verdadeiros. Rodar:
//   E2E=1 npx tsx --env-file=.env.local scripts/conferencia-fiscal.ts
// Sai com codigo 1 se algum invariante de GATE quebrar (serve de gate). Alertas (S1/S2)
// logam mas nao falham.
import { prisma } from "@/lib/prisma";
import { faturamentoPorCfop } from "@/lib/metrics/fiscal/faturamento-por-cfop";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { carregarParticipantesGrupo } from "@/lib/fiscal/grupo";
import { PARTICIPANTES_GRUPO_WHITELIST } from "@/lib/fiscal/grupo/whitelist-grupo";
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "@/lib/fiscal/grupo/cnpj";
import { RAIZES_GRUPO } from "@/lib/fiscal/grupo/raizes-cnpj";
import { Prisma } from "@/generated/prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const TOL = 0.5; // meio real de tolerancia (arredondamento)

interface Periodo { rotulo: string; de?: string; ate?: string; }

// Le o baseline em RUNTIME (fs), nao por import estatico: docs/ esta no .dockerignore,
// entao um import quebraria o `npm run build` (Next typecheca scripts/). Este script so
// roda local com E2E=1, onde docs/ existe.
const BASELINE_ELIM = JSON.parse(
  readFileSync(join(process.cwd(), "docs/superpowers/research/baseline-eliminacao-pre-whitelist.json"), "utf8"),
) as Record<string, number>;

function condPeriodo(de?: string, ate?: string): Prisma.Sql[] {
  const cond: Prisma.Sql[] = [];
  if (de && ate) cond.push(Prisma.sql`data_emissao >= ${`${de}T00:00:00Z`}::timestamptz AND data_emissao < (${`${ate}T00:00:00Z`}::timestamptz + interval '1 day')`);
  return cond;
}

async function somaBrutoSql(de?: string, ate?: string): Promise<number> {
  // Soma vr_produtos dos itens de saida autorizada (mesma base das metricas), via SQL puro.
  const cond = [Prisma.sql`entrada_saida = '1'`, Prisma.sql`situacao_nfe = 'autorizada'`, ...condPeriodo(de, ate)];
  const rows = await prisma.$queryRaw<Array<{ soma: Prisma.Decimal | null }>>(
    Prisma.sql`SELECT COALESCE(SUM(vr_produtos),0) AS soma FROM fato_nota_fiscal_item WHERE ${Prisma.join(cond, " AND ")}`,
  );
  return Number(rows[0]?.soma ?? 0);
}

async function somaPorSituacaoSql(situacao: string, de?: string, ate?: string): Promise<number> {
  const cond = [Prisma.sql`entrada_saida = '1'`, Prisma.sql`situacao_nfe = ${situacao}`, ...condPeriodo(de, ate)];
  const rows = await prisma.$queryRaw<Array<{ soma: Prisma.Decimal | null }>>(
    Prisma.sql`SELECT COALESCE(SUM(vr_produtos),0) AS soma FROM fato_nota_fiscal_item WHERE ${Prisma.join(cond, " AND ")}`,
  );
  return Number(rows[0]?.soma ?? 0);
}

async function somaTodasSituacoesSql(de?: string, ate?: string): Promise<number> {
  const cond = [Prisma.sql`entrada_saida = '1'`, ...condPeriodo(de, ate)];
  const rows = await prisma.$queryRaw<Array<{ soma: Prisma.Decimal | null }>>(
    Prisma.sql`SELECT COALESCE(SUM(vr_produtos),0) AS soma FROM fato_nota_fiscal_item WHERE ${Prisma.join(cond, " AND ")}`,
  );
  return Number(rows[0]?.soma ?? 0);
}

function check(nome: string, a: number, b: number, erros: string[]): void {
  const ok = Math.abs(a - b) <= TOL;
  console.log(`   ${ok ? "OK  " : "XX  "} ${nome}: ${brl(a)} vs ${brl(b)} (dif ${brl(a - b)})`);
  if (!ok) erros.push(nome);
}

// Gate de "nao menor que": valor >= minimo (com tolerancia). Usado por S0/S4.
function checkGte(nome: string, valor: number, minimo: number, erros: string[]): void {
  const ok = valor >= minimo - TOL;
  console.log(`   ${ok ? "OK  " : "XX  "} ${nome}: ${brl(valor)} >= ${brl(minimo)}`);
  if (!ok) erros.push(nome);
}

// Alerta de banda (contagem dentro de [min,max]). Loga; nao e gate.
function checkBanda(nome: string, valor: number, min: number, max: number, alertas: string[]): void {
  const ok = valor >= min && valor <= max;
  console.log(`   ${ok ? "ok  " : "!!  "} ${nome}: ${valor} em [${min}, ${max}]`);
  if (!ok) alertas.push(`${nome} (=${valor}, esperado [${min},${max}])`);
}

// S1: notas marcadas intragrupo SO por nome se whitelist+cadastro estivessem vazios
// (mede a fragilidade do cadastro do Odoo, independente da whitelist).
async function soPorNome(de: string | undefined, ate: string | undefined, cadastro: Set<number>): Promise<number> {
  const where: Prisma.FatoNotaFiscalWhereInput = { entradaSaida: "1", situacaoNfe: "autorizada" };
  if (de && ate) where.dataEmissao = { gte: new Date(`${de}T00:00:00Z`), lt: new Date(new Date(`${ate}T00:00:00Z`).getTime() + 86400000) };
  const notas = await prisma.fatoNotaFiscal.findMany({ where, select: { participanteId: true, participanteNome: true } });
  let n = 0;
  for (const nota of notas) {
    const raiz = extrairRaizCnpjDeTexto(nota.participanteNome);
    const casaNome = raiz !== null && RAIZES_GRUPO.has(raiz);
    if (!casaNome) continue;
    const idConfiavel =
      nota.participanteId !== null &&
      (PARTICIPANTES_GRUPO_WHITELIST.has(nota.participanteId) || cadastro.has(nota.participanteId));
    if (!idConfiavel) n++;
  }
  return n;
}

// S2: participantes cujo nome (cadastro) tem raiz do grupo mas o documento aponta FORA.
async function divergenciaNomeCadastro(): Promise<number> {
  const parceiros = await prisma.fatoParceiro.findMany({ select: { documentoDigits: true, nome: true } });
  let div = 0;
  for (const p of parceiros) {
    const raizNome = extrairRaizCnpjDeTexto(p.nome);
    if (!(raizNome && RAIZES_GRUPO.has(raizNome))) continue;
    const raizDoc = extrairRaizCnpj(p.documentoDigits);
    if (raizDoc && !RAIZES_GRUPO.has(raizDoc)) div++;
  }
  return div;
}

async function main() {
  if (process.env.E2E !== "1") { console.log("SKIP: defina E2E=1."); return; }
  const erros: string[] = [];
  const alertas: string[] = [];
  const cadastro = await carregarParticipantesGrupo(prisma);
  const periodos: Periodo[] = [
    { rotulo: "2023", de: "2023-01-01", ate: "2023-12-31" },
    { rotulo: "2024", de: "2024-01-01", ate: "2024-12-31" },
    { rotulo: "2025", de: "2025-01-01", ate: "2025-12-31" },
    { rotulo: "2026 (ate jun)", de: "2026-01-01", ate: "2026-06-30" },
    { rotulo: "ACUMULADO (13 anos)", de: undefined, ate: undefined },
  ];

  for (const p of periodos) {
    console.log(`\n== ${p.rotulo} ==`);
    const f1 = await faturamentoPorCfop(prisma, { agruparPor: "categoria", periodoDe: p.de, periodoAte: p.ate });
    const rc = await receitaConsolidada(prisma, { periodoDe: p.de, periodoAte: p.ate });
    const brutoSql = await somaBrutoSql(p.de, p.ate);

    console.log(`   bruto(produtos)=${brl(f1.totalProdutos)} | receita=${brl(f1.totalReceita)} | nao-receita=${brl(f1.totalNaoReceita)} | semCfop=${brl(f1.semCfop.valorProdutos)}`);
    console.log(`   receita externa=${brl(rc.receitaExterna)} | intragrupo eliminado=${brl(rc.receitaIntragrupoEliminavel)} (${(rc.percentualEliminado * 100).toFixed(1)}%)`);

    // INVARIANTE 1: a base da metrica bate com o dado bruto (SQL independente).
    check("I1 base TS == bruto SQL", f1.totalProdutos, brutoSql, erros);
    // INVARIANTE 2: bruto = receita + nao-receita (decomposicao fechada).
    check("I2 receita+naoReceita == bruto", f1.totalReceita + f1.totalNaoReceita, f1.totalProdutos, erros);
    // INVARIANTE 3: receita individual (F2) == receita total (F1) , reconciliacao cruzada.
    check("I3 F2.individual == F1.receita", rc.receitaIndividualTotal, f1.totalReceita, erros);
    // INVARIANTE 4 / S3: receita externa + intragrupo eliminavel == receita individual.
    check("I4/S3 externa+intragrupo == individual", rc.receitaExterna + rc.receitaIntragrupoEliminavel, rc.receitaIndividualTotal, erros);
    // INVARIANTE 5: eliminavel <= bruto intragrupo (nao elimina mais do que existe).
    check("I5 eliminavel <= bruto intragrupo", Math.min(rc.receitaIntragrupoEliminavel, rc.intercompanyBrutoVrProdutos), rc.receitaIntragrupoEliminavel, erros);

    // S0 (gate): a eliminacao intragrupo NAO pode reduzir abaixo do baseline pre-whitelist.
    checkGte("S0 eliminacao nao reduz (pos>=pre-whitelist)", rc.receitaIntragrupoEliminavel, BASELINE_ELIM[p.rotulo] ?? 0, erros);

    // S4 (gate): o filtro situacao='autorizada' esta ativo , a base exclui em_digitacao.
    // Se o filtro fosse removido, a base saltaria para somaTodas; o excluido (>= em_digitacao) prova o filtro.
    const somaEmDig = await somaPorSituacaoSql("em_digitacao", p.de, p.ate);
    const somaTodas = await somaTodasSituacoesSql(p.de, p.ate);
    checkGte("S4 em_digitacao fora da base", somaTodas - f1.totalProdutos, somaEmDig, erros);
    console.log(`   (S4) em_digitacao no periodo = ${brl(somaEmDig)} (excluido da base de receita).`);
  }

  // S1/S2 (alertas, nao-gate): fragilidade RESIDUAL do cadastro APOS a whitelist.
  // S1 conta notas intragrupo cobertas SO pelo nome (nem whitelist nem cadastro). Com a
  // whitelist no caminho o residual e baixo (2025=0, acumulado~109): se SALTAR, surgiu uma
  // entidade do grupo nao-whitelistada , acionavel (adicionar a whitelist). Bandas medidas
  // no cache real 2026-06-10 pos-whitelist.
  console.log(`\n== SENTINELAS de cadastro (alertas) ==`);
  checkBanda("S1 residual so-por-nome 2025", await soPorNome("2025-01-01", "2025-12-31", cadastro), 0, 100, alertas);
  checkBanda("S1 residual so-por-nome ACUMULADO", await soPorNome(undefined, undefined, cadastro), 0, 300, alertas);
  checkBanda("S2 divergencia nome x cadastro", await divergenciaNomeCadastro(), 0, 20, alertas);

  await prisma.$disconnect();
  console.log(`\n${"=".repeat(50)}`);
  if (alertas.length) console.log(`ALERTAS (nao-gate): ${alertas.length} , ${alertas.join("; ")}`);
  if (erros.length) {
    console.error(`FALHOU: ${erros.length} invariante(s) de gate divergiram: ${erros.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("TODOS os invariantes de gate fecham. Os numeros de receita sao consistentes com o dado bruto.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
