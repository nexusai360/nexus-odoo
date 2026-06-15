// E2E dos resolvedores de entidade contra o cache REAL (nexus_odoo_l1).
//
// Runner: tsx (NAO jest). O client gerado do Prisma 7 e ESM (usa import.meta), que
// o ts-jest (CommonJS) nao carrega; por isso o E2E roda como script standalone, fora
// da suite jest, exatamente como o worker roda (.ts via tsx).
//
// Rodar (host, alcanca localhost:5436):
//   set -a; . ./.env.local; set +a; npx tsx src/lib/entities/__tests__/e2e/resolvers.e2e.ts
// Sai com codigo != 0 se qualquer assercao falhar (usavel em CI/gate).
//
// Fixtures ancorados em src/lib/entities/__tests__/e2e/fixtures.md (dado real 2026-06-07).
import { PrismaClient } from "../../../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  resolverArmazem,
  resolverProduto,
  resolverNotaFiscal,
  resolverContaContabil,
  resolverContaReferencial,
  resolverPedido,
  resolverNaturezaOperacao,
  resolverCentroResultado,
  resolverParceiro,
} from "../../index";

let falhas = 0;
let passou = 0;

function ok(cond: boolean, msg: string) {
  if (cond) {
    passou++;
  } else {
    falhas++;
    console.error(`  ✗ ${msg}`);
  }
}

