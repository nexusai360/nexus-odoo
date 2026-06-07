import { fiscalDetalharNota } from "./detalhar-nota.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoNotaFiscal: { findFirst: jest.fn() },
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
    { fato: "fato_nota_fiscal", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "sped.documento", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: now },
  ]);
}

function fakeNota() {
  return {
    odooId: 4242,
    numero: null,
    serie: "1",
    modelo: "55",
    chave: "35260612345678000190550010000000011000000010",
    entradaSaida: "saida",
    situacaoNfe: "autorizada",
    participanteNome: "Smartfit Academias",
    naturezaOperacaoNome: "Venda de mercadoria",
    dataEmissao: new Date("2026-05-20T00:00:00Z"),
    vrNf: 1500.5,
    vrProdutos: 1400.25,
  };
}

describe("fiscal_detalhar_nota , detalhe por odooId (CS6)", () => {
  it("odooId existente => encontrado:true com os campos confirmados", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findFirst as jest.Mock).mockResolvedValue(fakeNota());

    const r = await fiscalDetalharNota.handler({ odooId: 4242 } as never, ctx);

    const callArgs = (ctx.prisma.fatoNotaFiscal.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArgs.where).toEqual({ odooId: 4242 });

    if (r.estado === "preparando") throw new Error("freshness deveria estar primada");
    expect(r.dados.encontrado).toBe(true);
    const nota = r.dados.nota!;
    expect(nota.odooId).toBe(4242);
    expect(nota.serie).toBe("1");
    expect(nota.modelo).toBe("55");
    expect(nota.chave).toBe("35260612345678000190550010000000011000000010");
    expect(nota.entradaSaida).toBe("saida");
    expect(nota.situacaoNfe).toBe("autorizada");
    expect(nota.participanteNome).toBe("Smartfit Academias");
    expect(nota.naturezaOperacaoNome).toBe("Venda de mercadoria");
    expect(nota.dataEmissao).toBe("2026-05-20T00:00:00.000Z");
    expect(nota.vrNf).toBe(1500.5);
    expect(typeof nota.vrNf).toBe("number");
    expect(nota.vrProdutos).toBe(1400.25);
    // campo numero NAO deve existir no output (e 100% null no banco)
    expect("numero" in nota).toBe(false);
  });

  it("odooId inexistente => encontrado:false SEM throw", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findFirst as jest.Mock).mockResolvedValue(null);

    const r = await fiscalDetalharNota.handler({ odooId: 999999 } as never, ctx);

    if (r.estado === "preparando") throw new Error("freshness deveria estar primada");
    expect(r.dados.encontrado).toBe(false);
    expect(r.dados.nota).toBeNull();
  });

  it("o retorno valida contra o outputSchema Zod da tool", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoNotaFiscal.findFirst as jest.Mock).mockResolvedValue(fakeNota());

    const r = await fiscalDetalharNota.handler({ odooId: 4242 } as never, ctx);
    const parsed = fiscalDetalharNota.outputSchema.safeParse(r);
    expect(parsed.success).toBe(true);
  });
});
