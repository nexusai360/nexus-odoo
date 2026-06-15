import { resolverContaContabil, DEFAULTS_CONTA, type ContaContabil } from "../conta-contabil";
import type { PrismaClient } from "../../../generated/prisma/client";

// Linhas reais do fixtures-chave-forte.md (fato_conta_contabil):
//   odoo_id=4 codigo="1"      nome="ATIVO"
//   odoo_id=5 codigo="1.1"    nome="ATIVO CIRCULANTE"
//   odoo_id=6 codigo="1.1.1"  nome="DISPONIBILIDADES"
// Mais uma conta hierarquica profunda usada nos casos sem pontos do CS4.
const CONTA_4: ContaContabil = { odooId: 4, codigo: "1", nome: "ATIVO", tipo: "view", natureza: "ativo" };
const CONTA_5: ContaContabil = { odooId: 5, codigo: "1.1", nome: "ATIVO CIRCULANTE", tipo: "view", natureza: "ativo" };
const CONTA_6: ContaContabil = { odooId: 6, codigo: "1.1.1", nome: "DISPONIBILIDADES", tipo: "view", natureza: "ativo" };
const CONTA_110101: ContaContabil = { odooId: 20, codigo: "1.1.01.01", nome: "CAIXA GERAL", tipo: "movimento", natureza: "ativo" };
const CONTA_1101011: ContaContabil = { odooId: 21, codigo: "1.1.01.011", nome: "CAIXA FILIAL", tipo: "movimento", natureza: "ativo" };

// Shape do registro como vem do select (subset de colunas).
type Row = {
  odooId: number;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string | null;
};

function mkPrisma(handlers: {
  findUnique?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoContaContabil: {
      findUnique: handlers.findUnique ?? jest.fn(),
      findMany: handlers.findMany ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

describe("resolverContaContabil", () => {
  it("DEFAULTS_CONTA cravados (topN 3, limiar 0.75, folga 0.1)", () => {
    expect(DEFAULTS_CONTA).toEqual({ topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 });
  });

  describe("ramo id", () => {
    it("id existente => unica", async () => {
      const findUnique = jest.fn().mockResolvedValue(CONTA_4 as Row);
      const prisma = mkPrisma({ findUnique });
      const r = await resolverContaContabil(prisma, "4");
      expect(r.status).toBe("unica");
      if (r.status === "unica") {
        expect(r.entidade.odooId).toBe(4);
        expect(r.score).toBe(1);
      }
      expect(findUnique).toHaveBeenCalledWith({ where: { odooId: 4 } });
    });

    it("id inexistente cai para o ramo nome (sem match) => nenhuma", async () => {
      // "4" nao e codigo (sem ponto e tambem testado como digito); findUnique null,
      // depois o ramo nome roda findMany e nao acha nada.
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mkPrisma({ findUnique, findMany });
      const r = await resolverContaContabil(prisma, "999999999");
      expect(r.status).toBe("nenhuma");
    });
  });

  describe("ramo codigo", () => {
    it("codigo com pontos exato => unica (where codigo exato)", async () => {
      const findMany = jest.fn().mockResolvedValue([CONTA_110101 as Row]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "1.1.01.01");
      expect(r.status).toBe("unica");
      if (r.status === "unica") expect(r.entidade.odooId).toBe(20);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ codigo: "1.1.01.01" }) }),
      );
    });

    it("codigo com pontos inexistente => nenhuma (nunca fuzzy)", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "9.9.99.99");
      expect(r.status).toBe("nenhuma");
    });

    it("codigo sem pontos casa por igualdade de digits => unica", async () => {
      // "110101" carrega por prefixo do primeiro digito ("1") e compara
      // cand.codigo.replace(/\./g,"") === "110101". CONTA_110101 ("1.1.01.01" => "1101 01" = "11010 1"...)
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([
        CONTA_4 as Row,
        CONTA_5 as Row,
        CONTA_110101 as Row,
        CONTA_1101011 as Row,
      ]);
      const prisma = mkPrisma({ findUnique, findMany });
      const r = await resolverContaContabil(prisma, "110101");
      expect(r.status).toBe("unica");
      if (r.status === "unica") expect(r.entidade.odooId).toBe(20);
      // carga por prefixo do primeiro digito
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ codigo: { startsWith: "1" } }) }),
      );
    });

    it("anti-falso-positivo: '110101' NAO casa '1.1.01.011' (digits diferentes)", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      // So a conta com digits "11010101" existe; "110101" nao tem igualdade exata com ela.
      const findMany = jest.fn().mockResolvedValue([CONTA_1101011 as Row]);
      const prisma = mkPrisma({ findUnique, findMany });
      const r = await resolverContaContabil(prisma, "110101");
      expect(r.status).toBe("nenhuma");
    });

    it("codigo sem pontos sem match algum => nenhuma", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([CONTA_4 as Row]);
      const prisma = mkPrisma({ findUnique, findMany });
      const r = await resolverContaContabil(prisma, "777777");
      expect(r.status).toBe("nenhuma");
    });
  });

  describe("ramo nome", () => {
    it("nome fuzzy unico acima do limiar => unica criterio nome", async () => {
      const findMany = jest.fn().mockResolvedValue([CONTA_6 as Row]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "disponibilidades");
      expect(r.status).toBe("unica");
      if (r.status === "unica") expect(r.entidade.odooId).toBe(6);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nome: { contains: "disponibilidades", mode: "insensitive" } }),
        }),
      );
    });

    it("nome ambiguo (dois proximos sem folga) => ambigua criterio nome top-N", async () => {
      const findMany = jest.fn().mockResolvedValue([
        { odooId: 30, codigo: "1.1.02", nome: "ATIVO CIRCULANTE A", tipo: "view", natureza: "ativo" } as Row,
        { odooId: 31, codigo: "1.1.03", nome: "ATIVO CIRCULANTE B", tipo: "view", natureza: "ativo" } as Row,
      ]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "ativo circulante x");
      expect(r.status).toBe("ambigua");
      if (r.status === "ambigua") {
        expect(r.criterio).toBe("nome");
        expect(r.candidatas.length).toBe(2);
        expect(r.candidatas[0].entidade.codigo).toBeDefined();
      }
    });

    it("nome sem match => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "conta que nao existe");
      expect(r.status).toBe("nenhuma");
    });

    it("nome fraco (abaixo do limiar) => nenhuma, nao chuta", async () => {
      const findMany = jest.fn().mockResolvedValue([CONTA_4 as Row]);
      const prisma = mkPrisma({ findMany });
      const r = await resolverContaContabil(prisma, "passivo nao circulante longo");
      expect(r.status).toBe("nenhuma");
    });
  });

  describe("filtros", () => {
    it("filtro natureza/tipo entra no where do ramo nome", async () => {
      const findMany = jest.fn().mockResolvedValue([CONTA_6 as Row]);
      const prisma = mkPrisma({ findMany });
      await resolverContaContabil(prisma, "disponibilidades", {
        filtros: { natureza: "ativo", tipo: "view" },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nome: { contains: "disponibilidades", mode: "insensitive" },
            natureza: "ativo",
            tipo: "view",
          }),
        }),
      );
    });

    it("filtro natureza/tipo entra no where do ramo codigo com pontos", async () => {
      const findMany = jest.fn().mockResolvedValue([CONTA_110101 as Row]);
      const prisma = mkPrisma({ findMany });
      await resolverContaContabil(prisma, "1.1.01.01", { filtros: { natureza: "ativo" } });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ codigo: "1.1.01.01", natureza: "ativo" }),
        }),
      );
    });
  });
});
