// scripts/e2e-data-inicio-analises.ts
//
// E2E da REGRA DE OURO contra o cache REAL: a data de inicio das analises (AppSetting
// sync.corte_dados) e um FILTRO de leitura, e ela parametriza a plataforma inteira.
//
// O que este script prova, exercitando as consultas de verdade (as mesmas que a Diretoria, os
// Relatorios e as tools do Nex chamam):
//   1. mover a data para FRENTE estreita a janela: todo numero de historico encolhe ou fica;
//   2. mover a data para TRAS traz o historico DE VOLTA, na hora, sem re-sync e sem perda;
//   3. o que e FOTO (saldo de estoque) nao muda: nao e historico;
//   4. nenhum dado e apagado: a contagem crua das tabelas do cache e a mesma no fim.
//
// Rodar:  npx tsx --env-file=.env.local scripts/e2e-data-inicio-analises.ts
// Ao final, restaura a data que estava configurada antes.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CORTE_DADOS_KEY,
  getCorteDados,
  invalidarCacheCorte,
  corteLabel,
} from "../src/lib/corte-dados";
import { faturamentoAutorizado } from "../src/lib/metrics/fiscal/faturamento-autorizado";
import {
  queryContasAReceber,
  queryContasAPagar,
  queryTitulosVencidos,
} from "../src/lib/reports/queries/financeiro";
import { queryComprasPorFornecedor } from "../src/lib/diretoria/queries/estoque";
import { queryIndicadoresEstoque } from "../src/lib/diretoria/queries/estoque";
import { queryIndicadoresDemandas } from "../src/lib/diretoria/queries/pedidos";
import { queryEntradasSaidas } from "../src/lib/reports/queries/estoque";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const HOJE = new Date();

/** Tabelas cruas do cache: a contagem NAO pode mudar (nada e apagado). */
const TABELAS = [
  "fato_nota_fiscal",
  "fato_pedido",
  "fato_financeiro_titulo",
  "fato_estoque_movimento",
  "fato_dfe",
] as const;

interface Foto {
  faturamento: number;
  aReceber: number;
  aPagar: number;
  vencidos: number;
  compras: number;
  demandasAbertas: number;
  movimentoEntradas: number;
  saldoEstoqueValor: number;
}

async function definirCorte(iso: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CORTE_DADOS_KEY },
    update: { value: iso },
    create: { key: CORTE_DADOS_KEY, value: iso, category: "sync" },
  });
  invalidarCacheCorte();
  const lido = await getCorteDados(prisma); // hidrata o cache de processo, como fazem os entrypoints
  if (lido !== iso) throw new Error(`corte nao aplicou: pedi ${iso}, li ${lido}`);
}

async function fotografar(): Promise<Foto> {
  const [fat, receber, pagar, vencidos, compras, estoque, demandas, movimento] =
    await Promise.all([
      faturamentoAutorizado(prisma, {}),
      queryContasAReceber(prisma, {}, HOJE),
      queryContasAPagar(prisma, {}, HOJE),
      queryTitulosVencidos(prisma, HOJE),
      queryComprasPorFornecedor(prisma, {}),
      queryIndicadoresEstoque(prisma),
      queryIndicadoresDemandas(prisma, HOJE, {}),
      queryEntradasSaidas(prisma, {}),
    ]);

  return {
    faturamento: Number(fat.valor ?? 0),
    aReceber: receber.totalAReceber,
    aPagar: pagar.totalAPagar,
    vencidos: vencidos.totalVencido,
    compras: Number(compras.valorGeral ?? 0),
    demandasAbertas: demandas.totalPendentes ?? 0,
    movimentoEntradas: movimento.serie.reduce((s, p) => s + Number(p.entrada ?? 0), 0),
    saldoEstoqueValor: Number(estoque.valorTotal ?? 0),
  };
}

