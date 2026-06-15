import { resolverCentroResultado, DEFAULTS_CENTRO } from "../centro-resultado";
import type { PrismaClient } from "../../../generated/prisma/client";

// 6 centros distintos (cardinalidade real do cache). Shape do select da impl:
// { centroResultadoId, centroResultadoNome }.
const CENTROS = [
  { centroResultadoId: 11, centroResultadoNome: "Comercial" },
  { centroResultadoId: 12, centroResultadoNome: "Administrativo" },
  { centroResultadoId: 13, centroResultadoNome: "Logistica" },
  { centroResultadoId: 14, centroResultadoNome: "Financeiro" },
  { centroResultadoId: 15, centroResultadoNome: "Producao" },
  { centroResultadoId: 16, centroResultadoNome: "Comercial Interno" },
];

/**
 * Mock de prisma.fatoFinanceiroLancamentoItem.findMany que respeita a where da impl:
 * - where.centroResultadoId = <num> exato => so esse centro (ramo id);
 * - where.centroResultadoId = { not: null } => todos os distintos (ramo nome).
 */
function mockPrisma(centros = CENTROS) {
  const findMany = jest.fn(async (args: { where?: { centroResultadoId?: unknown } }) => {
    const cond = args?.where?.centroResultadoId;
    if (typeof cond === "number") {
      return centros.filter((c) => c.centroResultadoId === cond);
    }
    // { not: null } ou ausente: devolve todos (ja sao distintos no fixture).
    return centros;
  });
  return {
    prisma: { fatoFinanceiroLancamentoItem: { findMany } } as unknown as PrismaClient,
    findMany,
  };
}

describe("resolverCentroResultado", () => {
  it("DEFAULTS_CENTRO conservador", () => {
    expect(DEFAULTS_CENTRO).toEqual({ topN: 3, limiarFuzzy: 0.75, margemFolga: 0.1 });
  });

  describe("ramo id", () => {
    it("id existente => unica com score 1 e shape { odooId, nome }", async () => {
      const { prisma, findMany } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "13");
      expect(r.status).toBe("unica");
      if (r.status === "unica") {
        expect(r.entidade).toEqual({ odooId: 13, nome: "Logistica" });
        expect(r.score).toBe(1);
      }
      // ramo id filtra no banco por igualdade (where: { centroResultadoId: 13 }).
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { centroResultadoId: 13 } }),
      );
    });

    it("id inexistente => nenhuma (nunca cai para nome)", async () => {
      const { prisma } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "999");
      expect(r.status).toBe("nenhuma");
    });
  });

  describe("ramo nome fuzzy", () => {
    it("nome exato com folga => unica", async () => {
      const { prisma, findMany } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "Administrativo");
      expect(r.status).toBe("unica");
      if (r.status === "unica") {
        expect(r.entidade).toEqual({ odooId: 12, nome: "Administrativo" });
        expect(r.score).toBe(1);
      }
      // ramo nome carrega os distintos (where: { centroResultadoId: { not: null } }).
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { centroResultadoId: { not: null } },
          distinct: ["centroResultadoId"],
        }),
      );
    });

    it("nome com pequena variacao => unica (fuzzy acima do limiar com folga)", async () => {
      const { prisma } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "Administrativ");
      expect(r.status).toBe("unica");
      if (r.status === "unica") expect(r.entidade.odooId).toBe(12);
    });

    it("nome ambiguo (homonimos proximos) => ambigua com candidatas top-N", async () => {
      // dois centros equidistantes da ref: "Comercial Norte" e "Comercial Sul"
      // (mesmo comprimento, mesma distancia de edicao para "Comercial Xxxxx") =>
      // folga < margem => ambigua.
      const { prisma } = mockPrisma([
        { centroResultadoId: 11, centroResultadoNome: "Comercial Norte" },
        { centroResultadoId: 16, centroResultadoNome: "Comercial Soeste" },
      ]);
      const r = await resolverCentroResultado(prisma, "Comercial Noeste");
      expect(r.status).toBe("ambigua");
      if (r.status === "ambigua") {
        expect(r.criterio).toBe("nome");
        expect(r.candidatas.length).toBeGreaterThanOrEqual(2);
        // candidatas no shape { entidade: { odooId, nome }, score }
        expect(r.candidatas[0].entidade).toEqual(
          expect.objectContaining({ odooId: expect.any(Number), nome: expect.any(String) }),
        );
        const ids = r.candidatas.map((c) => c.entidade.odooId);
        expect(ids).toContain(11);
        expect(ids).toContain(16);
      }
    });

    it("nome sem semelhanca alguma => nenhuma (nao chuta entidade falsa)", async () => {
      const { prisma } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "xyzqwk inexistente");
      expect(r.status).toBe("nenhuma");
    });

    it("base sem centros => nenhuma", async () => {
      const { prisma } = mockPrisma([]);
      const r = await resolverCentroResultado(prisma, "Comercial");
      expect(r.status).toBe("nenhuma");
    });
  });

  describe("filtros e bordas", () => {
    it("ref vazia => nenhuma sem ir ao banco", async () => {
      const { prisma, findMany } = mockPrisma();
      const r = await resolverCentroResultado(prisma, "   ");
      expect(r.status).toBe("nenhuma");
      expect(findMany).not.toHaveBeenCalled();
    });

    it("opcoes.limiarFuzzy mais baixo => aceita match fraco como unica", async () => {
      const { prisma } = mockPrisma([
        { centroResultadoId: 20, centroResultadoNome: "Centro de Distribuicao" },
      ]);
      // limiar baixo + unico candidato => unica mesmo com score fraco.
      const r = await resolverCentroResultado(prisma, "centro", { limiarFuzzy: 0.2 });
      expect(r.status).toBe("unica");
      if (r.status === "unica") expect(r.entidade.odooId).toBe(20);
    });
  });
});
