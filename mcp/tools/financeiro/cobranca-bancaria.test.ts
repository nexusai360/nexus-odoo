// mcp/tools/financeiro/cobranca-bancaria.test.ts
// Paginacao (alavanca 2b) das tools de cobranca bancaria.
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import {
  financeiroBaixasCobranca,
  financeiroRetornosProcessados,
  financeiroRemessasGeradas,
  financeiroCarteirasCobranca,
  financeiroCheques,
  financeiroPixRecebidos,
} from "./cobranca-bancaria.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoRetornoItem: { findMany: jest.fn(), count: jest.fn() },
    fatoRetornoBancario: { findMany: jest.fn(), count: jest.fn() },
    fatoRemessaBancaria: { findMany: jest.fn(), count: jest.fn() },
    fatoCarteiraCobranca: { findMany: jest.fn(), count: jest.fn() },
    fatoCheque: { findMany: jest.fn(), count: jest.fn() },
    fatoPix: { findMany: jest.fn(), count: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["financeiro"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx, fato: string, model: string) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato, ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model, lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

// Cada caso: tool + acessor do modelo prisma + decimal helper para a linha.
const dec = (n: number) => ({ toNumber: () => n });

describe("cobranca bancaria , paginacao (alavanca 2b)", () => {
  it("baixas: aplica take/skip e orderBy estavel com desempate por odooId", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_retorno_item", "finan.retorno.item");
    (ctx.prisma.fatoRetornoItem.count as jest.Mock).mockResolvedValue(100);
    (ctx.prisma.fatoRetornoItem.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        odooId: i + 1, situacao: "liquidado", nossoNumero: "1", dataPagamento: new Date("2026-05-20"),
        dividaParticipanteNome: "X", vrDocumento: dec(1), vrJuros: dec(0), vrMulta: dec(0),
        vrDesconto: dec(0), vrTarifas: dec(0), vrBaixado: dec(1), vrTotal: dec(1),
      })),
    );

    const r = await financeiroBaixasCobranca.handler({ limit: 10, offset: 0 } as never, ctx);
    const args = (ctx.prisma.fatoRetornoItem.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBe(10);
    expect(args.skip).toBe(0);
    expect(args.orderBy).toEqual([{ dataPagamento: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(100);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
      expect(r.dados._listaTruncada).toBe(true);
    }
  });

  it("baixas: default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_retorno_item", "finan.retorno.item");
    (ctx.prisma.fatoRetornoItem.count as jest.Mock).mockResolvedValue(3);
    (ctx.prisma.fatoRetornoItem.findMany as jest.Mock).mockResolvedValue([]);
    await financeiroBaixasCobranca.handler({} as never, ctx);
    const args = (ctx.prisma.fatoRetornoItem.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBe(PAGINACAO_LIMIT_DEFAULT);
    expect(args.skip).toBe(0);
  });

  it("retornos: ultima pagina nao tem mais (temMais=false, proximoOffset=null)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_retorno_bancario", "finan.retorno");
    (ctx.prisma.fatoRetornoBancario.count as jest.Mock).mockResolvedValue(15);
    (ctx.prisma.fatoRetornoBancario.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        odooId: i + 1, tipo: "R", bancoNome: "B", numero: "1", data: new Date("2026-05-20"),
        totalEntradas: dec(1), totalSaidas: dec(0), saldo: dec(1),
      })),
    );
    const r = await financeiroRetornosProcessados.handler({ limit: 10, offset: 10 } as never, ctx);
    const args = (ctx.prisma.fatoRetornoBancario.findMany as jest.Mock).mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.orderBy).toEqual([{ data: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("remessas: orderBy estavel + paginacao", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_remessa_bancaria", "finan.remessa");
    (ctx.prisma.fatoRemessaBancaria.count as jest.Mock).mockResolvedValue(2);
    (ctx.prisma.fatoRemessaBancaria.findMany as jest.Mock).mockResolvedValue([
      { odooId: 1, tipo: "R", bancoNome: "B", numero: "1", data: new Date("2026-05-20"), confirmada: true },
      { odooId: 2, tipo: "R", bancoNome: "B", numero: "2", data: new Date("2026-05-19"), confirmada: false },
    ]);
    const r = await financeiroRemessasGeradas.handler({ limit: 10, offset: 0 } as never, ctx);
    const args = (ctx.prisma.fatoRemessaBancaria.findMany as jest.Mock).mock.calls[0][0];
    expect(args.orderBy).toEqual([{ data: "desc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(2);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
    }
  });

  it("carteiras: paginacao com count e orderBy estavel", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_carteira_cobranca", "finan.carteira");
    (ctx.prisma.fatoCarteiraCobranca.count as jest.Mock).mockResolvedValue(25);
    (ctx.prisma.fatoCarteiraCobranca.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        odooId: i + 1, nome: `C${i}`, bancoNome: "B", banco: "B", carteira: "1",
        tipoCarteira: "x", beneficiario: "y", convenio: "z",
      })),
    );
    const r = await financeiroCarteirasCobranca.handler({ limit: 10, offset: 0 } as never, ctx);
    const args = (ctx.prisma.fatoCarteiraCobranca.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBe(10);
    expect(args.skip).toBe(0);
    expect(args.orderBy).toEqual([{ nome: "asc" }, { odooId: "asc" }]);
    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(25);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("cheques: take/skip e orderBy estavel", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_cheque", "finan.cheque");
    (ctx.prisma.fatoCheque.count as jest.Mock).mockResolvedValue(0);
    (ctx.prisma.fatoCheque.findMany as jest.Mock).mockResolvedValue([]);
    await financeiroCheques.handler({ limit: 5, offset: 5 } as never, ctx);
    const args = (ctx.prisma.fatoCheque.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBe(5);
    expect(args.skip).toBe(5);
    expect(args.orderBy).toEqual([{ data: "desc" }, { odooId: "asc" }]);
  });

  it("pix: take/skip e orderBy estavel", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx, "fato_pix", "finan.pix");
    (ctx.prisma.fatoPix.count as jest.Mock).mockResolvedValue(0);
    (ctx.prisma.fatoPix.findMany as jest.Mock).mockResolvedValue([]);
    await financeiroPixRecebidos.handler({ limit: 10, offset: 0 } as never, ctx);
    const args = (ctx.prisma.fatoPix.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBe(10);
    expect(args.skip).toBe(0);
    expect(args.orderBy).toEqual([{ data: "desc" }, { odooId: "asc" }]);
  });
});
