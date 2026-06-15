import { resolverPedido, DEFAULTS_PEDIDO, type PedidoCandidata } from "../pedido";
import type { PrismaClient } from "../../../generated/prisma/client";

// Mock minimo de prisma.fatoPedido (so os metodos que o resolvedor usa).
function fakePrisma(over: {
  findUnique?: jest.Mock;
  findMany?: jest.Mock;
}): PrismaClient {
  return {
    fatoPedido: {
      findUnique: over.findUnique ?? jest.fn().mockResolvedValue(null),
      findMany: over.findMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

// Registros reais (fixtures-chave-forte.md): odoo_id=45 numero="DV-0001/26"
// tipo="devolucao_venda"; odoo_id=103 numero="TRANSF-0014/26" tipo="transferencia_solicitacao".
const PEDIDO_45 = {
  odooId: 45,
  numero: "DV-0001/26",
  tipo: "devolucao_venda",
  etapaNome: "Aprovado",
  participanteNome: "CLIENTE TESTE LTDA",
  dataOrcamento: new Date("2026-01-10T00:00:00.000Z"),
  vrProdutos: "1500.00",
};

const PEDIDO_103 = {
  odooId: 103,
  numero: "TRANSF-0014/26",
  tipo: "transferencia_solicitacao",
  etapaNome: "Solicitado",
  participanteNome: "FILIAL SP",
  dataOrcamento: new Date("2026-02-20T00:00:00.000Z"),
  vrProdutos: "0.00",
};

describe("resolverPedido", () => {
  describe("ramo numero", () => {
    it("resolve por id (odooId) numerico curto => unica score 1", async () => {
      const findUnique = jest.fn().mockResolvedValue(PEDIDO_45);
      const prisma = fakePrisma({ findUnique });
      const res = await resolverPedido(prisma, "45");
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { odooId: 45 } }),
      );
      expect(res.status).toBe("unica");
      if (res.status === "unica") {
        expect(res.entidade.odooId).toBe(45);
        expect(res.entidade.numero).toBe("DV-0001/26");
        expect(res.entidade.tipo).toBe("devolucao_venda");
        expect(res.score).toBe(1);
      }
    });

    it("id inexistente NAO vira unica (cai para nenhuma, sem chutar)", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prisma = fakePrisma({ findUnique });
      const res = await resolverPedido(prisma, "9999");
      expect(res.status).toBe("nenhuma");
    });

    it("resolve por numero no formato ^[A-Z]+-\\d+/\\d{2}$ exato => unica", async () => {
      const findMany = jest.fn().mockResolvedValue([PEDIDO_45]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "DV-0001/26");
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { numero: "DV-0001/26" } }),
      );
      expect(res.status).toBe("unica");
      if (res.status === "unica") {
        expect(res.entidade.numero).toBe("DV-0001/26");
        expect(res.score).toBe(1);
      }
    });

    it("mesmo numero em tipos diferentes => ambigua criterio codigo", async () => {
      const outroTipo = { ...PEDIDO_45, odooId: 46, tipo: "venda" };
      const findMany = jest.fn().mockResolvedValue([PEDIDO_45, outroTipo]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "DV-0001/26");
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.criterio).toBe("codigo");
        expect(res.candidatas).toHaveLength(2);
        expect(res.candidatas.every((c) => c.score === 1)).toBe(true);
      }
    });

    it("opcoes.filtros.tipo desempata numero ambiguo para unica", async () => {
      const findMany = jest.fn().mockResolvedValue([PEDIDO_45]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "DV-0001/26", {
        filtros: { tipo: "devolucao_venda" },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { numero: "DV-0001/26", tipo: "devolucao_venda" },
        }),
      );
      expect(res.status).toBe("unica");
    });

    it("numero no formato mas inexistente no banco => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "DV-9999/99");
      expect(res.status).toBe("nenhuma");
    });

    it("'pedido 123' (fora do formato e nao-id) => nenhuma; defesa e o regex, CS4 nao se aplica", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = fakePrisma({ findUnique, findMany });
      const res = await resolverPedido(prisma, "pedido 123");
      expect(res.status).toBe("nenhuma");
      // Nunca consulta o banco com texto livre (sem ramo fuzzy de nome em pedido).
      expect(findUnique).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });

    it("candidata expoe o shape contratado", async () => {
      const findUnique = jest.fn().mockResolvedValue(PEDIDO_45);
      const prisma = fakePrisma({ findUnique });
      const res = await resolverPedido(prisma, "45");
      expect(res.status).toBe("unica");
      if (res.status === "unica") {
        const c: PedidoCandidata = res.entidade;
        expect(Object.keys(c).sort()).toEqual(
          [
            "dataOrcamento",
            "etapaNome",
            "numero",
            "odooId",
            "participanteNome",
            "tipo",
            "vrProdutos",
          ].sort(),
        );
      }
    });
  });

  describe("ramo lista", () => {
    it("intervalo de data + tipo via filtros => lista (ambigua), nunca unica por data", async () => {
      const findMany = jest.fn().mockResolvedValue([PEDIDO_45, PEDIDO_103]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "", {
        filtros: {
          dataDe: "2026-01-01",
          dataAte: "2026-12-31",
          tipo: "devolucao_venda",
        },
      });
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.criterio).toBe("nome");
        expect(res.candidatas.length).toBeGreaterThan(0);
      }
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.tipo).toBe("devolucao_venda");
      expect(arg.where.dataOrcamento).toEqual({
        gte: new Date("2026-01-01"),
        lte: new Date("2026-12-31"),
      });
    });

    it("um unico match no ramo lista ainda e ambigua (nunca unica so por data/tipo)", async () => {
      const findMany = jest.fn().mockResolvedValue([PEDIDO_45]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "", {
        filtros: { participanteId: 7 },
      });
      expect(res.status).toBe("ambigua");
      if (res.status === "ambigua") {
        expect(res.candidatas).toHaveLength(1);
      }
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.participanteId).toBe(7);
    });

    it("participanteId via filtros sem resultado => nenhuma", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = fakePrisma({ findMany });
      const res = await resolverPedido(prisma, "", {
        filtros: { participanteId: 999 },
      });
      expect(res.status).toBe("nenhuma");
    });

    it("ref vazia sem filtros => nenhuma (nada para resolver)", async () => {
      const prisma = fakePrisma({});
      const res = await resolverPedido(prisma, "");
      expect(res.status).toBe("nenhuma");
    });
  });

  describe("defaults", () => {
    it("DEFAULTS_PEDIDO tem topN e margemFolga, sem limiarFuzzy (pedido nao tem nome fuzzy)", () => {
      expect(DEFAULTS_PEDIDO.topN).toBe(3);
      expect(DEFAULTS_PEDIDO.margemFolga).toBe(0.1);
    });
  });
});
