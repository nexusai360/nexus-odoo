// mcp/lib/dias-atraso.test.ts
import { diasAtraso } from "./dias-atraso.js";

describe("diasAtraso", () => {
  const hoje = new Date("2026-05-18");

  it("vencimento no passado retorna dias positivos", () => {
    const venc = new Date("2026-05-10");
    expect(diasAtraso(venc, hoje)).toBe(8);
  });

  it("vencimento no futuro retorna 0", () => {
    const venc = new Date("2026-05-30");
    expect(diasAtraso(venc, hoje)).toBe(0);
  });

  it("vencimento null retorna 0", () => {
    expect(diasAtraso(null, hoje)).toBe(0);
  });

  it("vencimento no mesmo dia retorna 0 (não atrasado)", () => {
    expect(diasAtraso(new Date("2026-05-18"), hoje)).toBe(0);
  });

  it("vencimento exatamente 1 dia antes retorna 1", () => {
    expect(diasAtraso(new Date("2026-05-17"), hoje)).toBe(1);
  });

  it("vencimento de mês diferente calcula corretamente", () => {
    // 1 de abril a 18 de maio = 47 dias
    expect(diasAtraso(new Date("2026-04-01"), hoje)).toBe(47);
  });
});
