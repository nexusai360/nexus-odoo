import { describe, it, expect } from "@jest/globals";
import { queryComposicaoKit, queryListaKits, sanitizarTravessao } from "./composicao-kit";

/**
 * Monta um prisma dublado. Cada tabela recebe as linhas cruas; a query filtra sozinha.
 * Segue o padrão dos demais testes de queries (mock por método findMany/findUnique).
 */
function makePrisma(opts: {
  kit: Record<string, unknown> | null;
  bom: Array<Record<string, unknown>>;
  produtos: Array<Record<string, unknown>>;
  precos: Array<Record<string, unknown>>;
  vendas: Array<Record<string, unknown>>;
}) {
  return {
    fatoProduto: {
      findUnique: jest.fn().mockResolvedValue(opts.kit),
      findMany: jest.fn().mockResolvedValue(opts.produtos),
    },
    fatoListaMaterialItem: { findMany: jest.fn().mockResolvedValue(opts.bom) },
    fatoPreco: { findMany: jest.fn().mockResolvedValue(opts.precos) },
    fatoPedidoItem: { findMany: jest.fn().mockResolvedValue(opts.vendas) },
  } as unknown as Parameters<typeof queryComposicaoKit>[0];
}

const bomLinha = (over: Record<string, unknown>) => ({
  produtoPaiId: 894,
  componenteProdutoId: 1,
  componenteNome: "comp",
  quantidade: 1,
  listaId: 10,
  listaDataAtivacao: null,
  listaInativa: false,
  ...over,
});

describe("sanitizarTravessao", () => {
  it("troca em dash e en dash por virgula (regra sem travessao)", () => {
    const EM = String.fromCharCode(0x2014); // em dash (o ERP usa; a regra proibe no source)
    const EN = String.fromCharCode(0x2013); // en dash
    expect(sanitizarTravessao(`unid ${EM} Unidade`)).toBe("unid, Unidade");
    expect(sanitizarTravessao(`A ${EN} B`)).toBe("A, B");
    expect(sanitizarTravessao(null)).toBeNull();
  });
});

