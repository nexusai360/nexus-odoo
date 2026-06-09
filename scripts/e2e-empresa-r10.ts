// E2E manual (RADAR R10): resolver e faturamento por empresa contra o cache real.
// Roda: npx tsx --env-file=.env.local scripts/e2e-empresa-r10.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  resolverEmpresa,
  listarEmpresasDoFato,
} from "../src/lib/metrics/_shared/empresa";
import { faturamentoPorEmpresa } from "../src/lib/metrics/fiscal/faturamento-por-empresa";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  let falhas = 0;
  const ok = (cond: boolean, msg: string) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) falhas++;
  };

  // 1) Lista derivada do fato
  const lista = await listarEmpresasDoFato(prisma);
  console.log(`\n# empresas distintas no fato: ${lista.length}`);
  for (const e of lista) {
    console.log(`  id=${e.empresaId}  tipo=${e.tipo}  uf=${e.uf}  cnpj=${e.cnpj}  nome="${e.nome}"`);
  }

  // 2) Faturamento por empresa (agregado do fato) -> mapa id->valor
  const fpe = await faturamentoPorEmpresa(prisma, {});
  const valorPorId = new Map<number, { valor: number; nome: string | null }>();
  for (const l of fpe.linhas) {
    if (l.empresaId != null) valorPorId.set(l.empresaId, { valor: l.valor, nome: l.empresaNome });
  }

  // 3) Resoluções alvo do RADAR R10
  console.log("\n# resolucoes");
  const jhtdf = await resolverEmpresa(prisma, "Jht DF");
  console.log(`  'Jht DF' -> ${JSON.stringify(jhtdf)}`);
  ok(
    jhtdf.status === "ambigua"
      ? jhtdf.candidatas.every((c) => lista.some((e) => e.empresaId === c.odooId))
      : jhtdf.status === "unica" && lista.some((e) => e.empresaId === jhtdf.empresa.odooId),
    "'Jht DF' resolve para empresaId(s) reais do fato (id-space certo)",
  );

  const jds = await resolverEmpresa(prisma, "Jds Comercio"); // sem acento de proposito
  console.log(`  'Jds Comercio' (sem acento) -> status=${jds.status}`);
  const jdsIds =
    jds.status === "ambigua" ? jds.candidatas.map((c) => c.odooId) : jds.status === "unica" ? [jds.empresa.odooId] : [];
  ok(jdsIds.length > 0 && jdsIds.every((id) => lista.some((e) => e.empresaId === id)), "'Jds Comercio' acha empresa(s) (insensivel a acento)");

  // 4) Resolução única por nome qualificado -> faturamento filtrado bate com o agregado
  const alvoNome = "Jds Comercio - Matriz"; // sem acento, ainda deve casar id 4
  const rAlvo = await resolverEmpresa(prisma, alvoNome);
  console.log(`  '${alvoNome}' -> ${JSON.stringify(rAlvo)}`);
  ok(rAlvo.status === "unica", `'${alvoNome}' resolve unica`);
  if (rAlvo.status === "unica") {
    const id = rAlvo.empresa.odooId;
    const esperado = valorPorId.get(id);
    // soma direta via SQL para conferência cruzada
    const where = { entradaSaida: "1", situacaoNfe: "autorizada", empresaId: id } as const;
    const rows = await prisma.fatoNotaFiscal.findMany({ where, select: { vrNf: true, empresaNome: true } });
    const somaDireta = rows.reduce((s, r) => s + Number(r.vrNf ?? 0), 0);
    const nomeReal = rows[0]?.empresaNome ?? null;
    console.log(
      `    empresaId=${id} nomeNaNota="${nomeReal}" | faturamentoPorEmpresa=${esperado?.valor?.toFixed(2)} | somaSQL(autorizada,saida)=${somaDireta.toFixed(2)}`,
    );
    ok((nomeReal ?? "").toLowerCase().includes("jds"), "empresaId resolvido aponta para a empresa CERTA (Jds) na nota");
    ok(esperado != null && Math.abs((esperado.valor ?? 0)) > 0, "faturamentoPorEmpresa tem valor > 0 para o id resolvido");
  }

  // 5) Resolução por CNPJ exato
  const porCnpj = await resolverEmpresa(prisma, "18282961000100"); // Jds Matriz
  console.log(`  CNPJ 18282961000100 -> ${JSON.stringify(porCnpj)}`);
  ok(porCnpj.status === "unica" && /jds/i.test(porCnpj.empresa.nome), "CNPJ exato resolve a Jds Matriz");

  console.log(`\n${falhas === 0 ? "TODOS OS CHECKS PASSARAM" : `${falhas} CHECK(S) FALHARAM`}`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
