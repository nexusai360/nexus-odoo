import { fiscalCertificados } from "./certificados.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoCertificado: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["fiscal"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_certificado", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.certificado", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: i + 1,
    tipo: "e-CNPJ",
    numeroSerie: `s${i + 1}`,
    proprietario: `P${i + 1}`,
    cnpjCpf: "11111111000111",
    dataInicioValidade: new Date("2025-01-01T00:00:00Z"),
    dataFimValidade: new Date("2027-01-01T00:00:00Z"),
    dataVencimentoUtil: new Date("2026-12-15T00:00:00Z"),
    nomeArquivo: `f${i + 1}.pfx`,
  }));
}

describe("fiscal_certificados , paginacao (alavanca 2b)", () => {
  it("aplica limit/offset (take/skip) e desempate estavel no orderBy", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoCertificado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(10));
    (ctx.prisma.fatoCertificado.count as jest.Mock).mockResolvedValue(40);

    const r = await fiscalCertificados.handler({ limit: 10, offset: 0 } as never, ctx);
    const callArgs = (ctx.prisma.fatoCertificado.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(0);
    expect(callArgs.orderBy).toEqual([{ dataFimValidade: "asc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(40);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoCertificado.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoCertificado.findMany as jest.Mock).mockResolvedValue(fakeLinhas(3));

    await fiscalCertificados.handler({} as never, ctx);
    const callArgs = (ctx.prisma.fatoCertificado.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(PAGINACAO_LIMIT_DEFAULT);
  });
});
