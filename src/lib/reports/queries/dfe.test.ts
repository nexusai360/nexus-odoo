import {
  queryDfeImportadosPeriodo,
  queryDfePorFornecedor,
  queryDfePendentesManifestacao,
} from "./dfe";
import type { PrismaClient } from "@/generated/prisma/client";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

function mkPrisma(rows: unknown[]): PrismaClient {
  // Alavanca 2b: queries por linha agora usam count (total) + aggregate (soma).
  const soma = (rows as Array<{ vrNf?: unknown }>).reduce(
    (s, r) => s + Number(r.vrNf ?? 0),
    0,
  );
  return {
    fatoDfe: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
      aggregate: jest.fn().mockResolvedValue({ _sum: { vrNf: soma } }),
    },
  } as unknown as PrismaClient;
}

const row = (over: Record<string, unknown> = {}) => ({
  chave: "29...", numero: "48", modelo: "55", cnpjFornecedor: "12345678000199",
  fornecedorNome: "Forn X", vrNf: "100.00", dataEmissao: new Date("2024-12-12T08:00:00"),
  manifestacao: null, ...over,
});

describe("queryDfeImportadosPeriodo", () => {
  it("retorna linhas + totais com vrNf numerico e data ISO curta", async () => {
    const p = mkPrisma([row(), row({ vrNf: "50.00" })]);
    const r = await queryDfeImportadosPeriodo(p, {});
    expect(r.totalNotas).toBe(2);
    expect(r.valorTotal).toBe(150);
    expect(r.linhas[0].dataEmissao).toBe("2024-12-12");
    expect(r.linhas[0].vrNf).toBe(100);
  });
});

describe("queryDfePorFornecedor", () => {
  it("agrega por cnpjFornecedor", async () => {
    const p = mkPrisma([
      row({ cnpjFornecedor: "111", vrNf: "10" }),
      row({ cnpjFornecedor: "111", vrNf: "20" }),
      row({ cnpjFornecedor: "222", vrNf: "5" }),
    ]);
    const r = await queryDfePorFornecedor(p, {});
    expect(r.totalFornecedoresDistintos).toBe(2);
    expect(r.totalAgregado).toEqual({ quantidade: 3, valorTotal: 35 });
    expect(r.linhas[0].cnpjFornecedor).toBe("111"); // mais notas primeiro
    expect(r.linhas[0].quantidade).toBe(2);
  });
  it("filtra por documento (so digitos)", async () => {
    const p = mkPrisma([
      row({ cnpjFornecedor: "12.345.678/0001-99", vrNf: "10" }),
      row({ cnpjFornecedor: "99.999.999/0001-99", vrNf: "20" }),
    ]);
    const r = await queryDfePorFornecedor(p, { documento: "12345678" });
    expect(r.totalAgregado.quantidade).toBe(1);
    expect(r.linhas).toHaveLength(1);
  });
});

describe("queryDfePendentesManifestacao", () => {
  it("conta as pendentes retornadas pelo where", async () => {
    const p = mkPrisma([row({ manifestacao: null }), row({ manifestacao: "" })]);
    const r = await queryDfePendentesManifestacao(p, {});
    expect(r.totalPendentes).toBe(2);
    expect(r.valorTotal).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Data de inicio das analises (AppSetting sync.corte_dados)
//
// DF-e e nota fiscal de fornecedor: documento com data, HISTORICO. As tres consultas do
// arquivo passam pelo mesmo helper periodoWhere, que agora grampeia o inicio ao corte e
// mantem o piso mesmo sem periodo (antes o where saia VAZIO e varria o cache inteiro).
// ---------------------------------------------------------------------------

describe("dfe , data de inicio das analises", () => {
  const PISO = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`);

  it("queryDfeImportadosPeriodo sem periodo aplica o piso do corte", async () => {
    const p = mkPrisma([]);
    await queryDfeImportadosPeriodo(p, {});
    const call = (p.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(PISO);
    // o count e o aggregate leem o MESMO recorte (totais nao podem divergir da lista)
    expect((p.fatoDfe.count as jest.Mock).mock.calls[0][0].where.dataEmissao.gte).toEqual(PISO);
    expect((p.fatoDfe.aggregate as jest.Mock).mock.calls[0][0].where.dataEmissao.gte).toEqual(PISO);
  });

  it("queryDfeImportadosPeriodo grampeia periodo anterior ao corte", async () => {
    const p = mkPrisma([]);
    await queryDfeImportadosPeriodo(p, { periodoDe: "2024-01-01", periodoAte: "2026-06-30" });
    const call = (p.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(PISO);
    expect(call.where.dataEmissao.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("queryDfeImportadosPeriodo preserva periodo posterior ao corte", async () => {
    const p = mkPrisma([]);
    await queryDfeImportadosPeriodo(p, { periodoDe: "2026-05-01", periodoAte: "2026-05-31" });
    const call = (p.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao).toEqual({
      gte: new Date("2026-05-01T00:00:00Z"),
      lt: new Date("2026-06-01T00:00:00Z"),
    });
  });

  it("queryDfePorFornecedor sem periodo aplica o piso do corte", async () => {
    const p = mkPrisma([]);
    await queryDfePorFornecedor(p, {});
    const call = (p.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(PISO);
  });

  it("queryDfePendentesManifestacao sem periodo aplica o piso do corte (sem perder o OR de manifestacao)", async () => {
    const p = mkPrisma([]);
    await queryDfePendentesManifestacao(p, {});
    const call = (p.fatoDfe.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataEmissao.gte).toEqual(PISO);
    expect(call.where.OR).toEqual([{ manifestacao: null }, { manifestacao: "" }]);
  });
});
