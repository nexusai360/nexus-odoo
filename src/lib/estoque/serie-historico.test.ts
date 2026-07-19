import { serieDePreco, serieDeSaldo } from "./serie-historico";
import type { PrismaClient } from "@/generated/prisma/client";

// Fake prisma que registra os `where` recebidos, para provar a regra de corte sem banco.
function fakePrisma(corte: string) {
  const capturas: { findFirst: unknown; findMany: unknown } = { findFirst: null, findMany: null };
  const historico = {
    findFirst: jest.fn(async (args: { where: { capturadoEm?: { lt?: Date } } }) => {
      capturas.findFirst = args.where;
      return null;
    }),
    findMany: jest.fn(async (args: { where: { capturadoEm?: { gte?: Date } } }) => {
      capturas.findMany = args.where;
      return [];
    }),
  };
  const prisma = {
    appSetting: { findUnique: jest.fn().mockResolvedValue({ value: corte }) },
    fatoPrecoHistorico: historico,
    fatoEstoqueSaldoHistorico: historico,
    fatoCapturaRodada: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
  return { prisma, capturas };
}

describe("serieDePreco , regra de corte", () => {
  const CORTE = "2026-03-16";

  it("grampeia a janela ao corte: deIso anterior ao corte vira o corte", async () => {
    const { prisma, capturas } = fakePrisma(CORTE);
    await serieDePreco(prisma, 100, 3, 0, "2026-01-01", "2026-12-31");
    const wherePontos = capturas.findMany as { capturadoEm: { gte: Date } };
    expect(wherePontos.capturadoEm.gte.toISOString().slice(0, 10)).toBe(CORTE);
  });

  it("o carry-forward alcanca ANTES do corte (lt = corte, nao a janela pedida)", async () => {
    const { prisma, capturas } = fakePrisma(CORTE);
    await serieDePreco(prisma, 100, 3, 0, "2026-01-01", "2026-12-31");
    // o inicial busca capturadoEm < de(=corte), ou seja, pode trazer um registro anterior ao corte.
    const whereInicial = capturas.findFirst as { capturadoEm: { lt: Date } };
    expect(whereInicial.capturadoEm.lt.toISOString().slice(0, 10)).toBe(CORTE);
  });
});

describe("serieDeSaldo , regra de corte", () => {
  it("grampeia a janela ao corte tambem no saldo", async () => {
    const { prisma, capturas } = fakePrisma("2026-03-16");
    await serieDeSaldo(prisma, 100, undefined, "2026-01-01", "2026-12-31");
    const wherePontos = capturas.findMany as { capturadoEm: { gte: Date } };
    expect(wherePontos.capturadoEm.gte.toISOString().slice(0, 10)).toBe("2026-03-16");
  });
});
