// mcp/tools/cadastros/__tests__/mail-activity-create.test.ts
import { cadastrosMailActivityCreate } from "../mail-activity-create.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import { RegistroNaoEncontradoError } from "../../../lib/errors.js";
import { _clearResolveModelIdCache } from "../../../lib/resolve-model-id.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(opts: { recordExists: boolean } = { recordExists: true }): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  // searchRead chamado 2x: 1. ir.model (resolveModelId), 2. validar res_id
  odoo.searchRead
    .mockResolvedValueOnce([{ id: 85 }]) // ir.model res.partner
    .mockResolvedValueOnce(opts.recordExists ? [{ id: 16426 }] : []);
  odoo.create.mockResolvedValue(11);
  odoo.read.mockResolvedValue([
    { id: 11, summary: "Ligar", date_deadline: "2026-05-30" },
  ]);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

const validInput = {
  res_model: "res.partner",
  res_id: 16426,
  summary: "Ligar",
  date_deadline: "2026-05-30",
  user_id: 11,
};

describe("cadastros.mail_activity.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearResolveModelIdCache();
  });

  it("metadados ok", () => {
    expect(cadastrosMailActivityCreate.id).toBe("cadastros.mail_activity.create");
    expect(cadastrosMailActivityCreate.capability.action).toBe("create");
  });

  it("rejeita date_deadline formato invalido", () => {
    const r = cadastrosMailActivityCreate.inputSchema.safeParse({
      ...validInput,
      date_deadline: "30/05/2026",
    });
    expect(r.success).toBe(false);
  });

  it("cria atividade quando record existe", async () => {
    const ctx = makeCtx({ recordExists: true });
    const r = await cadastrosMailActivityCreate.handler(validInput, ctx);
    expect(r.id).toBe(11);
    expect((ctx.odoo as ReturnType<typeof mockOdooClient>).create).toHaveBeenCalledWith(
      "mail.activity",
      expect.objectContaining({
        res_model_id: 85,
        res_id: 16426,
        summary: "Ligar",
      }),
    );
  });

  it("lanca RegistroNaoEncontradoError quando res_id nao existe", async () => {
    const ctx = makeCtx({ recordExists: false });
    await expect(
      cadastrosMailActivityCreate.handler(validInput, ctx),
    ).rejects.toBeInstanceOf(RegistroNaoEncontradoError);
  });
});
