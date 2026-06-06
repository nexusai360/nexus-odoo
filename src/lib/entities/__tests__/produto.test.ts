import { resolverProduto, DEFAULTS_PRODUTO, type ProdutoEntidade } from "../produto";
import type { PrismaClient } from "../../../generated/prisma/client";

// Shape real do fato_produto (fixtures-chave-forte.md): odoo_id=1,
// nome="AS4102 - BARRA W OLÍMPICA 122CM", codigo_unico="964", codigo="964".
type Row = {
  odooId: number;
  nome: string;
  codigo: string | null;
  codigoUnico: string | null;
  codigoBarras: string | null;
  ativo: boolean;
  marcaId: number | null;
  marcaNome: string | null;
  familiaId: number | null;
  familiaNome: string | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    odooId: 1,
    nome: "AS4102 - BARRA W OLÍMPICA 122CM",
    codigo: "964",
    codigoUnico: "964",
    codigoBarras: null,
    ativo: true,
    marcaId: null,
    marcaNome: null,
    familiaId: null,
    familiaNome: null,
    ...over,
  };
}

// Mock do FatoProduto. findUnique e findFirst para ramos exatos, findMany para fuzzy.
function mockPrisma(impl: {
  findUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoProduto: {
      findUnique: impl.findUnique ?? jest.fn().mockResolvedValue(null),
      findFirst: impl.findFirst ?? jest.fn().mockResolvedValue(null),
      findMany: impl.findMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

describe("resolverProduto , DEFAULTS", () => {
  it("expoe topN 5, limiar 0.8, folga 0.1", () => {
    expect(DEFAULTS_PRODUTO).toEqual({ topN: 5, limiarFuzzy: 0.8, margemFolga: 0.1 });
  });
});

describe("resolverProduto , ramos exatos", () => {
  it("ref id existente resolve unica score 1 via findUnique({where:{odooId}})", async () => {
    const findUnique = jest.fn().mockResolvedValue(row());
    const prisma = mockPrisma({ findUnique });
    const r = await resolverProduto(prisma, "1");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { odooId: 1 } }),
    );
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.score).toBe(1);
      expect(r.entidade.odooId).toBe(1);
      expect(r.entidade.codigoUnico).toBe("964");
      expect(r.entidade.ativo).toBe(true);
    }
  });

  it("codigoUnico (EAN) exato resolve unica, filtrando IS NOT NULL", async () => {
    // id nao casa (findUnique null), codigo longo casa codigoUnico via findFirst
    const findFirst = jest.fn().mockResolvedValue(row({ codigoUnico: "7891234567895" }));
    const prisma = mockPrisma({ findFirst });
    const r = await resolverProduto(prisma, "7891234567895");
    expect(findFirst).toHaveBeenCalled();
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { codigoUnico: "7891234567895" },
      { codigoBarras: "7891234567895" },
    ]);
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.score).toBe(1);
  });

  it("codigo interno exato resolve unica", async () => {
    // ref de 1-9 digitos: tenta id (null), depois codigo exato.
    const findUnique = jest.fn().mockResolvedValue(null);
    const findFirst = jest.fn().mockResolvedValue(row({ codigo: "964" }));
    const prisma = mockPrisma({ findUnique, findFirst });
    const r = await resolverProduto(prisma, "964");
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.score).toBe(1);
      expect(r.entidade.codigo).toBe("964");
    }
  });

  it("CS4: codigo numerico longo inexistente retorna nenhuma, NUNCA fuzzy de nome", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findMany = jest.fn().mockResolvedValue([row({ nome: "contem 7891234567895 no meio" })]);
    const prisma = mockPrisma({ findFirst, findMany });
    const r = await resolverProduto(prisma, "7891234567895");
    expect(r.status).toBe("nenhuma");
    // Defesa do invariante: o ramo fuzzy NAO pode ter sido chamado.
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("resolverProduto , ramo fuzzy", () => {
  it("nome unico acima do limiar com folga resolve unica", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 10, nome: "ESTEIRA T600", codigo: "10", codigoUnico: "10" }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverProduto(prisma, "esteira T600");
    expect(findMany).toHaveBeenCalled();
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.nome).toEqual({ contains: "esteira T600", mode: "insensitive" });
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.entidade.odooId).toBe(10);
      expect(r.entidade.nome).toBe("ESTEIRA T600");
    }
  });

  it("varios nomes proximos resolve ambigua criterio nome, top<=5, ordenado por score desc", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 11, nome: "ESTEIRA T600" }),
      row({ odooId: 12, nome: "ESTEIRA T610" }),
      row({ odooId: 13, nome: "ESTEIRA T620" }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverProduto(prisma, "esteira T6");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("nome");
      expect(r.candidatas.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < r.candidatas.length; i++) {
        expect(r.candidatas[i - 1].score).toBeGreaterThanOrEqual(r.candidatas[i].score);
      }
      // shape da candidata
      const c = r.candidatas[0].entidade;
      expect(c).toEqual(
        expect.objectContaining({
          odooId: expect.any(Number),
          nome: expect.any(String),
          ativo: expect.any(Boolean),
        }),
      );
    }
  });

  it("inativo aparece com ativo:false e score penalizado, ficando por ultimo", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 20, nome: "ESTEIRA T600", ativo: false }),
      row({ odooId: 21, nome: "ESTEIRA T600", ativo: true }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverProduto(prisma, "esteira T600x");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      // ativo primeiro, inativo por ultimo (mesmo nome, inativo penalizado)
      expect(r.candidatas[0].entidade.ativo).toBe(true);
      expect(r.candidatas[r.candidatas.length - 1].entidade.ativo).toBe(false);
      const inativo = r.candidatas.find((c) => c.entidade.ativo === false);
      expect(inativo).toBeDefined();
    }
  });

  it("nome sem match retorna nenhuma", async () => {
    const prisma = mockPrisma({ findMany: jest.fn().mockResolvedValue([]) });
    const r = await resolverProduto(prisma, "produto inexistente xyz");
    expect(r.status).toBe("nenhuma");
  });
});

describe("resolverProduto , filtros", () => {
  it("opcoes.filtros.familiaId/marcaId entram no where antes de decidir", async () => {
    const findMany = jest.fn().mockResolvedValue([row({ odooId: 30, nome: "ESTEIRA T600" })]);
    const prisma = mockPrisma({ findMany });
    await resolverProduto(prisma, "esteira", { filtros: { familiaId: 7, marcaId: 3 } });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.familiaId).toBe(7);
    expect(arg.where.marcaId).toBe(3);
  });
});
