/* eslint-disable @typescript-eslint/no-explicit-any */
// mcp/__tests__/e2e/coexist-modes.test.ts
// Suíte E2E , modo interno + externo coexistindo (spec §7.1).
//
// Valida que:
//   1. O modo externo (API key) e o modo interno (service token) coexistem:
//      write tools são negadas no interno, permitidas no externo com capability.
//   2. Read tools são permitidas em ambos os modos.
//   3. checkMode discrimina corretamente.
//
// Roda sem Odoo real , usa pipeline direto + checkMode.

import { warnMissingEnv } from "./setup.js";
import { createApiKeyCtx } from "../fixtures/contexts.js";
import { checkMode } from "../../dispatcher/check-mode.js";
import { handleExternalToolList } from "../../dispatcher/external-pipeline.js";
import { crmResPartnerCreate as _crmResPartnerCreate } from "../../tools/crm/res-partner-create.js";
import type { ToolEntry, WriteToolEntry } from "../../catalog/types.js";

// Cast para WriteToolEntry<unknown> , necessário para compatibilidade de tipos
// em funções que aceitam WriteToolEntry<unknown, unknown> (contravariance no handler).
const crmResPartnerCreate = _crmResPartnerCreate as WriteToolEntry;

// Tool de leitura representativa
const mockReadTool: ToolEntry = {
  id: "estoque.saldo_produto",
  dominio: "estoque" as any,
  descricao: "Saldo do produto",
  inputSchemaShape: {},
  inputSchema: { parse: (v: unknown) => v } as any,
  outputSchema: {} as any,
  handler: async () => ({}) as any,
};

const CATALOG = [crmResPartnerCreate, mockReadTool];

beforeAll(() => {
  warnMissingEnv();
});

describe("E2E coexist-modes , interno + externo coexistindo (spec §7.1)", () => {
  // 1. Write tool negada no modo interno
  it("1. write tool bloqueada no modo interno", () => {
    const result = checkMode(crmResPartnerCreate, { mode: "internal", userId: "user-admin" });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("forbidden_via_internal_auth");
  });

  // 2. Write tool permitida no modo externo com capability
  it("2. write tool permitida no modo externo com capability correta", () => {
    // capabilitiesVersion: 2 , crmResPartnerCreate.addedInVersion = 2
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const result = checkMode(crmResPartnerCreate, { mode: "external", apiKey });
    expect(result.allowed).toBe(true);
  });

  // 3. Write tool negada no modo externo sem capability
  it("3. write tool negada no modo externo sem capability", () => {
    const apiKey = createApiKeyCtx({ read: ["crm"], write: {}, capabilitiesVersion: 2 });
    const result = checkMode(crmResPartnerCreate, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
    expect(result.required).toBe("create:crm");
  });

  // 4. Read tool permitida no modo interno (sem gate de capability)
  it("4. read tool sempre permitida no modo interno", () => {
    const result = checkMode(mockReadTool, { mode: "internal", userId: "user-viewer" });
    expect(result.allowed).toBe(true);
  });

  // 5. Read tool permitida no modo externo com read capability
  it("5. read tool permitida no modo externo com read:estoque", () => {
    const apiKey = createApiKeyCtx({ read: ["estoque"], write: {} });
    const result = checkMode(mockReadTool, { mode: "external", apiKey });
    expect(result.allowed).toBe(true);
  });

  // 6. Read tool negada no modo externo sem read capability
  it("6. read tool negada no modo externo sem read:estoque", () => {
    const apiKey = createApiKeyCtx({ read: ["financeiro"], write: {} });
    const result = checkMode(mockReadTool, { mode: "external", apiKey });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("capability_missing");
  });

  // 7. tools/list retorna write + read conforme capabilities
  it("7. tools/list externo , write + read filtrados por capability", () => {
    // capabilitiesVersion: 2 para ver crmResPartnerCreate (addedInVersion: 2)
    const apiKey = createApiKeyCtx({ read: ["estoque"], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const response = handleExternalToolList(null, CATALOG as any, apiKey);
    const tools = (response.result as { tools: { name: string }[] }).tools;
    const names = tools.map((t) => t.name);

    expect(names).toContain("crm.res_partner.create");
    expect(names).toContain("estoque.saldo_produto");
  });

  // 8. tools/list retorna apenas write quando só há write capability
  it("8. tools/list externo , só write se só write capability", () => {
    const apiKey = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });
    const response = handleExternalToolList(null, CATALOG as any, apiKey);
    const tools = (response.result as { tools: { name: string }[] }).tools;
    const names = tools.map((t) => t.name);

    expect(names).toContain("crm.res_partner.create");
    expect(names).not.toContain("estoque.saldo_produto");
  });

  // 9. Independência: múltiplos contextos de auth simultâneos não interferem
  it("9. contextos de auth independentes , sem interferência entre requisições", () => {
    const apiKeyA = createApiKeyCtx({ read: ["estoque"], write: {}, capabilitiesVersion: 2 });
    const apiKeyB = createApiKeyCtx({ read: [], write: { crm: ["create"] }, capabilitiesVersion: 2 });

    const resultA_write = checkMode(crmResPartnerCreate, { mode: "external", apiKey: apiKeyA });
    const resultB_read = checkMode(mockReadTool, { mode: "external", apiKey: apiKeyB });
    const resultA_read = checkMode(mockReadTool, { mode: "external", apiKey: apiKeyA });
    const resultB_write = checkMode(crmResPartnerCreate, { mode: "external", apiKey: apiKeyB });

    expect(resultA_write.allowed).toBe(false); // A não tem write crm
    expect(resultB_read.allowed).toBe(false);  // B não tem read estoque
    expect(resultA_read.allowed).toBe(true);   // A tem read estoque
    expect(resultB_write.allowed).toBe(true);  // B tem write crm:create
  });
});