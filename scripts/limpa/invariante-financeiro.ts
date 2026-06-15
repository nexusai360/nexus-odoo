/**
 * scripts/limpa/invariante-financeiro.ts , T5 do plan Limpa 2026+.
 *
 * Invariante de aceite do purge: a_pagar e a_receber EM ABERTO identicos
 * antes/depois, celula a celula (tipo x situacao_simples), nunca soma liquida.
 *
 * Modos:
 *  --capturar  grava a fotografia de fato_financeiro_titulo (worker PARADO).
 *  --comparar  re-consulta e compara com a captura; exit 1 se QUALQUER celula
 *              viva (aberto/provisorio) divergir. Quitado/baixado caindo e o
 *              proposito do purge (informativo).
 *
 * Uso: npx tsx --env-file=.env.local scripts/limpa/invariante-financeiro.ts --capturar|--comparar
 */
import { prisma } from "@/lib/prisma";
import {
  compararInvariante,
  type CelulaInvariante,
} from "@/worker/limpa/invariante";
import { readFileSync, writeFileSync } from "node:fs";

const CAPTURA = "docs/superpowers/research/limpa-2026-invariante-antes.json";

async function fotografia(): Promise<CelulaInvariante[]> {
  const r = await prisma.$queryRawUnsafe<
    { tipo: string; situacao: string | null; n: bigint; saldo: string | null; documento: string | null }[]
  >(
    `SELECT tipo, coalesce(situacao_simples, '(nula)') AS situacao, count(*) AS n,
            coalesce(sum(vr_saldo), 0)::text AS saldo,
            coalesce(sum(vr_documento), 0)::text AS documento
     FROM fato_financeiro_titulo GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  return r.map((x) => ({
    tipo: x.tipo,
    situacao: x.situacao ?? "(nula)",
    n: Number(x.n),
    saldo: x.saldo ?? "0",
    documento: x.documento ?? "0",
  }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--capturar")) {
    const foto = await fotografia();
    writeFileSync(CAPTURA, JSON.stringify({ em: new Date().toISOString(), celulas: foto }, null, 2));
    console.log(`[invariante] captura: ${foto.length} celulas em ${CAPTURA}`);
    for (const c of foto) console.log(`  ${c.tipo}/${c.situacao}: n=${c.n} saldo=${c.saldo}`);
  } else if (args.includes("--comparar")) {
    const antes = JSON.parse(readFileSync(CAPTURA, "utf8")).celulas as CelulaInvariante[];
    const depois = await fotografia();
    const r = compararInvariante(antes, depois);
    for (const i of r.informativos) console.log(`[invariante] info: ${i}`);
    for (const v of r.violacoes) console.error(`[invariante] VIOLACAO: ${v}`);
    console.log(r.ok
      ? "[invariante] OK , a pagar/receber em aberto identicos (R$ 0,00 de diferenca)"
      : "[invariante] FALHOU , abortar e restaurar do pg_dump (plan T5)");
    await prisma.$disconnect();
    process.exit(r.ok ? 0 : 1);
  } else {
    console.error("uso: --capturar | --comparar");
    process.exit(2);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
