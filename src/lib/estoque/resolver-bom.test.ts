import { describe, it, expect } from "@jest/globals";
import { resolverBom, montarBomPorPai, type LinhaBom, type LinhaBomComPai } from "./resolver-bom";

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

function linhaPai(over: Partial<LinhaBomComPai>): LinhaBomComPai {
  return {
    produtoPaiId: 1281,
    componenteProdutoId: 1,
    componenteNome: "comp",
    quantidade: 1,
    listaId: 10,
    listaDataAtivacao: null,
    listaInativa: false,
    ...over,
  };
}

describe("montarBomPorPai (W3: necessidade de compra usa a BOM ativa)", () => {
  it("kit multi-lista com componente compartilhado NAO duplica (escolhe a lista ativa, 1281)", () => {
    const ativa = new Date("2026-07-03T00:00:00Z");
    const map = montarBomPorPai([
      // lista 161 (nunca ativada): componente 100 qtd 1
      linhaPai({ componenteProdutoId: 100, quantidade: 1, listaId: 161, listaDataAtivacao: null }),
      // lista 172 (ativada): componente 100 qtd 1 + componente 200 qtd 2
      linhaPai({ componenteProdutoId: 100, quantidade: 1, listaId: 172, listaDataAtivacao: ativa }),
      linhaPai({ componenteProdutoId: 200, quantidade: 2, listaId: 172, listaDataAtivacao: ativa }),
    ]);
    const comps = map.get(1281)!;
    // Antes (Fase 1 empilhava tudo): componente 100 apareceria com qtd 2 (duplicado). Agora só a
    // lista 172: 100 (qtd 1, nao 2) + 200 (qtd 2).
    expect(comps).toHaveLength(2);
    expect(comps.find((c) => c.componenteProdutoId === 100)!.quantidade).toBe(1);
    expect(comps.find((c) => c.componenteProdutoId === 200)!.quantidade).toBe(2);
  });

  it("kit de lista unica mantem a MESMA contagem de componentes (Fase 1 intacta, 131 kits)", () => {
    const map = montarBomPorPai([
      linhaPai({ produtoPaiId: 500, componenteProdutoId: 100, listaId: 10 }),
      linhaPai({ produtoPaiId: 500, componenteProdutoId: 200, listaId: 10 }),
    ]);
    expect(map.get(500)).toHaveLength(2);
  });

  it("agrupa varios kits pais independentemente", () => {
    const map = montarBomPorPai([
      linhaPai({ produtoPaiId: 1, componenteProdutoId: 100, listaId: 10 }),
      linhaPai({ produtoPaiId: 2, componenteProdutoId: 200, listaId: 20 }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get(1)).toHaveLength(1);
    expect(map.get(2)).toHaveLength(1);
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(montarBomPorPai([]).size).toBe(0);
  });
});