async function contarTabelas(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABELAS) {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM ${t}`,
    );
    out[t] = Number(r[0]?.n ?? 0);
  }
  return out;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function linha(rotulo: string, a: number, b: number, c: number): string {
  const fmt = (n: number) => (Math.abs(n) > 1000 ? brl(n) : n.toLocaleString("pt-BR"));
  return `${rotulo.padEnd(26)} ${fmt(a).padStart(16)} ${fmt(b).padStart(16)} ${fmt(c).padStart(16)}`;
}

async function main() {
  const original = await getCorteDados(prisma);
  console.log(`Corte configurado hoje: ${corteLabel(original)}\n`);

  const antes = await contarTabelas();
  const falhas: string[] = [];

  // 1) A data padrao (o que a plataforma mostra hoje).
  await definirCorte("2026-03-16");
  const base = await fotografar();

  // 2) Move para FRENTE: a janela estreita.
  await definirCorte("2026-05-01");
  const estreito = await fotografar();

  // 3) Move para TRAS: o historico volta na hora (o cache guarda desde 2026-01-01).
  await definirCorte("2026-01-01");
  const largo = await fotografar();

  console.log(
    ["".padEnd(26), "16/03/2026".padStart(16), "01/05/2026".padStart(16), "01/01/2026".padStart(16)].join(" "),
  );
  console.log("-".repeat(78));
  const chaves: [keyof Foto, string][] = [
    ["faturamento", "Faturamento"],
    ["aReceber", "Contas a receber"],
    ["aPagar", "Contas a pagar"],
    ["vencidos", "Titulos vencidos"],
    ["compras", "Compras (DF-e)"],
    ["demandasAbertas", "Demandas abertas"],
    ["movimentoEntradas", "Entradas de estoque"],
    ["saldoEstoqueValor", "Saldo de estoque (FOTO)"],
  ];
  for (const [k, rotulo] of chaves) {
    console.log(linha(rotulo, base[k], estreito[k], largo[k]));
  }
  console.log();

  // ─── Provas ────────────────────────────────────────────────────────────────
  const historicas: (keyof Foto)[] = [
    "faturamento",
    "aReceber",
    "aPagar",
    "vencidos",
    "compras",
    "demandasAbertas",
    "movimentoEntradas",
  ];

  // (1) Mover para frente NUNCA aumenta um numero de historico.
  for (const k of historicas) {
    if (estreito[k] > base[k] + 0.01) {
      falhas.push(`${k}: mover a data para FRENTE aumentou o numero (${base[k]} -> ${estreito[k]})`);
    }
  }

  // (2) Pelo menos um numero tem que REAGIR (senao o clamp nao esta ligado em lugar nenhum).
  const reagiram = historicas.filter((k) => Math.abs(estreito[k] - base[k]) > 0.01);
  if (reagiram.length === 0) {
    falhas.push("NENHUM numero mudou ao mover a data: o filtro nao esta valendo");
  }

  // (3) Voltar a data traz o historico de volta (janela maior = numero maior ou igual).
  for (const k of historicas) {
    if (largo[k] < base[k] - 0.01) {
      falhas.push(`${k}: voltar a data para TRAS diminuiu o numero (${base[k]} -> ${largo[k]})`);
    }
  }

  // (4) Foto e foto: saldo de estoque nao pode variar com a data de analise.
  if (
    Math.abs(base.saldoEstoqueValor - estreito.saldoEstoqueValor) > 0.01 ||
    Math.abs(base.saldoEstoqueValor - largo.saldoEstoqueValor) > 0.01
  ) {
    falhas.push("saldo de estoque (foto atual) mudou com a data: nao deveria");
  }

  // (5) NADA foi apagado.
  const depois = await contarTabelas();
  for (const t of TABELAS) {
    if (antes[t] !== depois[t]) {
      falhas.push(`${t}: a contagem mudou (${antes[t]} -> ${depois[t]}). A data NAO pode apagar nada.`);
    }
  }
  console.log("Linhas no cache (antes -> depois):");
  for (const t of TABELAS) console.log(`  ${t.padEnd(26)} ${antes[t]} -> ${depois[t]}`);
  console.log();

  console.log(`Reagiram a data: ${reagiram.join(", ") || "(nenhum)"}\n`);

  await definirCorte(original);
  console.log(`Corte restaurado para ${corteLabel(original)}.\n`);

  if (falhas.length) {
    console.error("FALHOU:");
    for (const f of falhas) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("OK: a data de inicio das analises filtra a plataforma inteira, e nada e apagado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
