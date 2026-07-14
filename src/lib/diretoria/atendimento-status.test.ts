import {
  atendimentoSincronizado,
  CHAVE_BUILD_ATENDIMENTO,
} from "./atendimento-status";
import type { PrismaClient } from "@/generated/prisma/client";

function prismaFake(estado: { ultimoBuildAt: Date } | null): PrismaClient {
  return {
    fatoBuildState: {
      findUnique: jest.fn().mockResolvedValue(estado),
    },
  } as unknown as PrismaClient;
}

describe("atendimentoSincronizado", () => {
  it("confirma que da para confiar nas colunas de atendimento", async () => {
    const em = new Date("2026-07-13T21:00:00Z");
    const prisma = prismaFake({ ultimoBuildAt: em });

    expect(await atendimentoSincronizado(prisma)).toEqual({ ok: true, em });
  });

  it("avisa quando o job nunca completou", async () => {
    // Sem o marcador, as consultas caem na quantidade cheia , TODAS, uniformemente.
    // Se cada pedido escolhesse sozinho entre a coluna e o fallback, uma falha no meio
    // do job somaria os dois no mesmo total e produziria um numero que nao e nem a
    // demanda cheia nem a demanda real.
    const prisma = prismaFake(null);

    expect(await atendimentoSincronizado(prisma)).toEqual({ ok: false, em: null });
  });

  it("le o marcador do proprio job, nao o de outro fato", async () => {
    const prisma = prismaFake({ ultimoBuildAt: new Date() });

    await atendimentoSincronizado(prisma);

    expect(prisma.fatoBuildState.findUnique).toHaveBeenCalledWith({
      where: { fato: CHAVE_BUILD_ATENDIMENTO },
      select: { ultimoBuildAt: true },
    });
  });
});