function grupo(nome: string) {
  console.log(`\n[${nome}]`);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    // ── armazem ──────────────────────────────────────────────────────────────
    grupo("armazem");
    {
      const u = await resolverArmazem(prisma, "proprio");
      ok(u.status === "unica" && u.entidade.odooId === 1, "nome_unico 'proprio' => unica odoo_id=1");
      const id = await resolverArmazem(prisma, "1");
      ok(id.status === "unica" && id.entidade.odooId === 1, "id 1 => unica");
      const n = await resolverArmazem(prisma, "armazem inexistente xyz");
      ok(n.status === "nenhuma", "nome inexistente => nenhuma");
      const cs4 = await resolverArmazem(prisma, "7891234567895");
      ok(cs4.status === "nenhuma", "CS4 codigo longo inexistente => nenhuma");
    }

    // ── produto ──────────────────────────────────────────────────────────────
    grupo("produto");
    {
      const u = await resolverProduto(prisma, "964");
      ok(u.status === "unica" && u.entidade.odooId === 1, "codigo_unico '964' => unica odoo_id=1");
      const a = await resolverProduto(prisma, "CARENAGEM DO CROSS LONG LIFE");
      ok(a.status === "ambigua" && a.candidatas.length >= 2, "nome repetido => ambigua (>=2)");
      const n = await resolverProduto(prisma, "9999999999999");
      ok(n.status === "nenhuma", "CS4 EAN inexistente => nenhuma (sem fuzzy)");
    }

    // ── nota-fiscal ──────────────────────────────────────────────────────────
    grupo("nota-fiscal");
    {
      const u = await resolverNotaFiscal(prisma, "41260304028797000196550040000007371694680452");
      ok(u.status === "unica" && u.entidade.odooId === 43213, "chave 44d => unica odoo_id=43213");
      const c50 = await resolverNotaFiscal(prisma, "41260304028797000196550040000007371694680452999999");
      ok(c50.status === "nenhuma", "chave 50d => nenhuma (nao roteia)");
      const n = await resolverNotaFiscal(prisma, "999999999");
      ok(n.status === "nenhuma", "id inexistente => nenhuma");
    }

    // ── conta-contabil ───────────────────────────────────────────────────────
    grupo("conta-contabil");
    {
      const u = await resolverContaContabil(prisma, "1.1.1");
      ok(u.status === "unica" && u.entidade.odooId === 6, "codigo '1.1.1' => unica odoo_id=6");
      const af = await resolverContaContabil(prisma, "1.1");
      ok(af.status === "unica" && af.entidade.odooId === 5 && af.entidade.codigo === "1.1",
        "anti-falso-positivo: '1.1' => odoo_id=5 (nunca '1.1.1')");
      const a = await resolverContaContabil(prisma, "COMPENSAÇÃO ATIVA");
      ok(a.status === "ambigua" && a.candidatas.length >= 2, "nome repetido => ambigua (>=2)");
      const n = await resolverContaContabil(prisma, "9.9.9.9.9");
      ok(n.status === "nenhuma", "codigo inexistente => nenhuma");
    }

    // ── conta-referencial ────────────────────────────────────────────────────
    grupo("conta-referencial");
    {
      const u = await resolverContaReferencial(prisma, "3.01.01.05.01.47");
      ok(u.status === "unica" && u.entidade.odooId === 2214, "codigo unico '3.01.01.05.01.47' => unica odoo_id=2214");
      // codigo "1.01" existe em 2 linhas no SPED de-para (odoo_id 2 e 1104) => ambigua por codigo.
      const a = await resolverContaReferencial(prisma, "1.01");
      ok(a.status === "ambigua" && a.criterio === "codigo" && a.candidatas.length >= 2,
        "codigo '1.01' duplicado => ambigua criterio codigo (>=2)");
      const n = await resolverContaReferencial(prisma, "9.99.99");
      ok(n.status === "nenhuma", "codigo inexistente => nenhuma");
    }

    // ── pedido ───────────────────────────────────────────────────────────────
    grupo("pedido");
    {
      const u = await resolverPedido(prisma, "DV-0001/26");
      ok(u.status === "unica" && u.entidade.odooId === 45, "numero 'DV-0001/26' => unica odoo_id=45");
      const f = await resolverPedido(prisma, "pedido 123");
      ok(f.status === "nenhuma", "fora do formato 'pedido 123' => nenhuma");
      const n = await resolverPedido(prisma, "ZZ-9999/99");
      ok(n.status === "nenhuma", "numero inexistente no formato => nenhuma");
    }

    // ── natureza-operacao ────────────────────────────────────────────────────
    grupo("natureza-operacao");
    {
      const u = await resolverNaturezaOperacao(prisma, "001");
      ok(u.status === "unica" && u.entidade.codigo === "001" && /VENDA DE MERCADORIA/i.test(u.entidade.descricao ?? ""),
        "codigo '001' => unica com descricao de venda");
      const ns = await resolverNaturezaOperacao(prisma, "1");
      // namespace: nao existe codigo "1"; jamais retorna codigo "001" por confusao de id.
      ok(ns.status !== "unica" || ns.entidade.codigo !== "001",
        "namespace: ref '1' nao casa codigo '001' (codigo e string, nao id)");
      const n = await resolverNaturezaOperacao(prisma, "999");
      ok(n.status === "nenhuma", "codigo inexistente => nenhuma");
    }

    // ── centro-resultado ─────────────────────────────────────────────────────
    grupo("centro-resultado");
    {
      const u = await resolverCentroResultado(prisma, "1");
      ok(u.status === "unica" && u.entidade.odooId === 1 && u.entidade.nome.length > 0, "id 1 => unica com nome");
      const a = await resolverCentroResultado(prisma, "Logística - Logística");
      ok(a.status === "unica" && a.entidade.odooId === 1, "nome fuzzy quase-exato => unica odoo_id=1");
      const n = await resolverCentroResultado(prisma, "9999999");
      ok(n.status === "nenhuma", "id inexistente => nenhuma");
    }

    // ── parceiro (CS5: 3 formatos do mesmo CNPJ) ───────────────────────────────
    grupo("parceiro");
    {
      for (const ref of ["BR-00.000.000/5844-01", "00.000.000/5844-01", "00000000584401"]) {
        const r = await resolverParceiro(prisma, ref);
        ok(r.status === "unica" && r.entidade.odooId === 13585, `CS5 documento '${ref}' => unica odoo_id=13585`);
      }
      const a = await resolverParceiro(prisma, "Smartfit");
      ok(a.status === "ambigua" && a.candidatas.length >= 2, "nome 'Smartfit' repetido => ambigua (>=2)");
      const n = await resolverParceiro(prisma, "99999999999999");
      ok(n.status === "nenhuma", "documento inexistente => nenhuma");
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n=== E2E resolvers: ${passou} ok, ${falhas} falhas ===`);
  if (falhas > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
