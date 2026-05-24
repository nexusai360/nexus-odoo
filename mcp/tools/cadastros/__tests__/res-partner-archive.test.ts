// mcp/tools/cadastros/__tests__/res-partner-archive.test.ts
import { cadastrosResPartnerArchive } from "../res-partner-archive.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.read
    .mockResolvedValueOnce([{ id: 16426, name: "X", active: true }])
    .mockResolvedValueOnce([{ id: 16426, name: "X", active: false }]);
  odoo.write.mockResolvedValue(true);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.res_partner.archive", () => {
  beforeEach(() => jest.clearAllMocks());

  it("tem metadados corretos", () => {
    expect(cadastrosResPartnerArchive.id).toBe("cadastros.res_partner.archive");
    expect(cadastrosResPartnerArchive.capability).toEqual({
      module: "cadastros",
      action: "archive",
    });
    expect(cadastrosResPartnerArchive.sensitive).toBe(false);
  });

  it("rejeita input sem id", () => {
    expect(cadastrosResPartnerArchive.inputSchema.safeParse({}).success).toBe(false);
  });

  it("chama write com active=false", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    await cadastrosResPartnerArchive.handler({ id: 16426 }, ctx);
    expect(odoo.write).toHaveBeenCalledWith("res.partner", [16426], { active: false });
  });
});
