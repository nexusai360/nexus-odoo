import {
  queryDfeImportadosPeriodo,
  queryDfePorFornecedor,
  queryDfePendentesManifestacao,
} from "./dfe";
import type { PrismaClient } from "@/generated/prisma/client";

function mkPrisma(rows: unknown[]): PrismaClient {
  return {
    fatoDfe: { findMany: jest.fn().mockResolvedValue(rows) },
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
