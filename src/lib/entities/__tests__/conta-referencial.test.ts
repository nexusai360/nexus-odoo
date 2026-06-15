import {
  resolverContaReferencial,
  DEFAULTS_CONTA_REF,
  type ContaReferencial,
} from "../conta-referencial";
import type { PrismaClient } from "../../../generated/prisma/client";

/**
 * Mock minimo de prisma para o resolvedor de conta referencial SPED.
 * Shape real (fixtures-chave-forte.md): fato_contabil_conta_referencial
 * (odoo_id, codigo, nome, nome_completo). Codigo hierarquico com pontos
 * (ex.: "1.01.01"), `@@index([codigo])`.
 */
function mockPrisma(handlers: {
  findUnique?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoContabilContaReferencial: {
      findUnique: handlers.findUnique ?? jest.fn(),
      findMany: handlers.findMany ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

// Linhas reais (formato do referencial SPED): codigo dot-hierarquico.
const ATIVO: ContaReferencial = {
  odooId: 1001,
  codigo: "1",
  nome: "ATIVO",
  nomeCompleto: "ATIVO",
};
const DISPONIVEL: ContaReferencial = {
  odooId: 1002,
  codigo: "1.01.01",
  nome: "CAIXA E EQUIVALENTES DE CAIXA",
  nomeCompleto: "ATIVO > ATIVO CIRCULANTE > CAIXA E EQUIVALENTES DE CAIXA",
};
const APLICACOES: ContaReferencial = {
  odooId: 1003,
  codigo: "1.01.02",
  nome: "APLICACOES FINANCEIRAS",
  nomeCompleto: "ATIVO > ATIVO CIRCULANTE > APLICACOES FINANCEIRAS",
};

describe("resolverContaReferencial", () => {
  describe("ramo id", () => {
    it("id existente => unica", async () => {
      const findUnique = jest.fn().mockResolvedValue(DISPONIVEL);
      const prisma = mockPrisma({ findUnique });
      const res = await resolverContaReferencial(prisma, "1002");
      expect(res).toEqual({ status: "unica", entidade: DISPONIVEL, score: 1 });
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { odooId: 1002 } }),
      );
    });

    it("id inexistente => cai para codigo sem pontos e, sem match, nenhuma", async () => {
      // "9999" classifica como id; nao achando por odoo_id, o resolvedor NAO
      // encerra: um numero curto sem pontos tambem pode ser um codigo digitado
      // sem pontos, entao cai para o ramo de codigo sem pontos (findMany por
      // prefixo). Sem nenhum codigo cujos digits batam "9999" => nenhuma.
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mockPrisma({ findUnique, findMany });
      const res = await resolverContaReferencial(prisma, "9999");
      expect(res).toEqual({ status: "nenhuma" });
    });
  });

  describe("ramo codigo", () => {
    it("codigo com pontos exato => unica (via where indexado)", async () => {
      const findMany = jest.fn().mockResolvedValue([DISPONIVEL]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "1.01.01");
      expect(res).toEqual({ status: "unica", entidade: DISPONIVEL, score: 1 });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { codigo: "1.01.01" } }),
      );
    });

    it("codigo com pontos sem match => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "9.99.99");
      expect(res).toEqual({ status: "nenhuma" });
    });

    it("codigo com pontos repetido => ambigua criterio codigo", async () => {
      const findMany = jest.fn().mockResolvedValue([DISPONIVEL, APLICACOES]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "1.01.01");
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") expect(res.criterio).toBe("codigo");
    });

    it("codigo sem pontos (digits) casa por IGUALDADE de digits => unica", async () => {
      // usuario digita "10101" querendo "1.01.01"
      const findMany = jest.fn().mockResolvedValue([ATIVO, DISPONIVEL, APLICACOES]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "10101");
      expect(res).toEqual({ status: "unica", entidade: DISPONIVEL, score: 1 });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { codigo: { startsWith: "1" } } }),
      );
    });

    it("anti-falso-positivo: digits nunca casam por substring (CS4)", async () => {
      // "10101" NAO pode casar "1.01.011" (digits "101011"); igualdade, nao contains.
      const ruido: ContaReferencial = {
        odooId: 1009,
        codigo: "1.01.011",
        nome: "RUIDO",
        nomeCompleto: "ATIVO > RUIDO",
      };
      const findMany = jest.fn().mockResolvedValue([ATIVO, ruido]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "10101");
      expect(res).toEqual({ status: "nenhuma" });
    });

    it("codigo sem pontos com 2 matches de digits => ambigua codigo", async () => {
      const dup: ContaReferencial = {
        odooId: 1010,
        codigo: "1.0.101",
        nome: "OUTRA",
        nomeCompleto: "ATIVO > OUTRA",
      };
      // "1.01.01" e "1.0.101" ambos viram digits "10101"
      const findMany = jest.fn().mockResolvedValue([DISPONIVEL, dup]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "10101");
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.criterio).toBe("codigo");
        expect(res.candidatas).toHaveLength(2);
      }
    });
  });

  describe("ramo nome", () => {
    it("nome fuzzy unico com folga => unica", async () => {
      // o ranking usa nomeCompleto como texto canonico; termo casa o caminho inteiro.
      const termo = DISPONIVEL.nomeCompleto as string;
      const findMany = jest.fn().mockResolvedValue([DISPONIVEL]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, termo);
      expect(res.status).toBe("unica");
      if (res.status === "unica") expect(res.entidade.odooId).toBe(1002);
      // filtra no banco por OR(nomeCompleto, nome), nao findMany cego
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([
        { nomeCompleto: { contains: termo, mode: "insensitive" } },
        { nome: { contains: termo, mode: "insensitive" } },
      ]);
    });

    it("nome fuzzy com dois candidatos proximos => ambigua criterio nome", async () => {
      // dois candidatos equidistantes do termo (mesma distancia de edicao):
      // scores identicos => folga 0 < margemFolga => ambigua.
      const a: ContaReferencial = {
        odooId: 2001,
        codigo: "3.01",
        nome: "RECEITA DE VENDAS A",
        nomeCompleto: "RECEITA DE VENDAS A",
      };
      const b: ContaReferencial = {
        odooId: 2002,
        codigo: "3.02",
        nome: "RECEITA DE VENDAS B",
        nomeCompleto: "RECEITA DE VENDAS B",
      };
      const findMany = jest.fn().mockResolvedValue([a, b]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "RECEITA DE VENDAS X");
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.criterio).toBe("nome");
        expect(res.candidatas.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("nome sem nenhum match no banco => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mockPrisma({ findMany });
      const res = await resolverContaReferencial(prisma, "INEXISTENTE XYZ");
      expect(res).toEqual({ status: "nenhuma" });
    });

    it("candidato fraco abaixo do limiar => nenhuma (nunca entidade falsa)", async () => {
      const findMany = jest.fn().mockResolvedValue([DISPONIVEL]);
      const prisma = mockPrisma({ findMany });
      // termo so contem "CAIXA" como substring, mas o texto inteiro e bem diferente
      const res = await resolverContaReferencial(prisma, "CAIXA");
      expect(res).toEqual({ status: "nenhuma" });
    });
  });

  describe("contrato e defaults", () => {
    it("DEFAULTS_CONTA_REF expostos", () => {
      expect(DEFAULTS_CONTA_REF).toEqual({ topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 });
    });

    it("ref vazia => nenhuma sem tocar o banco", async () => {
      const findUnique = jest.fn();
      const findMany = jest.fn();
      const prisma = mockPrisma({ findUnique, findMany });
      const res = await resolverContaReferencial(prisma, "   ");
      expect(res).toEqual({ status: "nenhuma" });
      expect(findUnique).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