describe("queryComposicaoKit", () => {
  it("kit inexistente devolve null", async () => {
    const prisma = makePrisma({ kit: null, bom: [], produtos: [], precos: [], vendas: [] });
    expect(await queryComposicaoKit(prisma, 999)).toBeNull();
  });

  it("rateia por custo: estrutura cara leva mais que painel, soma exata, base=tabela", async () => {
    // Kit 894 real: estrutura custo 37630, painel custo 23820.43, venda padrao 102963.64.
    const prisma = makePrisma({
      kit: { odooId: 894, nome: "T-PP-TOUCHXL ESTEIRA", unidadeNome: `kit ${String.fromCharCode(0x2014)} Kit`, marcaNome: "MATRIX", precoVenda: null },
      bom: [
        bomLinha({ componenteProdutoId: 273, componenteNome: "ESTRUTURA", quantidade: 1 }),
        bomLinha({ componenteProdutoId: 501, componenteNome: "PAINEL TOUCH", quantidade: 1 }),
      ],
      produtos: [
        { odooId: 273, nome: "ESTRUTURA", marcaNome: "MATRIX", precoCusto: 37630, precoVenda: 68418.18 },
        { odooId: 501, nome: "PAINEL TOUCH", marcaNome: "MATRIX", precoCusto: 23820.43, precoVenda: 43309.88 },
      ],
      precos: [{ produtoId: 894, tabelaId: 3, valor: 102963.64 }],
      vendas: [{ vrProdutos: 100000 }, { vrProdutos: 110000 }], // n=2 (<5): nao vira base
    });
    const r = (await queryComposicaoKit(prisma, 894))!;
    expect(r.baseValor).toBe("preco_tabela_padrao");
    expect(r.valorReferencia).toBe(102963.64);
    expect(r.coberturaCompleta).toBe(true);
    expect(r.nVendas).toBe(2);
    expect(r.ehMatrix).toBe(true);
    // Soma exata do rateio.
    const soma = r.componentes.reduce((s, c) => s + c.valorRateado, 0);
    expect(soma).toBeCloseTo(102963.64, 2);
    // Estrutura (peso 37630) > painel (peso 23820.43).
    const estrutura = r.componentes.find((c) => c.componenteId === 273)!;
    const painel = r.componentes.find((c) => c.componenteId === 501)!;
    expect(estrutura.valorRateado).toBeGreaterThan(painel.valorRateado);
    // Painel NAO vale zero (a manchete do dono).
    expect(painel.percentual).toBeGreaterThan(10);
    expect(estrutura.percentual + painel.percentual).toBeCloseTo(100, 1);
    // Nomes sanitizados (sem travessao).
    expect(r.unidadeNome).toBe("kit, Kit");
  });

  it("base de peso UNIFORME: nao mistura custo (comp A) com venda (comp B) no rateio", async () => {
    // comp A: custo 100, sem venda. comp B: sem custo, venda de tabela 900. Se misturasse
    // (custo de A x venda de B), B levaria 900/1000=90%. Com base uniforme, cai para venda de
    // tabela em AMBOS (A tambem tem venda de tabela 200): A=200, B=900 -> A 18,2%, B 81,8%.
    const prisma = makePrisma({
      kit: { odooId: 55, nome: "KIT MISTO", unidadeNome: "kit", marcaNome: "MATRIX", precoVenda: null },
      bom: [
        bomLinha({ produtoPaiId: 55, componenteProdutoId: 1, quantidade: 1 }),
        bomLinha({ produtoPaiId: 55, componenteProdutoId: 2, quantidade: 1 }),
      ],
      produtos: [
        { odooId: 1, nome: "A", marcaNome: "MATRIX", precoCusto: 100, precoVenda: null },
        { odooId: 2, nome: "B", marcaNome: "MATRIX", precoCusto: null, precoVenda: null },
      ],
      precos: [
        { produtoId: 55, tabelaId: 3, valor: 1100 },
        { produtoId: 1, tabelaId: 3, valor: 200 }, // A tem venda de tabela tambem
        { produtoId: 2, tabelaId: 3, valor: 900 }, // B so tem venda de tabela
      ],
      vendas: [],
    });
    const r = (await queryComposicaoKit(prisma, 55))!;
    expect(r.coberturaCompleta).toBe(true);
    const a = r.componentes.find((c) => c.componenteId === 1)!;
    const b = r.componentes.find((c) => c.componenteId === 2)!;
    // Base uniforme = venda de tabela (a unica em que os dois tem valor): 200 vs 900.
    expect(a.percentual).toBeCloseTo(18.2, 0);
    expect(b.percentual).toBeCloseTo(81.8, 0);
  });

  it("componente sem custo NEM venda: coberturaCompleta=false e NAO rateia (nao infla os demais)", async () => {
    const prisma = makePrisma({
      kit: { odooId: 50, nome: "KIT X", unidadeNome: "kit", marcaNome: "MATRIX", precoVenda: null },
      bom: [
        bomLinha({ produtoPaiId: 50, componenteProdutoId: 10, quantidade: 1 }),
        bomLinha({ produtoPaiId: 50, componenteProdutoId: 20, quantidade: 1 }),
      ],
      produtos: [
        { odooId: 10, nome: "COM CUSTO", marcaNome: "MATRIX", precoCusto: 1000, precoVenda: 2000 },
        { odooId: 20, nome: "SEM PRECO", marcaNome: null, precoCusto: null, precoVenda: null },
      ],
      precos: [{ produtoId: 50, tabelaId: 3, valor: 5000 }],
      vendas: [],
    });
    const r = (await queryComposicaoKit(prisma, 50))!;
    expect(r.coberturaCompleta).toBe(false);
    const semPreco = r.componentes.find((c) => c.componenteId === 20)!;
    expect(semPreco.semPreco).toBe(true);
    // Rateio NAO exibido: nenhum componente absorve os 100%.
    for (const c of r.componentes) {
      expect(c.valorRateado).toBe(0);
      expect(c.percentual).toBe(0);
    }
  });

  it("venda_real como base secundaria: >=5 vendas usa MEDIANA quando opts.base=venda_real", async () => {
    const prisma = makePrisma({
      kit: { odooId: 60, nome: "KIT V", unidadeNome: "kit", marcaNome: "OUTRA", precoVenda: null },
      bom: [
        bomLinha({ produtoPaiId: 60, componenteProdutoId: 1, quantidade: 1 }),
        bomLinha({ produtoPaiId: 60, componenteProdutoId: 2, quantidade: 1 }),
      ],
      produtos: [
        { odooId: 1, nome: "A", marcaNome: "MATRIX", precoCusto: 30, precoVenda: 60 },
        { odooId: 2, nome: "B", marcaNome: "ACESSORIO", precoCusto: 10, precoVenda: 20 },
      ],
      precos: [{ produtoId: 60, tabelaId: 3, valor: 1000 }],
      vendas: [{ vrProdutos: 800 }, { vrProdutos: 900 }, { vrProdutos: 1000 }, { vrProdutos: 1100 }, { vrProdutos: 1200 }],
    });
    const r = (await queryComposicaoKit(prisma, 60, { base: "venda_real" }))!;
    expect(r.baseValor).toBe("venda_real_mediana");
    expect(r.nVendas).toBe(5);
    expect(r.valorReferencia).toBe(1000); // mediana de 800..1200
    expect(r.ehMatrix).toBe(false);
  });

  it("venda_real pedida mas <5 vendas cai para a tabela (nao lidera por poucas vendas)", async () => {
    const prisma = makePrisma({
      kit: { odooId: 70, nome: "KIT P", unidadeNome: "kit", marcaNome: "MATRIX", precoVenda: null },
      bom: [bomLinha({ produtoPaiId: 70, componenteProdutoId: 1, quantidade: 1 })],
      produtos: [{ odooId: 1, nome: "A", marcaNome: "MATRIX", precoCusto: 30, precoVenda: 60 }],
      precos: [{ produtoId: 70, tabelaId: 3, valor: 500 }],
      vendas: [{ vrProdutos: 400 }, { vrProdutos: 900 }],
    });
    const r = (await queryComposicaoKit(prisma, 70, { base: "venda_real" }))!;
    expect(r.baseValor).toBe("preco_tabela_padrao");
    expect(r.valorReferencia).toBe(500);
  });

  it("sem tabela e sem vendas suficientes: base=sem_referencia, mostra custo/tabela sem ratear", async () => {
    const prisma = makePrisma({
      kit: { odooId: 80, nome: "KIT S", unidadeNome: "kit", marcaNome: "MATRIX", precoVenda: null },
      bom: [bomLinha({ produtoPaiId: 80, componenteProdutoId: 1, quantidade: 1 })],
      produtos: [{ odooId: 1, nome: "A", marcaNome: "MATRIX", precoCusto: 30, precoVenda: 60 }],
      precos: [],
      vendas: [],
    });
    const r = (await queryComposicaoKit(prisma, 80))!;
    expect(r.baseValor).toBe("sem_referencia");
    expect(r.valorReferencia).toBe(0);
    expect(r.componentes[0].valorRateado).toBe(0);
    // O custo do componente continua visivel (nao sumiu).
    expect(r.componentes[0].precoCusto).toBe(30);
  });

  it("queryListaKits lista so unidade kit com BOM, ordenado, com ehMatrix e nome sanitizado", async () => {
    const prisma = {
      fatoListaMaterialItem: {
        findMany: jest.fn().mockResolvedValue([{ produtoPaiId: 894 }, { produtoPaiId: 1281 }]),
      },
      fatoProduto: {
        findMany: jest.fn().mockResolvedValue([
          { odooId: 894, nome: `ESTEIRA ${String.fromCharCode(0x2014)} PP`, marcaNome: "MATRIX" },
          { odooId: 1281, nome: "POWERMILL", marcaNome: "LIFE FITNESS" },
        ]),
      },
    } as unknown as Parameters<typeof queryListaKits>[0];
    const r = await queryListaKits(prisma);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ kitId: 894, nome: "ESTEIRA, PP", marcaNome: "MATRIX", ehMatrix: true });
    expect(r[1].ehMatrix).toBe(false);
    // Inclui TODOS os produtos com BOM (nao filtra por unidade "kit"): kits "unid" como o 21287
    // ficavam invisiveis. So restringe pelos ids que tem BOM.
    const call = (prisma.fatoProduto.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.unidadeNome).toBeUndefined();
    expect(call.where.odooId).toEqual({ in: [894, 1281] });
  });

  it("queryListaKits devolve vazio quando nao ha BOM", async () => {
    const prisma = {
      fatoListaMaterialItem: { findMany: jest.fn().mockResolvedValue([]) },
      fatoProduto: { findMany: jest.fn() },
    } as unknown as Parameters<typeof queryListaKits>[0];
    expect(await queryListaKits(prisma)).toEqual([]);
  });

  it("fallback tabela smart quando nao ha Venda Padrao", async () => {
    const prisma = makePrisma({
      kit: { odooId: 90, nome: "KIT SM", unidadeNome: "kit", marcaNome: "MATRIX", precoVenda: null },
      bom: [bomLinha({ produtoPaiId: 90, componenteProdutoId: 1, quantidade: 1 })],
      produtos: [{ odooId: 1, nome: "A", marcaNome: "MATRIX", precoCusto: 30, precoVenda: 60 }],
      precos: [{ produtoId: 90, tabelaId: 5, valor: 700 }],
      vendas: [],
    });
    const r = (await queryComposicaoKit(prisma, 90))!;
    expect(r.baseValor).toBe("preco_tabela_smart");
    expect(r.valorReferencia).toBe(700);
  });
});
