import { describe, it, expect } from "@jest/globals";
import { resolverBom, type LinhaBom } from "./resolver-bom";

function linha(over: Partial<LinhaBom>): LinhaBom {
  return {
    componenteProdutoId: 1,
    componenteNome: "comp",
    quantidade: 1,
    listaId: 10,
    listaDataAtivacao: new Date("2025-11-24T00:00:00Z"),
    listaInativa: false,
    ...over,
  };
}

describe("resolverBom", () => {
  it("kit de lista única passa reto (agrega todas as linhas, sem multiplasListas)", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 10 }),
      linha({ componenteProdutoId: 2, listaId: 10 }),
    ]);
    expect(r.multiplasListas).toBe(false);
    expect(r.componentes).toHaveLength(2);
    expect(r.listaEscolhida).toBe(10);
  });

  it("kit de lista única NUNCA ativada NÃO zera (protege os 18 kits)", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 10, listaDataAtivacao: null }),
      linha({ componenteProdutoId: 2, listaId: 10, listaDataAtivacao: null }),
    ]);
    expect(r.componentes).toHaveLength(2); // BOM mantida
  });

  it("kit de lista única INATIVADA passa reto (impacto vivo zero; nao explode)", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 10, listaInativa: true, listaDataAtivacao: null }),
    ]);
    expect(r.componentes).toHaveLength(1);
    expect(r.multiplasListas).toBe(false);
  });

  it("multi-lista: escolhe a ativada quando a outra nunca foi ativada (607, 1281)", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 161, listaDataAtivacao: null }),
      linha({ componenteProdutoId: 2, listaId: 172, listaDataAtivacao: new Date("2026-07-03T00:00:00Z") }),
    ]);
    expect(r.multiplasListas).toBe(true);
    expect(r.listaEscolhida).toBe(172);
    expect(r.componentes.map((c) => c.componenteProdutoId)).toEqual([2]);
  });

  it("multi-lista ativas mesma data: desempate por maior listaId (431, 21287)", () => {
    const d = new Date("2026-07-09T00:00:00Z");
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 174, listaDataAtivacao: d }),
      linha({ componenteProdutoId: 2, listaId: 175, listaDataAtivacao: d }),
    ]);
    expect(r.listaEscolhida).toBe(175);
    expect(r.componentes.map((c) => c.componenteProdutoId)).toEqual([2]);
  });

  it("multi-lista todas inativas: usa todas (all-inactive nunca zera)", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 1, listaId: 10, listaInativa: true }),
      linha({ componenteProdutoId: 2, listaId: 20, listaInativa: true }),
    ]);
    expect(r.componentes.length).toBeGreaterThan(0);
  });

  it("componente repetido na lista escolhida soma a quantidade", () => {
    const r = resolverBom([
      linha({ componenteProdutoId: 5, listaId: 10, quantidade: 2 }),
      linha({ componenteProdutoId: 5, listaId: 10, quantidade: 3 }),
    ]);
    expect(r.componentes).toHaveLength(1);
    expect(r.componentes[0].quantidade).toBe(5);
  });

  it("lista vazia devolve vazio", () => {
    expect(resolverBom([]).componentes).toEqual([]);
  });
});
