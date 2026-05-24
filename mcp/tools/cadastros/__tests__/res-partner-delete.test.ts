// mcp/tools/cadastros/__tests__/res-partner-delete.test.ts
import { cadastrosResPartnerDelete } from "../res-partner-delete.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import { ParceiroEmUsoError } from "../../../lib/errors.js";
import { OdooValidationError } from "@/worker/odoo/errors.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(unlinkImpl: () => Promise<boolean>): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.read.mockResolvedValue([{ id: 16426, name: "X" }]);
  odoo.unlink.mockImplementation(unlinkImpl as never);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.res_partner.delete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("tem metadados sensitive=true", () => {
    expect(cadastrosResPartnerDelete.id).toBe("cadastros.res_partner.delete");
    expect(cadastrosResPartnerDelete.sensitive).toBe(true);
    expect(cadastrosResPartnerDelete.capability).toEqual({
      module: "cadastros",
      action: "delete",
    });
  });

  it("unlink ok retorna data null e snapshotAfter null", async () => {
    const ctx = makeCtx(() => Promise.resolve(true));
    const r = await cadastrosResPartnerDelete.handler({ id: 16426 }, ctx);
    expect(r.data).toBeNull();
    expect(r.snapshotAfter).toBeNull();
    expect(r.snapshotBefore).not.toBeNull();
  });

  it("FK error vira ParceiroEmUsoError", async () => {
    const ctx = makeCtx(() =>
      Promise.reject(
        new OdooValidationError(
          "ERRO: update or delete on table res_partner violates RESTRICT setting of foreign key constraint",
        ),
      ),
    );
    await expect(
      cadastrosResPartnerDelete.handler({ id: 16426 }, ctx),
    ).rejects.toBeInstanceOf(ParceiroEmUsoError);
  });
});
