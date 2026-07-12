import { margemAproximada } from "./margem-aproximada";
import type { PrismaClient } from "../../../generated/prisma/client";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

const CORTE_ISO = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`).toISOString();

// 1 query agregada por cfop_nome; classificacao ehReceita em TS (classificarCfop real).
function mockPrisma(rows: unknown[]): PrismaClient {
  return {
    $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
  } as unknown as PrismaClient;
}

/** Ultima chamada ao $queryRawUnsafe: [sql, ...params]. */
function chamada(prisma: PrismaClient, i = 0): { sql: string; params: unknown[] } {
  const mock = (prisma as unknown as { $queryRawUnsafe: jest.Mock }).$queryRawUnsafe;
  const [sql, ...params] = mock.mock.calls[i] as [string, ...unknown[]];
  return { sql, params };
}

describe("margemAproximada", () => {
  it("soma so itens de venda (ehReceita); custo/cobertura/margem coerentes", async () => {
    // 5102=venda(receita); 5152=transferencia(nao-receita, IGNORADO no custo e na receita)
    const r = await margemAproximada(
      mockPrisma([
        { cfop_nome: "5102 - Venda", vr: 1000, vr_com_custo: 800, custo: 500, itens_com_custo: 8, itens_custo_maior: 0 },
        { cfop_nome: "5152 - Transferencia", vr: 999, vr_com_custo: 999, custo: 999, itens_com_custo: 9, itens_custo_maior: 9 },
      ]),
      {},
    );
    expect(r.receitaVendaTotal).toBe(1000); // so a venda
    expect(r.receitaComCusto).toBe(800);
    expect(r.custoEstimado).toBe(500);
    expect(r.margemBrutaAproximada).toBe(300); // 800 - 500
    expect(r.percentualMargem).toBeCloseTo(0.375, 3); // 300/800
    expect(r.coberturaCusto).toBeCloseTo(0.8, 3); // 800/1000
    expect(r.receitaSemCusto).toBe(200);
    expect(r.custoDesatualizadoProvavel).toBe(false); // 0/8 custo>receita
  });

  it("custoDesatualizadoProvavel=true quando >10% dos itens de venda tem custo>receita", async () => {
    const r = await margemAproximada(
      mockPrisma([
        { cfop_nome: "5102 - Venda", vr: 1000, vr_com_custo: 1000, custo: 1200, itens_com_custo: 10, itens_custo_maior: 3 },
      ]),
      {},
    );
    expect(r.custoDesatualizadoProvavel).toBe(true); // 3/10 = 30% > 10%
    expect(r.margemBrutaAproximada).toBe(-200); // honesto: pode ser negativa
  });
});

// Data de inicio das analises: nota fiscal e documento historico, entao a margem nunca pode
// ler item anterior ao corte , nem quando o chamador nao manda periodo nenhum.
describe("margemAproximada , data de inicio das analises", () => {
  it("sem periodo: emite o recorte de data com piso no corte (nao varre o historico)", async () => {
    const prisma = mockPrisma([]);
    await margemAproximada(prisma, {});
    const { sql, params } = chamada(prisma);
    expect(sql).toContain("i.data_emissao >= $1::timestamptz");
    expect(sql).toContain("i.data_emissao < $2::timestamptz");
    expect(params[0]).toBe(CORTE_ISO);
  });

  it("periodoDe anterior ao corte: grampeia o inicio no corte", async () => {
    const prisma = mockPrisma([]);
    await margemAproximada(prisma, { periodoDe: "2024-01-01", periodoAte: "2026-06-30" });
    const { params } = chamada(prisma);
    expect(params[0]).toBe(CORTE_ISO); // 2024 nao existe para a plataforma
    expect(params[1]).toBe(new Date("2026-07-01T00:00:00Z").toISOString()); // borda exclusiva
  });

  it("periodo posterior ao corte passa intacto e a empresa vira o 3o parametro", async () => {
    const prisma = mockPrisma([]);
    await margemAproximada(prisma, { periodoDe: "2026-05-01", periodoAte: "2026-05-31", empresaId: 7 });
    const { sql, params } = chamada(prisma);
    expect(params[0]).toBe(new Date("2026-05-01T00:00:00Z").toISOString());
    expect(params[1]).toBe(new Date("2026-06-01T00:00:00Z").toISOString());
    expect(sql).toContain("i.empresa_id = $3");
    expect(params[2]).toBe(7);
  });

  it("a query por familia usa o MESMO recorte clampado da query principal", async () => {
    const prisma = mockPrisma([]);
    await margemAproximada(prisma, { periodoDe: "2020-01-01", porFamilia: true });
    const principal = chamada(prisma, 0);
    const familia = chamada(prisma, 1);
    expect(familia.sql).toContain("familia_nome");
    expect(familia.params).toEqual(principal.params);
    expect(familia.params[0]).toBe(CORTE_ISO);
  });
});
