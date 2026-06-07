import { resolverParceiro, DEFAULTS_PARCEIRO } from "../parceiro";
import type { PrismaClient } from "../../../generated/prisma/client";

// Shape real do fato_parceiro (banco real): odoo_id=1, nome="JHT Brasília - Matriz DF",
// documento="BR-07.390.039/0001-01", documento_digits="07390039000101",
// eh_cliente=t, eh_fornecedor=t, eh_empresa=t, uf="Distrito Federal (BR)", cidade="Brasília".
type Row = {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  documento: string | null;
  documentoDigits: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  ehEmpresa: boolean;
  uf: string | null;
  cidade: string | null;
  dataCriacao: Date | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    odooId: 1,
    nome: "JHT Brasília - Matriz DF",
    nomeCompleto: "JHT Brasília - Matriz DF",
    documento: "BR-07.390.039/0001-01",
    documentoDigits: "07390039000101",
    ehCliente: true,
    ehFornecedor: true,
    ehEmpresa: true,
    uf: "Distrito Federal (BR)",
    cidade: "Brasília",
    dataCriacao: null,
    ...over,
  };
}

function mockPrisma(impl: {
  findUnique?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoParceiro: {
      findUnique: impl.findUnique ?? jest.fn().mockResolvedValue(null),
      findMany: impl.findMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

describe("resolverParceiro , DEFAULTS", () => {
  it("expoe topN 3, limiar 0.75, folga 0.1", () => {
    expect(DEFAULTS_PARCEIRO).toEqual({ topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 });
  });
});

describe("resolverParceiro , ramos exatos", () => {
  it("ref id existente resolve unica score 1 via findUnique({where:{odooId}})", async () => {
    const findUnique = jest.fn().mockResolvedValue(row());
    const prisma = mockPrisma({ findUnique });
    const r = await resolverParceiro(prisma, "1");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { odooId: 1 } }),
    );
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.score).toBe(1);
      expect(r.entidade.odooId).toBe(1);
      expect(r.entidade.documento).toBe("BR-07.390.039/0001-01");
    }
  });

  it.each([
    ["BR-07.390.039/0001-01"],
    ["07.390.039/0001-01"],
    ["07390039000101"],
  ])("documento no formato %s busca por documentoDigits e resolve unica", async (ref) => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverParceiro(prisma, ref);
    // CS5: os 3 formatos normalizam para o mesmo digits no where.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ documentoDigits: "07390039000101" }) }),
    );
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(1);
  });

  it("2 parceiros com mesmo documentoDigits resolve ambigua criterio documento", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 1, nome: "JHT Brasília - Matriz DF" }),
      row({ odooId: 13766, nome: "Matrix Fitness", ehCliente: false, ehFornecedor: false, ehEmpresa: false }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverParceiro(prisma, "07390039000101");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("documento");
      expect(r.candidatas.length).toBe(2);
      expect(r.candidatas.every((c) => c.score === 1)).toBe(true);
    }
  });

  it("documento inexistente retorna nenhuma sem cair no fuzzy", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverParceiro(prisma, "00000000000000");
    expect(r.status).toBe("nenhuma");
    // so um findMany (o do ramo documento), nunca o ramo nome
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe("resolverParceiro , ramo nome", () => {
  it("nome unico acima do limiar com folga resolve unica", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 50, nome: "Academia Power Fit", nomeCompleto: "Academia Power Fit LTDA" }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverParceiro(prisma, "Academia Power Fit");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { nome: { contains: "Academia Power Fit", mode: "insensitive" } },
      { nomeCompleto: { contains: "Academia Power Fit", mode: "insensitive" } },
    ]);
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(50);
  });

  it("homonimos resolvem ambigua com uf/cidade na candidata para desempate", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ odooId: 60, nome: "Fitness Center", uf: "SP", cidade: "São Paulo" }),
      row({ odooId: 61, nome: "Fitness Center", uf: "RJ", cidade: "Rio de Janeiro" }),
    ]);
    const prisma = mockPrisma({ findMany });
    const r = await resolverParceiro(prisma, "Fitness Center");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("nome");
      expect(r.candidatas.length).toBeLessThanOrEqual(3);
      const c = r.candidatas[0].entidade;
      expect(c).toEqual(
        expect.objectContaining({
          odooId: expect.any(Number),
          nome: expect.any(String),
          nomeCompleto: expect.anything(),
          documento: expect.anything(),
          ehCliente: expect.any(Boolean),
          ehFornecedor: expect.any(Boolean),
          uf: expect.anything(),
          cidade: expect.anything(),
        }),
      );
    }
  });

  it("nome sem match retorna nenhuma", async () => {
    const prisma = mockPrisma({ findMany: jest.fn().mockResolvedValue([]) });
    const r = await resolverParceiro(prisma, "inexistente xpto zzz");
    expect(r.status).toBe("nenhuma");
  });
});

describe("resolverParceiro , filtros", () => {
  it("opcoes.filtros.ehCliente entra no where do ramo nome", async () => {
    const findMany = jest.fn().mockResolvedValue([row({ odooId: 70, nome: "Cliente X" })]);
    const prisma = mockPrisma({ findMany });
    await resolverParceiro(prisma, "Cliente", { filtros: { ehCliente: true } });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.ehCliente).toBe(true);
  });

  it("opcoes.filtros.ehFornecedor/ehEmpresa entram no where", async () => {
    const findMany = jest.fn().mockResolvedValue([row({ odooId: 71, nome: "Fornec Y" })]);
    const prisma = mockPrisma({ findMany });
    await resolverParceiro(prisma, "Fornec", { filtros: { ehFornecedor: true, ehEmpresa: true } });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.ehFornecedor).toBe(true);
    expect(arg.where.ehEmpresa).toBe(true);
  });
});
