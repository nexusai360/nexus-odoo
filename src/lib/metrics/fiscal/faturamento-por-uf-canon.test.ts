import { faturamentoPorUfCanon } from "./faturamento-por-uf-canon";

// A metrica espelha faturamentoPorClienteCanon, mas agrupa a RECEITA EXTERNA
// (vrProdutos dos itens, ehReceita por CFOP) pela UF do participante da nota
// (fato_parceiro.uf). Mock reproduz o core carregarItensVendaComGrupo: groupBy
// item + findMany cfop + findMany notas + fatoParceiro.findMany (uf por
// participante). A eliminacao de intragrupo depende da whitelist real do banco
// e e travada no E2E (f-uf-receita-externa); aqui validamos o que e
// deterministico: nao-receita (CFOP) fora, agrupamento por UF, limpeza do "(BR)".

function makePrisma() {
  return {
    fatoNotaFiscal: { findMany: jest.fn() },
    fatoNotaFiscalItem: { groupBy: jest.fn(), findMany: jest.fn() },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function prime(prisma: ReturnType<typeof makePrisma>) {
  const data = new Date("2026-06-10T00:00:00Z");
  (prisma.fatoNotaFiscalItem.groupBy as jest.Mock).mockResolvedValue([
    { documentoId: 1, cfopId: 10, _sum: { vrProdutos: 1000 }, _count: 1 }, // DF venda
    { documentoId: 2, cfopId: 10, _sum: { vrProdutos: 500 }, _count: 1 }, // SP venda
    { documentoId: 3, cfopId: 10, _sum: { vrProdutos: 300 }, _count: 1 }, // sem UF venda
    { documentoId: 5, cfopId: 99, _sum: { vrProdutos: 7000 }, _count: 1 }, // transferencia (nao-receita)
  ]);
  (prisma.fatoNotaFiscalItem.findMany as jest.Mock).mockResolvedValue([
    { cfopId: 10, cfopNome: "5102 - Venda de mercadoria adquirida ou recebida de terceiros" },
    { cfopId: 99, cfopNome: "5152 - Transferencia de mercadoria" },
  ]);
  (prisma.fatoNotaFiscal.findMany as jest.Mock).mockResolvedValue([
    { odooId: 1, participanteId: 1001, participanteNome: "Cli DF", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 2, participanteId: 1002, participanteNome: "Cli SP", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 3, participanteId: 1003, participanteNome: "Cli ?", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
    { odooId: 5, participanteId: 1004, participanteNome: "Cli transf", empresaId: 4, empresaNome: "Jds", dataEmissao: data },
  ]);
  (prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue([
    { odooId: 1001, uf: "Distrito Federal (BR)" },
    { odooId: 1002, uf: "São Paulo (BR)" },
    { odooId: 1003, uf: null },
    { odooId: 1004, uf: "Minas Gerais (BR)" },
  ]);
}

describe("faturamentoPorUfCanon", () => {
  it("agrupa receita externa por UF e exclui CFOP nao-receita", async () => {
    const prisma = makePrisma();
    prime(prisma);
    const r = await faturamentoPorUfCanon(prisma as never, {
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
      limit: 50,
    });
    const ufs = Object.fromEntries(r.linhas.map((l) => [l.uf ?? "(sem UF)", l.valorTotal]));
    expect(ufs["Distrito Federal"]).toBe(1000);
    expect(ufs["São Paulo"]).toBe(500);
    expect(ufs["(sem UF)"]).toBe(300);
    // transferencia (CFOP nao-receita) nunca aparece como faturamento
    expect(r.linhas.some((l) => l.valorTotal === 7000)).toBe(false);
    // total = soma da receita externa, sem a nao-receita
    expect(r.totalGeral).toBe(1800);
  });

  it("limpa o sufixo ' (BR)' da UF e conta notas sem UF", async () => {
    const prisma = makePrisma();
    prime(prisma);
    const r = await faturamentoPorUfCanon(prisma as never, {
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
      limit: 50,
    });
    expect(r.linhas.every((l) => !(l.uf ?? "").includes("(BR)"))).toBe(true);
    expect(r.notasSemUf).toBe(1);
    expect(r.valorSemUf).toBe(300);
    // UFs reais distintas (DF, SP) = 2 (sem UF nao conta como UF)
    expect(r.totalUfs).toBe(2);
  });

  it("ordena por valor desc", async () => {
    const prisma = makePrisma();
    prime(prisma);
    const r = await faturamentoPorUfCanon(prisma as never, {
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
      limit: 50,
    });
    const valores = r.linhas.map((l) => l.valorTotal);
    expect(valores).toEqual([...valores].sort((a, b) => b - a));
  });
});
