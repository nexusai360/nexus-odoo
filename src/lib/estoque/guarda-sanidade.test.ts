import { decidirRodada, TETO_BAIXAS, RECUSADAS_ATE_REBASE } from "./guarda-sanidade";

describe("decidirRodada", () => {
  it("primeira captura (sem base) e sempre base", () => {
    expect(decidirRodada({ baixasNestaRodada: 9999, temBaseAnterior: false, recusadasSeguidas: 0 })).toEqual({
      status: "base",
      motivo: null,
    });
  });

  it("baixas dentro do teto: ok", () => {
    expect(
      decidirRodada({ baixasNestaRodada: TETO_BAIXAS, temBaseAnterior: true, recusadasSeguidas: 0 }).status,
    ).toBe("ok");
  });

  it("baixas acima do teto: recusada", () => {
    const d = decidirRodada({ baixasNestaRodada: TETO_BAIXAS + 1, temBaseAnterior: true, recusadasSeguidas: 0 });
    expect(d.status).toBe("recusada");
    expect(d.motivo).toMatch(/baixas/i);
  });

  it("apos K recusas seguidas com a queda persistente, destrava numa nova base", () => {
    const d = decidirRodada({ baixasNestaRodada: 900, temBaseAnterior: true, recusadasSeguidas: RECUSADAS_ATE_REBASE });
    expect(d.status).toBe("base");
    expect(d.motivo).toMatch(/persistente/i);
  });
});
