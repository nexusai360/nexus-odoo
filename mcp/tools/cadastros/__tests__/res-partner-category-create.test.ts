// mcp/tools/cadastros/__tests__/res-partner-category-create.test.ts
import { cadastrosResPartnerCategoryCreate } from "../res-partner-category-create.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(searchExisting: { id: number }[] = []): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.searchRead.mockResolvedValue(searchExisting);
  odoo.create.mockResolvedValue(42);
  odoo.read.mockResolvedValue([{ id: searchExisting[0]?.id ?? 42, name: "VIP", color: 1 }]);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.res_partner_category.create", () => {
  beforeEach(() => jest.clearAllMocks());

  it("metadados ok", () => {
    expect(cadastrosResPartnerCategoryCreate.id).toBe("cadastros.res_partner_category.create");
    expect(cadastrosResPartnerCategoryCreate.capability.action).toBe("create");
    expect(cadastrosResPartnerCategoryCreate.sensitive).toBe(false);
  });

  it("rejeita name vazio", () => {
    const r = cadastrosResPartnerCategoryCreate.inputSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("cria nova quando nao existe (created=true)", async () => {
    const ctx = makeCtx([]);
    const r = await cadastrosResPartnerCategoryCreate.handler({ name: "VIP" }, ctx);
    expect(r.id).toBe(42);
    expect(r.data.created).toBe(true);
  });

  it("retorna existente quando ja existe (created=false)", async () => {
    const ctx = makeCtx([{ id: 5 }]);
    const r = await cadastrosResPartnerCategoryCreate.handler({ name: "VIP" }, ctx);
    expect(r.id).toBe(5);
    expect(r.data.created).toBe(false);
    expect((ctx.odoo as ReturnType<typeof mockOdooClient>).create).not.toHaveBeenCalled();
  });
});
