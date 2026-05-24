// mcp/tools/cadastros/__tests__/res-partner-category-set-tags.test.ts
import { cadastrosResPartnerCategorySetTags } from "../res-partner-category-set-tags.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.read.mockResolvedValue([{ id: 16426, name: "P", category_id: [1, 2] }]);
  odoo.write.mockResolvedValue(true);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.res_partner_category.set_tags , modes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mode=add manda [(4, id), ...]", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    await cadastrosResPartnerCategorySetTags.handler(
      { partner_id: 16426, category_ids: [1, 2], mode: "add" },
      ctx,
    );
    expect(odoo.write).toHaveBeenCalledWith(
      "res.partner",
      [16426],
      { category_id: [[4, 1], [4, 2]] },
    );
  });

  it("mode=remove manda [(3, id), ...]", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    await cadastrosResPartnerCategorySetTags.handler(
      { partner_id: 16426, category_ids: [1], mode: "remove" },
      ctx,
    );
    expect(odoo.write).toHaveBeenCalledWith(
      "res.partner",
      [16426],
      { category_id: [[3, 1]] },
    );
  });

  it("mode=replace manda [(6, 0, [ids])]", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    await cadastrosResPartnerCategorySetTags.handler(
      { partner_id: 16426, category_ids: [7, 8], mode: "replace" },
      ctx,
    );
    expect(odoo.write).toHaveBeenCalledWith(
      "res.partner",
      [16426],
      { category_id: [[6, 0, [7, 8]]] },
    );
  });

  it("rejeita category_ids vazio", () => {
    const r = cadastrosResPartnerCategorySetTags.inputSchema.safeParse({
      partner_id: 1,
      category_ids: [],
    });
    expect(r.success).toBe(false);
  });
});
