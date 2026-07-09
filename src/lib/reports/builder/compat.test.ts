import { checarCompatibilidade } from "./compat";
import type { BuilderSection } from "./types";

// O registry importa "@/lib/prisma" (client gerado com import.meta, ESM) no
// topo; mockar evita o parse do client real no ambiente de teste.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const base: BuilderSection = {
  id: "s1",
  template: "DataTable",
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: {},
  filtros: [],
};

describe("checarCompatibilidade", () => {
  it("ok para DataTable + tabela + fato_estoque_saldo", () => {
    expect(checarCompatibilidade(base)).toEqual({ ok: true });
  });

  it("rejeita shape incompativel com o template (DataTable exige tabela)", () => {
    const r = checarCompatibilidade({ ...base, shapeDerivado: "serieTemporal" });
    expect(r.ok).toBe(false);
  });

  it("rejeita fonte que nao oferece o shape pedido", () => {
    const r = checarCompatibilidade({ ...base, fato: "fato_inexistente" });
    expect(r.ok).toBe(false);
  });
});
