import { desmembrarDemanda, type ComponenteBom } from "./desmembrar-kit";

// Kit 100 = 1x componente 10 + 2x componente 20.
const bom = new Map<number, ComponenteBom[]>([
  [100, [
    { componenteProdutoId: 10, componenteNome: "Estrutura", quantidade: 1 },
    { componenteProdutoId: 20, componenteNome: "Painel", quantidade: 2 },
  ]],
]);

function porId(r: ReturnType<typeof desmembrarDemanda>, id: number) {
  return r.find((x) => x.produtoId === id);
}

describe("desmembrarDemanda", () => {
  it("kit vira componentes na proporção da BOM", () => {
    const r = desmembrarDemanda(
      [{ produtoId: 100, nome: "Kit", ehKit: true, qtd: 3 }],
      bom,
      new Map(),
    );
    expect(porId(r, 10)!.qtd).toBe(3); // 3 kits * 1
    expect(porId(r, 20)!.qtd).toBe(6); // 3 kits * 2
    expect(porId(r, 100)).toBeUndefined(); // o kit some, virou componentes
    expect(r.every((x) => !x.semBom)).toBe(true);
  });

  it("kit MONTADO em estoque abate a demanda antes de desmembrar", () => {
    const r = desmembrarDemanda(
      [{ produtoId: 100, nome: "Kit", ehKit: true, qtd: 5 }],
      bom,
      new Map([[100, 2]]), // 2 kits montados
    );
    // só 3 kits (5-2) viram componentes
    expect(porId(r, 10)!.qtd).toBe(3);
    expect(porId(r, 20)!.qtd).toBe(6);
  });

  it("kit totalmente coberto por estoque montado não gera demanda de componente", () => {
    const r = desmembrarDemanda(
      [{ produtoId: 100, nome: "Kit", ehKit: true, qtd: 2 }],
      bom,
      new Map([[100, 5]]), // mais montado que a demanda
    );
    expect(porId(r, 10)!.qtd).toBe(0);
    expect(porId(r, 20)!.qtd).toBe(0);
  });

  it("kit SEM BOM passa como ele mesmo, sinalizado (fallback honesto)", () => {
    const r = desmembrarDemanda(
      [{ produtoId: 999, nome: "Kit sem BOM", ehKit: true, qtd: 4 }],
      bom,
      new Map(),
    );
    expect(porId(r, 999)!.qtd).toBe(4);
    expect(porId(r, 999)!.semBom).toBe(true);
  });

  it("produto que não é kit passa direto", () => {
    const r = desmembrarDemanda(
      [{ produtoId: 50, nome: "Avulso", ehKit: false, qtd: 7 }],
      bom,
      new Map(),
    );
    expect(porId(r, 50)!.qtd).toBe(7);
    expect(porId(r, 50)!.semBom).toBe(false);
  });

  it("agrega demanda de um componente vindo de kit E de venda avulsa", () => {
    const r = desmembrarDemanda(
      [
        { produtoId: 100, nome: "Kit", ehKit: true, qtd: 2 }, // gera 2x comp 10
        { produtoId: 10, nome: "Estrutura", ehKit: false, qtd: 5 }, // venda avulsa do comp 10
      ],
      bom,
      new Map(),
    );
    expect(porId(r, 10)!.qtd).toBe(7); // 2 (do kit) + 5 (avulso)
    expect(porId(r, 20)!.qtd).toBe(4); // 2 kits * 2
  });

  it("mesmo kit demandado em duas linhas: agrega antes de abater o montado", () => {
    const r = desmembrarDemanda(
      [
        { produtoId: 100, nome: "Kit", ehKit: true, qtd: 3 },
        { produtoId: 100, nome: "Kit", ehKit: true, qtd: 4 },
      ],
      bom,
      new Map([[100, 2]]), // total 7, abate 2 => 5 desmembram
    );
    expect(porId(r, 10)!.qtd).toBe(5);
    expect(porId(r, 20)!.qtd).toBe(10);
  });
});
