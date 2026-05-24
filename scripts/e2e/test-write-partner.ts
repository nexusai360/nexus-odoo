// scripts/e2e/test-write-partner.ts
// Teste manual E2E: roda o handler de crm.res_partner.create contra a base de
// teste Tauga (ODOO_WRITE_*) e limpa o registro criado ao final.
//
// Uso: set -a && source .env.local && set +a && npx tsx scripts/e2e/test-write-partner.ts
// @ts-expect-error tsx aceita .ts em runtime; tsc reclama mas o script roda standalone
import { clientFromEnv } from "../../src/worker/odoo/client.ts";
// @ts-expect-error idem
import { crmResPartnerCreate } from "../../mcp/tools/crm/res-partner-create.ts";

async function main() {
  const odoo = clientFromEnv("write");
  console.log("[env] ODOO_WRITE_URL =", process.env.ODOO_WRITE_URL);
  console.log("[env] ODOO_WRITE_DB  =", process.env.ODOO_WRITE_DB);
  const uid = await odoo.authenticate();
  console.log("[auth] uid =", uid);

  const externalId = `e2e-${Date.now()}`;
  const input = {
    name: `E2E Nexus ${new Date().toISOString()}`,
    is_company: true,
    email: "e2e@nexus.test",
    phone: "(11) 9999-0000",
    external_id: externalId,
  };
  console.log("[input]", input);

  const ctx = { odoo } as Parameters<typeof crmResPartnerCreate.handler>[1];

  try {
    const res = await crmResPartnerCreate.handler(input as never, ctx);
    console.log("[OK] criado id =", res.id);
    console.log("[snapshotAfter]", JSON.stringify(res.snapshotAfter, null, 2));

    // cleanup do registro criado + ir.model.data
    await odoo.executeKw("res.partner", "unlink", [[res.id]]);
    console.log("[cleanup] res.partner unlink ok");
    const irmd = await odoo.searchIrModelData("res.partner", `mcp_external_${externalId}`);
    if (irmd) {
      await odoo.executeKw("ir.model.data", "unlink", [[irmd.id]]);
      console.log("[cleanup] ir.model.data unlink ok");
    }
  } catch (e) {
    console.error("[FAIL]", e);
    process.exitCode = 1;
  }
}
main();
