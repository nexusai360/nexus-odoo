/**
 * scripts/pericia-reconcile-finan.ts
 *
 * Perícia + conserto: reconcilia raw_finan_lancamento contra o Odoo ao vivo
 * (marca rawDeleted nos sumidos). DRY-RUN por padrão; passe --apply para gravar.
 *
 * Uso: tsx --env-file=.env.local scripts/pericia-reconcile-finan.ts [--apply]
 */
import { clientFromEnv } from "@/worker/odoo/client";
import { prisma } from "@/lib/prisma";

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const apply = process.argv.includes("--apply");
  const odoo = clientFromEnv("read");
  await odoo.authenticate();

  const vivos = new Set(await odoo.searchIds("finan.lancamento", []));
  console.log(`[vivo] finan.lancamento IDs vivos = ${vivos.size}`);

  const cache = await prisma.rawFinanLancamento.findMany({
    where: { rawDeleted: false },
    select: { odooId: true },
  });
  console.log(`[cache] raw nao-deletados = ${cache.length}`);

  const sumidos = cache.map((r) => r.odooId).filter((id) => !vivos.has(id));
  console.log(`[sumidos] no cache mas NAO no vivo = ${sumidos.length}`);

  // quanto desses sumidos sao a_pagar provisorio com saldo>0 (o que inflava o numero)
  if (sumidos.length) {
    const det = await prisma.$queryRawUnsafe<{ tipo: string; sit: string; n: bigint; saldo: number }[]>(
      `SELECT (data->>'tipo') tipo, (data->>'situacao') sit, count(*) n, round(sum((data->>'vr_saldo')::numeric),2) saldo
       FROM raw_finan_lancamento WHERE odoo_id = ANY($1::int[]) GROUP BY 1,2 ORDER BY saldo DESC NULLS LAST`,
      sumidos,
    );
    console.log("[sumidos] por tipo/situacao:");
    for (const d of det) console.log(`  ${String(d.tipo).padEnd(12)} ${String(d.sit).padEnd(12)} n=${d.n} saldo=${fmt(Number(d.saldo ?? 0))}`);
  }

  if (apply && sumidos.length) {
    const r = await prisma.rawFinanLancamento.updateMany({
      where: { odooId: { in: sumidos } },
      data: { rawDeleted: true },
    });
    console.log(`\n[APPLY] marcados rawDeleted=true: ${r.count}`);
  } else {
    console.log(`\n[DRY-RUN] nada gravado. Rode com --apply para purgar.`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
