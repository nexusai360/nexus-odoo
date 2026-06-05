/**
 * B2. Testes do persistMessage focados no campo `kind`.
 * Padrao da casa: mock de @/lib/prisma (sem Postgres real).
 * Prova que passar kind="audio" inclui `kind` no create.data e que,
 * sem o param, `kind` NAO entra no data (fica no default do schema).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    message: { create: jest.fn() },
    conversation: { findUnique: jest.fn() },
  },
}));

import { persistMessage } from "../conversation";
import { prisma } from "@/lib/prisma";

const CONV = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.message.create as jest.Mock).mockResolvedValue({ id: "m1" });
});

test('kind="audio" inclui kind no create.data', async () => {
  await persistMessage(CONV, "user", "ola", undefined, "audio");
  expect(prisma.message.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        conversationId: CONV,
        role: "user",
        content: "ola",
        kind: "audio",
      }),
    }),
  );
});

test("sem kind, o create.data NAO carrega kind", async () => {
  await persistMessage(CONV, "user", "ola");
  const arg = (prisma.message.create as jest.Mock).mock.calls[0][0];
  expect(arg.data).not.toHaveProperty("kind");
});
