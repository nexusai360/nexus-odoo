// mcp/tools/cadastros/__tests__/mail-activity-complete.test.ts
import { cadastrosMailActivityComplete } from "../mail-activity-complete.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import { AtividadeNaoEncontradaError } from "../../../lib/errors.js";
import { OdooMissingError } from "@/worker/odoo/errors.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(impl: () => Promise<unknown>): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.executeKw.mockImplementation(impl as never);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.mail_activity.complete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("retorna messageId quando action_done responde int", async () => {
    const ctx = makeCtx(() => Promise.resolve(785));
    const r = await cadastrosMailActivityComplete.handler({ id: 11 }, ctx);
    expect(r.data.success).toBe(true);
    expect(r.data.messageId).toBe(785);
  });

  it("normaliza array no retorno", async () => {
    const ctx = makeCtx(() => Promise.resolve([786]));
    const r = await cadastrosMailActivityComplete.handler({ id: 11 }, ctx);
    expect(r.data.messageId).toBe(786);
  });

  it("OdooMissingError -> AtividadeNaoEncontradaError (segunda chamada)", async () => {
    const ctx = makeCtx(() => Promise.reject(new OdooMissingError("nao encontrado")));
    await expect(
      cadastrosMailActivityComplete.handler({ id: 11 }, ctx),
    ).rejects.toBeInstanceOf(AtividadeNaoEncontradaError);
  });
});
