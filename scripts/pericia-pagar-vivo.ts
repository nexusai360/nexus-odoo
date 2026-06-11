/**
 * scripts/pericia-pagar-vivo.ts
 *
 * Perícia: confronta o cache (raw_finan_lancamento) com o Odoo AO VIVO para o
 * a_pagar provisório, para entender a divergência de R$172mi vista no print.
 *
 * Uso: tsx --env-file=.env.local scripts/pericia-pagar-vivo.ts
 */
import { clientFromEnv } from "@/worker/odoo/client";
import { prisma } from "@/lib/prisma";

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const odoo = clientFromEnv("read");
  await odoo.authenticate();

  // 1. AO VIVO: todos os a_pagar, por situacao (id, situacao, vr_saldo, data_vencimento)
  const vivos = await odoo.searchRead<Record<string, unknown>>(
    "finan.lancamento",
    [["tipo", "=", "a_pagar"]],
    ["id", "situacao", "situacao_divida_simples", "vr_saldo", "data_vencimento"],
    { limit: 20000 },
  );
  console.log(`[vivo] total a_pagar (finan.lancamento) = ${vivos.length}`);

  const aggVivo: Record<string, { n: number; saldo: number; saldoPos: number; nPos: number }> = {};
  const idsVivoProvPos = new Set<number>();
  for (const r of vivos) {
    const sit = String(r.situacao ?? "-");
    const saldo = Number(r.vr_saldo ?? 0);
    aggVivo[sit] ??= { n: 0, saldo: 0, saldoPos: 0, nPos: 0 };
    aggVivo[sit].n++;
    aggVivo[sit].saldo += saldo;
    if (saldo > 0) {
      aggVivo[sit].saldoPos += saldo;
      aggVivo[sit].nPos++;
      if (sit === "provisorio") idsVivoProvPos.add(Number(r.id));
    }
  }
  console.log("\n[vivo] a_pagar por situacao (saldo>0):");
  for (const [sit, v] of Object.entries(aggVivo)) {
    console.log(`  ${sit.padEnd(12)} n=${v.n} (saldo>0: ${v.nPos})  saldo>0=${fmt(v.saldoPos)}`);
  }

  // 2. CACHE: provisorio a_pagar saldo>0 ids
  const cacheRows = await prisma.$queryRawUnsafe<{ odoo_id: number; vr_saldo: string }[]>(`
    SELECT odoo_id, vr_saldo FROM fato_financeiro_titulo
    WHERE tipo='a_pagar' AND situacao='provisorio' AND vr_saldo>0;
  `);
  console.log(`\n[cache] provisorio a_pagar saldo>0 = ${cacheRows.length} / ${fmt(cacheRows.reduce((s, r) => s + Number(r.vr_saldo), 0))}`);

  // 3. Quais ids do cache NAO estao mais como provisorio-saldo>0 no vivo?
  const idsVivoMap = new Map<number, Record<string, unknown>>();
  for (const r of vivos) idsVivoMap.set(Number(r.id), r);

  const stale: { id: number; saldoCache: number; estadoVivo: string }[] = [];
  let somaStale = 0;
  for (const c of cacheRows) {
    if (!idsVivoProvPos.has(c.odoo_id)) {
      const vivo = idsVivoMap.get(c.odoo_id);
      const estadoVivo = vivo
        ? `situacao=${vivo.situacao} saldo=${Number(vivo.vr_saldo ?? 0)}`
        : "NAO EXISTE NO VIVO (deletado/fora do a_pagar)";
      stale.push({ id: c.odoo_id, saldoCache: Number(c.vr_saldo), estadoVivo });
      somaStale += Number(c.vr_saldo);
    }
  }
  console.log(`\n[divergencia] ${stale.length} titulos do cache NAO sao mais provisorio-saldo>0 no vivo, somando ${fmt(somaStale)}`);
  // amostra dos estados reais desses titulos
  const porEstado: Record<string, { n: number; soma: number }> = {};
  for (const s of stale) {
    const chave = s.estadoVivo.startsWith("situacao=") ? s.estadoVivo.split(" ")[0] : "inexistente_no_vivo";
    porEstado[chave] ??= { n: 0, soma: 0 };
    porEstado[chave].n++;
    porEstado[chave].soma += s.saldoCache;
  }
  console.log("[divergencia] estado REAL (vivo) desses titulos:");
  for (const [k, v] of Object.entries(porEstado)) console.log(`  ${k.padEnd(28)} n=${v.n}  somaNoCache=${fmt(v.soma)}`);
  console.log("\n[amostra] 8 titulos divergentes:");
  for (const s of stale.slice(0, 8)) console.log(`  id=${s.id} cacheSaldo=${fmt(s.saldoCache)} | vivo: ${s.estadoVivo}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
