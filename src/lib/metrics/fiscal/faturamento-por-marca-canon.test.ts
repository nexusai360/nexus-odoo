import { faturamentoPorMarcaCanon } from "./faturamento-por-marca-canon";

// Faturamento por marca na base canonica (receita externa): vrProdutos do item,
// ehReceita por CFOP, intragrupo eliminado, marca via fato_produto. Mock
// reproduz: groupBy item por (documentoId, cfopId, produtoId) + findMany cfop +
// findMany notas + fatoProduto.findMany (marca). A eliminacao de intragrupo
// depende da whitelist real e e travada no E2E; aqui validamos o deterministico:
// nao-receita (CFOP) fora, agrupamento por marca, totais.

function makePrisma() {
  return {
    fatoNotaFiscal: { findMany: jest.fn() },
    fatoNotaFiscalItem: { groupBy: jest.fn(), findMany: jest.fn() },
    fatoProduto: { findMany: jest.fn().mockResolvedValue([]) },
    // whitelist de grupo: vazia no unit (intragrupo travado no E2E real)
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function prime(prisma: ReturnType<typeof makePrisma>) {
  const data = new Date("2026-06-10T00:00:00Z");
  (prisma.fatoNotaFiscalItem.groupBy as jest.Mock).mockResolvedValue([
    { documentoId: 1, cfopId: 10, produtoId: 100, _sum: { vrProdutos: 1000 }, _count: 1 }, // Movement venda
    { documentoId: 2, cfopId: 10, produtoId: 200, _sum: { vrProdutos: 500 }, _count: 1 }, // Life venda
    { documentoId: 3, cfopId: 10, produtoId: 100, _sum: { vrProdutos: 250 }, _count: 1 }, // Movement venda
    { documentoId: 4, cfopId: 99, produtoId: 100, _sum: { vrProdutos: 8000 }, _count: 1 }, // transferencia (nao-receita)
  ]);
  (prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue([
    { cfopId: 10, cfopNome: "5102 - Venda de mercadoria adquirida ou recebida de terceiros" },
    { cfopId: 99, cfopNome: "5152 - Transferencia de mercadoria" },
  ]);
  (prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue([
    { odooId: 1, participanteId: 1001, participanteNome: "Cli A", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 2, participanteId: 1002, participanteNome: "Cli B", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 3, participanteId: 1003, participanteNome: "Cli C", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 4, participanteId: 1004, participanteNome: "Cli D", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
  ]);
  (prisma.fatoProduto.findMany as jest.Mock).mockResolvedValue([
    { odooId: 100, marcaNome: "Movement" },
    { odooId: 200, marcaNome: "Life Fitness" },
  ]);
}

describe("faturamentoPorMarcaCanon", () => {
  it("soma receita externa por marca e exclui CFOP nao-receita", async () => {
    const prisma = makePrisma();
    prime(prisma);
    const r = await faturamentoPorMarcaCanon(prisma as never, {
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
      limit: 50,
    });
    const marcas = Object.fromEntries(r.linhas.map((l) => [l.marca ?? "(sem marca)", l.valorTotal]));
    // Movement = 1000 + 250 = 1250 (a transferencia de 8000 NAO entra)
    expect(marcas["Movement"]).toBe(1250);
    expect(marcas["Life Fitness"]).toBe(500);
    expect(r.linhas.some((l) => l.valorTotal === 8000)).toBe(false);
    expect(r.totalGeral).toBe(1750);
    expect(r.totalMarcas).toBe(2);
  });

  it("ordena por valor desc", async () => {
    const prisma = makePrisma();
    prime(prisma);
    const r = await faturamentoPorMarcaCanon(prisma as never, {
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
      limit: 50,
    });
    const valores = r.linhas.map((l) => l.valorTotal);
    expect(valores).toEqual([...valores].sort((a, b) => b - a));
    expect(r.linhas[0].marca).toBe("Movement");
  });
});
