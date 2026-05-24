// mcp/__tests__/e2e/poc-happy-path.test.ts
// Suíte E2E POC , happy path: criar parceiro via tool, verificar no Odoo real +
// audit (McpAuditLog).
//
// REQUER ODOO REAL: skipped automaticamente se ODOO_WRITE_USER ou
// ODOO_WRITE_PASSWORD estiverem ausentes.
//
// Estratégia:
//   1. Criar ApiKey real no banco local via fixture.
//   2. Chamar handleExternalRequest com Odoo real (clientFromEnv("write")).
//   3. Verificar: resposta HTTP 200 + isError:false + audit gravado.
//   4. Cleanup: deletar parceiro no Odoo + ApiKey.

import { randomUUID } from "node:crypto";
import { odooCredsAvailable, warnMissingEnv, TEST_PREFIX } from "./setup.js";
import { handleExternalRequest } from "../../dispatcher/external-pipeline.js";
import { crmResPartnerCreate as _crmResPartnerCreate } from "../../tools/crm/res-partner-create.js";
import type { WriteToolEntry } from "../../catalog/types.js";
import { createMockRedis } from "../mocks/redis.js";

// Cast para WriteToolEntry<unknown> , contravariance no handler
const crmResPartnerCreate = _crmResPartnerCreate as WriteToolEntry;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  warnMissingEnv();
});

// ─── Suite (skip elegante se sem creds) ──────────────────────────────────────

const describeOrSkip = odooCredsAvailable ? describe : describe.skip;

describeOrSkip("E2E POC , happy path com Odoo real", () => {
  it("cria parceiro via pipeline externo e grava audit", async () => {
    // Todos os imports de infra via jest.requireActual para evitar ESM issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = jest.requireActual<typeof import("@/generated/prisma/client")>(
      "@/generated/prisma/client",
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createTestApiKey, cleanupTestApiKey } = jest.requireActual<
      typeof import("../fixtures/api-key.js")
    >("../fixtures/api-key.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cleanupPartnersByPrefix } = jest.requireActual<
      typeof import("../fixtures/odoo-cleanup.js")
    >("../fixtures/odoo-cleanup.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clientFromEnv } = jest.requireActual<typeof import("@/worker/odoo/client.js")>(
      "@/worker/odoo/client.js",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = new (PrismaClient as any)() as import("@/generated/prisma/client").PrismaClient;
    let apiKeyId: string | undefined;

    try {
      // Arrange: ApiKey com capability crm:create
      const { id, apiKey } = await createTestApiKey(prisma, {
        label: `${TEST_PREFIX} poc-happy-path`,
        capabilities: {
          read: [],
          write: { crm: ["create"] },
        },
        rateLimit: 120,
      });
      apiKeyId = id;

      const apiKeyCtx = {
        apiKeyId: id,
        label: apiKey.label,
        last4: apiKey.last4,
        capabilities: { version: 1, read: [], write: { crm: ["create"] } },
        capabilitiesVersion: 2, // addedInVersion: 2 do crmResPartnerCreate
        rateLimit: apiKey.rateLimit,
        tenantId: apiKey.tenantId,
        allowedOrigins: apiKey.allowedOrigins,
        isSystemKey: apiKey.isSystemKey,
      };

      const partnerName = `${TEST_PREFIX} parceiro-e2e-${Date.now()}`;
      const idempotencyKey = randomUUID();

      const odoo = clientFromEnv("write");
      await odoo.authenticate();

      const redis = createMockRedis();

      const bodyObj = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "crm.res_partner.create",
          arguments: {
            name: partnerName,
            is_company: true,
            email: "e2e-test@mcp.dev",
          },
        },
      };

      const bodyBuf = Buffer.from(JSON.stringify(bodyObj));
      const fakeReq = {
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          origin: "http://localhost",
        },
      } as unknown as Parameters<typeof handleExternalRequest>[0];

      // Act
      const { status, body: rawBody } = await handleExternalRequest(
        fakeReq,
        bodyBuf,
        apiKeyCtx,
        {
          prisma,
          redis,
          catalog: [crmResPartnerCreate],
          odooClientFactory: () => odoo,
          syncQueue: { add: jest.fn().mockResolvedValue(undefined) },
          serverVersion: "test-e2e",
        },
      );

      const response = JSON.parse(rawBody);

      // Assert: resposta de sucesso
      expect(status).toBe(200);
      expect(response.result.isError).toBe(false);
      const resultData = JSON.parse(response.result.content[0].text);
      expect(resultData).not.toBeNull();

      // Verificar: audit log gravado
      const audit = await prisma.mcpAuditLog.findFirst({
        where: {
          tool: "crm.res_partner.create",
          apiKeyId: id,
          status: "success",
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.operation).toBe("write");
      expect(audit?.httpStatus).toBe(200);

      // Cleanup Odoo
      const odooIdCreated = resultData?.id as number | undefined;
      if (typeof odooIdCreated === "number") {
        try {
          await odoo.unlink("res.partner", [odooIdCreated]);
        } catch {
          await cleanupPartnersByPrefix(odoo, TEST_PREFIX);
        }
      }
    } finally {
      if (apiKeyId) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { cleanupTestApiKey: cleanup } = jest.requireActual<
          typeof import("../fixtures/api-key.js")
        >("../fixtures/api-key.js");
        await cleanup(prisma, apiKeyId);
      }
      await prisma.$disconnect();
    }
  });
});
