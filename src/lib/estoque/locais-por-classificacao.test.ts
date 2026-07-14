import {
  localIdsPorClassificacao,
  whereLocal,
  type FiltroLocal,
} from "./locais-por-classificacao";
import type { PrismaClient } from "@/generated/prisma/client";

function prismaFake(total: number, locais: { odooId: number }[]): PrismaClient {
  return {
    fatoEstoqueLocal: {
      count: jest.fn().mockResolvedValue(total),
      findMany: jest.fn().mockResolvedValue(locais),
    },
  } as unknown as PrismaClient;
}

describe("localIdsPorClassificacao", () => {
  it("devolve os ids dos locais fisicos", async () => {
    const prisma = prismaFake(389, [{ odooId: 11 }, { odooId: 12 }, { odooId: 24 }]);

    const filtro = await localIdsPorClassificacao(prisma);

    expect(filtro).toEqual({
      ids: [11, 12, 24],
      classificacaoIndisponivel: false,
    });
    expect(prisma.fatoEstoqueLocal.findMany).toHaveBeenCalledWith({
      where: { classificacao: "fisico" },
      select: { odooId: true },
    });
  });

  it("aceita outra classificacao", async () => {
    const prisma = prismaFake(389, [{ odooId: 251 }]);

    await localIdsPorClassificacao(prisma, "demonstracao");

    expect(prisma.fatoEstoqueLocal.findMany).toHaveBeenCalledWith({
      where: { classificacao: "demonstracao" },
      select: { odooId: true },
    });
  });

  it("NAO filtra quando o fato de locais ainda nao foi construido", async () => {
    // Janela entre o deploy do app (que ja serve as consultas) e o primeiro ciclo do
    // worker. Filtrar por lista vazia zeraria o KPI de estoque em silencio.
    const prisma = prismaFake(0, []);

    const filtro = await localIdsPorClassificacao(prisma);

    expect(filtro).toEqual({ ids: null, classificacaoIndisponivel: true });
  });

  it("nenhum local em demonstracao e resposta legitima: filtra vazio", async () => {
    // Aqui a lista vazia e a verdade (nao ha equipamento em demonstracao), e a tela deve
    // mostrar vazio. Nao filtrar faria o painel de demonstracao exibir o estoque INTEIRO.
    const prisma = prismaFake(389, []);

    const filtro = await localIdsPorClassificacao(prisma, "demonstracao");

    expect(filtro).toEqual({ ids: [], classificacaoIndisponivel: false });
  });

  it("nenhum deposito FISICO e anomalia: nao filtra e avisa", async () => {
    // Com o fato populado, "zero depositos fisicos" so acontece se o Odoo parar de expor
    // os campos que identificam um deposito , e o estoque iria a R$ 0 em silencio.
    const prisma = prismaFake(389, []);

    const filtro = await localIdsPorClassificacao(prisma, "fisico");

    expect(filtro).toEqual({ ids: null, classificacaoIndisponivel: true });
  });
});

describe("whereLocal", () => {
  it("filtra pelos ids quando disponiveis", () => {
    const filtro: FiltroLocal = {
      ids: [11, 12],
      classificacaoIndisponivel: false,
    };
    expect(whereLocal(filtro)).toEqual({ localId: { in: [11, 12] } });
  });

  it("nao filtra nada quando a classificacao esta indisponivel", () => {
    const filtro: FiltroLocal = { ids: null, classificacaoIndisponivel: true };
    expect(whereLocal(filtro)).toEqual({});
  });

  it("filtra por lista vazia quando a classificacao existe e nao tem locais", () => {
    const filtro: FiltroLocal = { ids: [], classificacaoIndisponivel: false };
    expect(whereLocal(filtro)).toEqual({ localId: { in: [] } });
  });
});
