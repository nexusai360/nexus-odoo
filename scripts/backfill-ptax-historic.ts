/**
 * Backfill one-shot: substitui o commercial de cada linha llm_usage pela
 * PTAX venda do BCB do dia da chamada (em BRT), e recalcula usd_to_brl_rate
 * e cost_brl com o multiplicador atual (1.058805 = (1+0.023)*(1+0.035)).
 *
 * - Datas sem PTAX (fim de semana/feriado) usam a ultima PTAX util anterior.
 * - Idempotente: roda quantas vezes quiser; resultado igual.
 * - Sem chamada de IA.
 *
 * Uso: tsx scripts/backfill-ptax-historic.ts
 */

import { prisma } from "@/lib/prisma";
import { RATE_SPREAD } from "@/lib/agent/llm/exchange-rate-constants";

const TZ = "America/Sao_Paulo";

function toBrtDate(iso: Date): string {
  // yyyy-mm-dd em BRT.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(iso);
}

function ymdToBcb(ymd: string): string {
  // BCB pede MM-DD-YYYY entre aspas.
  const [y, m, d] = ymd.split("-");
  return `${m}-${d}-${y}`;
}

async function fetchPtaxRange(startYmd: string, endYmd: string): Promise<Map<string, number>> {
  // Pega range com folga (3 dias antes) para cobrir fim de semana.
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados` +
    `?formato=json&dataInicial=${reformat(addDays(startYmd, -5))}` +
    `&dataFinal=${reformat(endYmd)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCB ${res.status}`);
  const data = (await res.json()) as Array<{ data: string; valor: string }>;
  const map = new Map<string, number>();
  for (const row of data) {
    // BCB devolve "dd/mm/yyyy".
    const [d, m, y] = row.data.split("/");
    map.set(`${y}-${m}-${d}`, Number(row.valor));
  }
  return map;
}

function reformat(ymd: string): string {
  // yyyy-mm-dd → dd/mm/yyyy (formato que o endpoint BCB SGS aceita).
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function ptaxFor(ymd: string, map: Map<string, number>): number | null {
  // Busca a PTAX desse dia; se nao houver (fds/feriado), recua ate 7 dias.
  for (let i = 0; i < 7; i++) {
    const v = map.get(addDays(ymd, -i));
    if (v != null) return v;
  }
  return null;
}

async function main() {
  // 1) Identifica datas unicas das chamadas.
  const rows = await prisma.llmUsage.findMany({
    where: { costKnown: true, costUsd: { not: null } },
    select: { id: true, createdAt: true, costUsd: true },
  });
  console.log(`[backfill] ${rows.length} linhas elegiveis para PTAX historico`);
  if (rows.length === 0) return;

  const ymds = new Set<string>();
  for (const r of rows) ymds.add(toBrtDate(r.createdAt));
  const sorted = [...ymds].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  console.log(`[backfill] range BRT: ${start} -> ${end} (${ymds.size} dias)`);

  // 2) Busca todas as PTAX no range (uma chamada so).
  const ptax = await fetchPtaxRange(start, end);
  console.log(`[backfill] PTAX retornadas pelo BCB: ${ptax.size}`);
  for (const [k, v] of ptax) {
    console.log(`  ${k} = R$ ${v.toFixed(4)}`);
  }

  // 3) Atualiza linha por linha.
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const ymd = toBrtDate(r.createdAt);
    const commercial = ptaxFor(ymd, ptax);
    if (commercial == null || r.costUsd == null) {
      skipped++;
      continue;
    }
    const rate = +(commercial * RATE_SPREAD).toFixed(6);
    const brl = +(Number(r.costUsd) * rate).toFixed(6);
    await prisma.llmUsage.update({
      where: { id: r.id },
      data: { usdToBrlRate: rate, rateSpread: RATE_SPREAD, costBrl: brl },
    });
    updated++;
  }
  console.log(`[backfill] linhas atualizadas: ${updated}; skipped: ${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] ERRO:", err);
    process.exit(1);
  });
