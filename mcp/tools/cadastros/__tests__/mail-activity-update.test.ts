// mcp/tools/cadastros/__tests__/mail-activity-update.test.ts
import { cadastrosMailActivityUpdate } from "../mail-activity-update.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.read.mockResolvedValue([{ id: 11, summary: "Old", date_deadline: "2026-05-30" }]);
  odoo.write.mockResolvedValue(true);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.mail_activity.update", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejeita sem nenhum campo alem de id", () => {
    const r = cadastrosMailActivityUpdate.inputSchema.safeParse({ id: 11 });
    expect(r.success).toBe(false);
  });

  it("nao aceita res_model nem res_id no schema", () => {
    const shape = cadastrosMailActivityUpdate.inputSchemaShape;
    expect("res_model" in shape).toBe(false);
    expect("res_id" in shape).toBe(false);
  });

  it("update funciona com summary novo", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    await cadastrosMailActivityUpdate.handler(
      { id: 11, summary: "Reagendado" } as never,
      ctx,
    );
    expect(odoo.write).toHaveBeenCalledWith(
      "mail.activity",
      [11],
      { summary: "Reagendado" },
    );
  });
});
