import { resolverNaturezaOperacao } from "../natureza-operacao";
import type { PrismaClient } from "../../../generated/prisma/client";

// Linha de fato_referencia (tabela='natureza_operacao'), shape real (fixtures-chave-forte.md):
// { codigo: "001", descricao: "VENDA DE MERCADORIA ..." }. Sem odooId.
type LinhaRef = { codigo: string; descricao: string | null };

function makePrisma(linhas: LinhaRef[]) {
  const findMany = jest.fn(async (args: { where?: { codigo?: string; descricao?: unknown } }) => {
    const where = args?.where ?? {};
    // Ramo codigo: igualdade exata de string (leading zeros preservados, nunca Number()).
    if (typeof where.codigo === "string") {
      return linhas.filter((l) => l.codigo === where.codigo);
    }
    // Ramo descricao: contains insensitive (pre-filtro do fuzzy).
    const cont = (where.descricao as { contains?: string } | undefined)?.contains;
    if (typeof cont === "string") {
      const alvo = cont.toLowerCase();
      return linhas.filter((l) => (l.descricao ?? "").toLowerCase().includes(alvo));
    }
    return linhas;
  });
  return { fatoReferencia: { findMany } } as unknown as PrismaClient;
}

const NATUREZAS: LinhaRef[] = [
  { codigo: "001", descricao: "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS" },
  { codigo: "002", descricao: "DEVOLUCAO DE VENDA" },
  { codigo: "003", descricao: "DEVOLUCAO DE TRANSFERENCIA" },
];

describe("resolverNaturezaOperacao , ramo codigo (namespace)", () => {
  it("codigo '001' exato (string, leading zeros) => unica", async () => {
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "001");
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.entidade.codigo).toBe("001");
      expect(r.score).toBe(1);
      // candidata sem odooId (namespace proprio, id autoinc nao usado)
      expect(r.entidade).not.toHaveProperty("odooId");
    }
  });

  it("filtra sempre por tabela='natureza_operacao' no where", async () => {
    const prisma = makePrisma(NATUREZAS);
    await resolverNaturezaOperacao(prisma, "001");
    const findMany = (prisma.fatoReferencia.findMany as unknown) as jest.Mock;
    const where = findMany.mock.calls[0][0].where;
    expect(where.tabela).toBe("natureza_operacao");
  });

  it("invariante de namespace: ref '1' NAO casa odoo_id=1 de outra tabela; busca codigo='1' como string", async () => {
    // "1" nao existe como codigo de natureza (codigos sao "001".."003"); nao deve virar Number nem casar id.
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "1");
    expect(r.status).toBe("nenhuma");
    const findMany = (prisma.fatoReferencia.findMany as unknown) as jest.Mock;
    // primeiro ramo busca codigo como string crua "1", nunca Number(1)
    expect(findMany.mock.calls[0][0].where.codigo).toBe("1");
  });

  it("'001' nunca vira Number(): o where usa a string com zeros", async () => {
    const prisma = makePrisma(NATUREZAS);
    await resolverNaturezaOperacao(prisma, "001");
    const findMany = (prisma.fatoReferencia.findMany as unknown) as jest.Mock;
    expect(findMany.mock.calls[0][0].where.codigo).toBe("001");
  });

  it("trim aplicado antes da busca de codigo", async () => {
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "  002  ");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.codigo).toBe("002");
  });

  it("termo inexistente => nenhuma", async () => {
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "999");
    expect(r.status).toBe("nenhuma");
  });
});

describe("resolverNaturezaOperacao , ramo descricao (fuzzy)", () => {
  it("descricao com 1 match forte e folga => unica criterio nome", async () => {
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "venda de mercadoria adquirida ou recebida de terceiros");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.codigo).toBe("001");
  });

  it("descricao ambigua (duas devolucoes proximas) => ambigua criterio nome", async () => {
    // Ambas contem o substring buscado "devolucao de" (passam no pre-filtro contains)
    // e ficam fuzzy-proximas (folga < margemFolga 0.1) => ambigua.
    const linhas: LinhaRef[] = [
      { codigo: "002", descricao: "DEVOLUCAO DE VENDA AB" },
      { codigo: "004", descricao: "DEVOLUCAO DE VENDA AC" },
    ];
    const prisma = makePrisma(linhas);
    const r = await resolverNaturezaOperacao(prisma, "devolucao de venda a");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("nome");
      expect(r.candidatas.length).toBeGreaterThanOrEqual(2);
      expect(r.candidatas[0].entidade).not.toHaveProperty("odooId");
    }
  });

  it("descricao sem nenhum match textual => nenhuma", async () => {
    const prisma = makePrisma(NATUREZAS);
    const r = await resolverNaturezaOperacao(prisma, "frete sobre importacao");
    expect(r.status).toBe("nenhuma");
  });

  it("ramo descricao filtra por tabela e contains insensitive", async () => {
    const prisma = makePrisma(NATUREZAS);
    await resolverNaturezaOperacao(prisma, "venda de mercadoria");
    const findMany = (prisma.fatoReferencia.findMany as unknown) as jest.Mock;
    // segunda chamada e o ramo descricao (a primeira foi o ramo codigo, sem match)
    const ultima = findMany.mock.calls[findMany.mock.calls.length - 1][0];
    expect(ultima.where.tabela).toBe("natureza_operacao");
    expect(ultima.where.descricao.mode).toBe("insensitive");
    expect(typeof ultima.where.descricao.contains).toBe("string");
  });

  it("respeita limiarFuzzy/margemFolga via opcoes", async () => {
    const linhas: LinhaRef[] = [
      { codigo: "002", descricao: "DEVOLUCAO DE VENDA AB" },
      { codigo: "004", descricao: "DEVOLUCAO DE VENDA AC" },
    ];
    const prisma = makePrisma(linhas);
    // margemFolga 0 => qualquer folga > 0 ja resolve unica
    const r = await resolverNaturezaOperacao(prisma, "devolucao de venda ab", { margemFolga: 0 });
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.codigo).toBe("002");
  });
});
