import { resolverNotaFiscal, DEFAULTS_NOTA } from "../nota-fiscal";
import type { PrismaClient } from "../../../generated/prisma/client";

// Mock minimo de prisma.fatoNotaFiscal (so os metodos que o resolvedor usa).
function fakePrisma(over: {
  findUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoNotaFiscal: {
      findUnique: over.findUnique ?? jest.fn().mockResolvedValue(null),
      findFirst: over.findFirst ?? jest.fn().mockResolvedValue(null),
      findMany: over.findMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

// Registro real (fixtures-chave-forte.md): odoo_id=43214, serie="4", modelo="55",
// chave=44 digitos. vrNf simula o Decimal do Prisma (objeto com toNumber()).
const CHAVE_44 = "41260304028712345678550040000000011234567890";
function decimal(n: number) {
  return { toNumber: () => n };
}
const NF_43214 = {
  odooId: 43214,
  serie: "4",
  modelo: "55",
  chave: CHAVE_44,
  situacaoNfe: "autorizada",
  participanteNome: "FORNECEDOR EXEMPLO LTDA",
  dataEmissao: new Date("2026-03-04T00:00:00.000Z"),
  vrNf: decimal(2870.5),
};
const NF_CANCELADA = {
  odooId: 99001,
  serie: "1",
  modelo: "55",
  chave: "41260399999999999999550010000000019999999999",
  situacaoNfe: "cancelada",
  participanteNome: "CLIENTE CANCELADO LTDA",
  dataEmissao: new Date("2026-03-05T00:00:00.000Z"),
  vrNf: decimal(100),
};

describe("resolverNotaFiscal", () => {
  describe("ramos exatos", () => {
    it("resolve por id (odooId) numerico curto => unica score 1", async () => {
      const findUnique = jest.fn().mockResolvedValue(NF_43214);
      const prisma = fakePrisma({ findUnique });
      const res = await resolverNotaFiscal(prisma, "43214");
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { odooId: 43214 } }),
      );
      expect(res.status).toBe("unica");
      if (res.status === "unica") {
        expect(res.entidade.odooId).toBe(43214);
        expect(res.entidade.serie).toBe("4");
        expect(res.entidade.modelo).toBe("55");
        expect(res.entidade.vrNf).toBe(2870.5);
        expect(res.score).toBe(1);
      }
    });

    it("id inexistente NAO vira unica (cai para nenhuma, sem chutar)", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prisma = fakePrisma({ findUnique });
      const res = await resolverNotaFiscal(prisma, "777");
      expect(res.status).toBe("nenhuma");
    });

    it("chave de 44 digitos exata => unica, where { chave }", async () => {
      const findFirst = jest.fn().mockResolvedValue(NF_43214);
      const prisma = fakePrisma({ findFirst });
      const res = await resolverNotaFiscal(prisma, CHAVE_44);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { chave: CHAVE_44 } }),
      );
      expect(res.status).toBe("unica");
      if (res.status === "unica") {
        expect(res.entidade.chave).toBe(CHAVE_44);
        expect(res.score).toBe(1);
      }
    });

    it("chave de 44 digitos com espacos ao redor e trimada antes do match", async () => {
      const findFirst = jest.fn().mockResolvedValue(NF_43214);
      const prisma = fakePrisma({ findFirst });
      const res = await resolverNotaFiscal(prisma, `  ${CHAVE_44}  `);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { chave: CHAVE_44 } }),
      );
      expect(res.status).toBe("unica");
    });

    it("chave de 41 digitos NAO roteia para ramo chave; sem match => nenhuma (armadilha a)", async () => {
      const findFirst = jest.fn().mockResolvedValue(NF_43214);
      const prisma = fakePrisma({ findFirst });
      const res = await resolverNotaFiscal(prisma, "4".repeat(41));
      expect(findFirst).not.toHaveBeenCalled();
      expect(res.status).toBe("nenhuma");
    });

    it("ref de 44 caracteres com letra NAO roteia para ramo chave => nenhuma", async () => {
      const findFirst = jest.fn().mockResolvedValue(NF_43214);
      const prisma = fakePrisma({ findFirst });
      const comLetra = "A" + "4".repeat(43);
      const res = await resolverNotaFiscal(prisma, comLetra);
      expect(findFirst).not.toHaveBeenCalled();
      expect(res.status).toBe("nenhuma");
    });

    it("chave de 44 digitos sem match no cache => nenhuma (nao chuta)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = fakePrisma({ findFirst });
      const res = await resolverNotaFiscal(prisma, CHAVE_44);
      expect(res.status).toBe("nenhuma");
    });

    it("numero NUNCA e consultado: nenhum ramo chama findMany para um id curto", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([NF_43214]);
      const prisma = fakePrisma({ findUnique, findMany });
      const res = await resolverNotaFiscal(prisma, "12");
      // id curto: so findUnique. Sem fallback por numero/data quando nao ha filtros.
      expect(findMany).not.toHaveBeenCalled();
      expect(res.status).toBe("nenhuma");
    });
  });

  describe("ramo lista por filtros", () => {
    it("intervalo de data + entradaSaida retorna lista (ambigua), nunca unica por data", async () => {
      const findMany = jest.fn().mockResolvedValue([NF_43214, NF_CANCELADA]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverNotaFiscal(prisma, "notas de marco", {
        filtros: {
          dataDe: new Date("2026-03-01T00:00:00.000Z"),
          dataAte: new Date("2026-03-31T23:59:59.000Z"),
          entradaSaida: "entrada",
        },
      });
      expect(findMany).toHaveBeenCalledTimes(1);
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.entradaSaida).toBe("entrada");
      expect(arg.where.dataEmissao).toEqual({
        gte: new Date("2026-03-01T00:00:00.000Z"),
        lte: new Date("2026-03-31T23:59:59.000Z"),
      });
      // situacaoNfe NAO entra no where: cancelada nao some.
      expect(arg.where.situacaoNfe).toBeUndefined();
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.candidatas).toHaveLength(2);
        expect(res.criterio).toBe("documento");
      }
    });

    it("cancelada aparece marcada na candidata, nao filtrada", async () => {
      const findMany = jest.fn().mockResolvedValue([NF_CANCELADA]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverNotaFiscal(prisma, "x", {
        filtros: { entradaSaida: "saida" },
      });
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.candidatas[0].entidade.situacaoNfe).toBe("cancelada");
      }
    });

    it("respeita topN no take do findMany (default 3)", async () => {
      const findMany = jest.fn().mockResolvedValue([NF_43214]);
      const prisma = fakePrisma({ findMany });
      await resolverNotaFiscal(prisma, "x", {
        filtros: { dataDe: new Date("2026-03-01T00:00:00.000Z") },
      });
      const arg = findMany.mock.calls[0][0];
      expect(arg.take).toBe(DEFAULTS_NOTA.topN);
      await resolverNotaFiscal(prisma, "x", {
        filtros: { dataDe: new Date("2026-03-01T00:00:00.000Z") },
        topN: 5,
      });
      expect(findMany.mock.calls[1][0].take).toBe(5);
    });

    it("filtro sem nenhum resultado => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverNotaFiscal(prisma, "x", {
        filtros: { entradaSaida: "saida" },
      });
      expect(res.status).toBe("nenhuma");
    });

    it("so entradaSaida (sem data) tambem filtra no banco, sem clausula de data", async () => {
      const findMany = jest.fn().mockResolvedValue([NF_43214]);
      const prisma = fakePrisma({ findMany });
      await resolverNotaFiscal(prisma, "x", { filtros: { entradaSaida: "entrada" } });
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.entradaSaida).toBe("entrada");
      expect(arg.where.dataEmissao).toBeUndefined();
    });
  });

  describe("texto livre sem filtros", () => {
    it("texto que nao e id/chave e sem filtros => nenhuma (NF nao tem nome)", async () => {
      const findMany = jest.fn().mockResolvedValue([NF_43214]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverNotaFiscal(prisma, "nota do fornecedor exemplo");
      expect(findMany).not.toHaveBeenCalled();
      expect(res.status).toBe("nenhuma");
    });
  });

  it("DEFAULTS_NOTA conforme o plano (topN 3, limiar 0.75, folga 0.1)", () => {
    expect(DEFAULTS_NOTA).toEqual({ topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 });
  });
});
