// mcp/__tests__/integration.test.ts
// Harness de teste de integração do MCP , rede de proteção N6 do catálogo.
//
// Cobre:
//   1. Assertiva de catálogo: super_admin recebe EXATAMENTE 55 tools com os IDs corretos (N6).
//   2. Catálogo filtrado por perfil: cada role recebe o subconjunto correto.
//   3. bi_consulta_avancada só para super_admin e admin.
//   4. registrar_lacuna sempre visível (sempreVisivel).
//   5. Servidor HTTP real: initialize + tools/list via protocolo Streamable HTTP.
//   6. Tool de domínio negado → denied no pipeline (handleToolCall).
//   7. Input inválido → erro estruturado (Zod).
//   8. Tools de domínios-vazios (sempreVisivel) , Onda F.
//
// Mock strategy:
//   - validateServiceToken: aceita TEST_SERVICE_TOKEN
//   - resolveUserContext: retorna UserContext fixo por userId (sem banco)
//   - prisma: mock mínimo para handleToolCall (resolveUser injeta o contexto)
//   - mcpRedis: pipeline mock que sempre retorna count=1 (sem Redis real)
//   - catalogo: REAL (catálogo de produção , objetivo da rede N6)

// ─── Mocks configurados ANTES dos imports de implementação ────────────────────

jest.mock("../auth/service-token.js", () => ({
  validateServiceToken: jest.fn((auth: string | undefined) =>
    auth === `Bearer test-service-token-integration`
  ),
}));

// resolveUserContext retorna o perfil pelo userId (mapa estático)
jest.mock("../auth/user-context.js", () => ({
  resolveUserContext: jest.fn(async (_prisma: unknown, userId: string) => {
    const map: Record<string, object> = {
      "user-super-admin": { userId: "user-super-admin", role: "super_admin", domains: ["estoque", "financeiro"] },
      "user-admin":       { userId: "user-admin",       role: "admin",       domains: ["estoque", "financeiro"] },
      "user-manager":     { userId: "user-manager",     role: "manager",     domains: ["estoque", "financeiro"] },
      "user-viewer":      { userId: "user-viewer",      role: "viewer",      domains: ["estoque"] },
      "user-viewer-fin":  { userId: "user-viewer-fin",  role: "viewer",      domains: ["financeiro"] },
      "user-viewer-none": { userId: "user-viewer-none", role: "viewer",      domains: [] },
      "user-viewer-comercial": { userId: "user-viewer-comercial", role: "viewer", domains: ["comercial"] },
    };
    return map[userId] ?? null;
  }),
}));

jest.mock("../auth/session-store.js", () => ({
  sessionStore: { set: jest.fn(), get: jest.fn(), delete: jest.fn() },
}));

jest.mock("../lib/prisma.js", () => ({
  prisma: {
    mcpAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    featureRequest: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}));

// Rate limiter: sempre permite (count=1)
jest.mock("../lib/redis.js", () => ({
  mcpRedis: {
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    }),
  },
}));

// Mocks para módulos do Bloco P-0 (não exercitados neste teste , modo interno apenas).
// Evitam que conexões de ioredis/BullMQ permaneçam abertas após afterAll.
jest.mock("../auth/auth-middleware.js", () => ({
  authenticate: jest.fn().mockResolvedValue({ mode: "unauthorized", reason: "invalid_token" }),
}));
jest.mock("../auth/api-key-cache.js", () => ({
  createApiKeyCache: jest.fn(() => ({
    getOrLoad: jest.fn(),
    invalidate: jest.fn(),
    invalidateByApiKeyId: jest.fn(),
  })),
}));
jest.mock("../dispatcher/external-pipeline.js", () => ({
  handleExternalRequest: jest.fn(),
}));
jest.mock("../sync/queue.js", () => ({
  getDirectedSyncQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock("@/worker/odoo/client.js", () => ({
  clientFromEnv: jest.fn(),
}));

// NÃO mockar o catálogo , usamos o catálogo REAL (rede de proteção N6)

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { catalogo } from "../catalog/index.js";
import { visibleTools } from "../catalog/registry.js";
import { handleToolCall } from "../server.js";
import { startTestServer, mcpRequest, TEST_SERVICE_TOKEN, resetRpcId, nextRpcId, type TestServer } from "./harness.js";

// ─── Constantes de IDs esperados ──────────────────────────────────────────────

const ESTOQUE_IDS = [
  "estoque_saldo_produto",
  "estoque_valor_armazem",
  "estoque_entradas_saidas",
  "estoque_top_movimentados",
  "estoque_produtos_parados",
  "estoque_concentracao",
  "estoque_produtos_saldo_zero",
  "estoque_locais_por_produto",
  "estoque_minimo_maximo",
];

const FINANCEIRO_IDS = [
  "financeiro_saldo_contas",
  "financeiro_caixa_periodo",
  "financeiro_fluxo_caixa",
  "financeiro_contas_a_receber",
  "financeiro_contas_a_pagar",
  "financeiro_titulos_vencidos",
  "financeiro_liquidez",
  "financeiro_resultado_por_conta",
  "financeiro_baixas_cobranca",
  "financeiro_retornos_processados",
  "financeiro_remessas_geradas",
  "financeiro_carteiras_cobranca",
  "financeiro_cheques",
  "financeiro_pix_recebidos",
];

const COMERCIAL_IDS = [
  "comercial_pedidos_periodo",
  "comercial_pedidos_por_etapa",
  "comercial_pedidos_por_vendedor",
  "comercial_pedidos_atrasados",
  "comercial_parcelas_a_vencer",
  "preco_produto",
  "preco_tabela",
  "comercial_contar_pedidos",
  "preco_contar_regras",
  "comercial_pedidos_listar_top_valor",
  "comercial_vendedores_cadastrados",
  "comercial_pedidos_sem_vendedor",
  "comercial_produtos_por_margem",
  "comercial_pedidos_por_uf",
  "comercial_produtos_por_familia",
  "comercial_tempo_medio_fechamento",
  "comercial_pedido_historico_etapas",
  "comercial_pedido_travados_por_etapa",
  "comercial_cotacoes",
  "comercial_comissoes",
  // F2 (Bloco D)
  "comercial_detalhar_pedido",
];

const FISCAL_IDS = [
  "fiscal_faturamento_periodo",
  "fiscal_notas_emitidas",
  "fiscal_notas_recebidas",
  "fiscal_impostos_periodo",
  "fiscal_faturamento_por_cliente",
  "fiscal_faturamento_por_marca",
  "fiscal_produtos_faturados",
  "fiscal_notas_recebidas_por_fornecedor",
  "fiscal_apuracao",
  "fiscal_carta_correcao",
  "fiscal_contar_notas",
  "fiscal_certificados",
  "referencia_buscar",
  "fiscal_faturamento_mensal_serie",
  "fiscal_faturamento_por_uf",
  "fiscal_notas_emitidas_por_cliente",
  "fiscal_notas_emitidas_por_produto",
  "fiscal_dfe_importados_periodo",
  "fiscal_dfe_por_fornecedor",
  "fiscal_dfe_pendentes_manifestacao",
  // B2 (onda fiscal complementar)
  "fiscal_mdfe_manifestos",
  "fiscal_reinf_eventos",
  // F1 (faturamento + corte por empresa)
  "fiscal_faturamento_por_empresa",
  "fiscal_faturamento_por_operacao",
  "fiscal_faturamento_por_cfop",
  "fiscal_faturamento_nao_autorizado",
  "fiscal_faturamento_recebido",
  // F2 (Bloco D)
  "fiscal_detalhar_nota",
  // F2 (intercompany + receita consolidada externa)
  "fiscal_receita_consolidada",
  "fiscal_intercompany",
];

const CADASTROS_IDS = [
  "cadastro_buscar_parceiro",
  "cadastro_parceiros_por_uf",
  "cadastro_parceiros_por_cidade",
  "cadastro_cidades_listar",
  "cadastro_parceiros_novos",
  "cadastro_parceiros_sem_documento",
  "cadastro_filiais_listar",
  "cadastro_contar_parceiros",
  "cadastro_detalhar_parceiro",
  "cadastro_detalhar_produto",
  "servico_buscar",
  "servico_listar",
  "servico_contar",
];

const CONTABIL_IDS = [
  "contabil_plano_de_contas",
  "contabil_estrutura_conta",
  // B1 (onda contábil , movimento)
  "contabil_saldo_conta",
  "contabil_movimento_conta",
  "contabil_resultado_por_natureza",
  "contabil_centro_custo",
  "contabil_conta_referencial",
  // F2 (Bloco D , gated admin/super_admin)
  "contabil_detalhar_conta",
];

const DOMINIOS_VAZIOS_IDS = [
  "rh_status_dominio",
  "crm_status_dominio",
  "producao_status_dominio",
];

const CRM_IDS = [
  "crm.res_partner.get",
  "crm_pipeline_funis",
];

const TODOS_IDS = [
  ...ESTOQUE_IDS,
  ...FINANCEIRO_IDS,
  ...COMERCIAL_IDS,
  ...FISCAL_IDS,
  ...CADASTROS_IDS,
  ...CONTABIL_IDS,
  ...DOMINIOS_VAZIOS_IDS,
  ...CRM_IDS,
  "registrar_lacuna",
  "bi_consulta_avancada",
  // B5 , produção (sempreVisivel, sem domínio RBAC)
  "producao_processos",
  "auditoria_regras",
];

// ─── 1. Assertiva de catálogo completo (achado N6) ────────────────────────────

describe("Catálogo completo , rede de proteção N6", () => {
  it("super_admin recebe EXATAMENTE 104 tools", () => {
    const user = { userId: "u", role: "super_admin" as const, domains: ["estoque", "financeiro"] } as unknown as Parameters<typeof visibleTools>[1];
    const tools = visibleTools(catalogo, user);
    expect(tools).toHaveLength(104);
  });

  it("super_admin recebe o conjunto exato de IDs", () => {
    const user = { userId: "u", role: "super_admin" as const, domains: ["estoque", "financeiro"] } as unknown as Parameters<typeof visibleTools>[1];
    const tools = visibleTools(catalogo, user);
    const ids = tools.map((t) => t.id).sort();
    expect(ids).toEqual([...TODOS_IDS].sort());
  });

  it("catálogo bruto (antes do filtro) tem exatamente 113 entradas", () => {
    // 104 tools de leitura + 9 write tools:
    //   1) crm.res_partner.create
    //   2) cadastros.mail_activity.complete
    //   3) cadastros.mail_activity.create
    //   4) cadastros.mail_activity.update
    //   5) cadastros.res_partner.archive
    //   6) cadastros.res_partner_category.create
    //   7) cadastros.res_partner_category.set_tags
    //   8) cadastros.res_partner.delete
    //   9) cadastros.res_partner.update
    // Write tools nao aparecem em visibleTools (modo interno); sao liberadas
    // so no modo externo por capability da chave de API.
    expect(catalogo).toHaveLength(113);
  });
});

// ─── 2. Catálogo filtrado por perfil ─────────────────────────────────────────

describe("Catálogo filtrado por perfil", () => {
  function tools(role: string, domains: string[]) {
    const user = { userId: "u", role, domains } as Parameters<typeof visibleTools>[1];
    return visibleTools(catalogo, user).map((t) => t.id);
  }

  it("super_admin vê todas as 104 tools", () => {
    const ids = tools("super_admin", ["estoque", "financeiro"]);
    expect(ids).toHaveLength(104);
    for (const id of TODOS_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("admin vê todas as 104 tools", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    expect(ids).toHaveLength(104);
  });

  it("manager com estoque+financeiro vê estoque+financeiro+sempreVisivel (sem bi_consulta_avancada)", () => {
    const ids = tools("manager", ["estoque", "financeiro"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of ESTOQUE_IDS) expect(ids).toContain(id);
    for (const id of FINANCEIRO_IDS) expect(ids).toContain(id);
    for (const id of DOMINIOS_VAZIOS_IDS) expect(ids).toContain(id);
    // manager sem capability fiscal: as 2 tools B2 (MDF-e/REINF) não aparecem aqui.
    expect(ids).toHaveLength(29);
  });

  it("viewer com apenas estoque vê só tools de estoque + sempreVisivel", () => {
    const ids = tools("viewer", ["estoque"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of ESTOQUE_IDS) expect(ids).toContain(id);
    for (const id of FINANCEIRO_IDS) expect(ids).not.toContain(id);
    for (const id of DOMINIOS_VAZIOS_IDS) expect(ids).toContain(id);
    // 6 estoque + registrar_lacuna + 3 domínios-vazios = 10
    expect(ids).toHaveLength(15);
  });

  it("viewer com apenas financeiro vê só tools de financeiro + sempreVisivel", () => {
    const ids = tools("viewer", ["financeiro"]);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("bi_consulta_avancada");
    for (const id of FINANCEIRO_IDS) expect(ids).toContain(id);
    for (const id of ESTOQUE_IDS) expect(ids).not.toContain(id);
    for (const id of DOMINIOS_VAZIOS_IDS) expect(ids).toContain(id);
    // 14 financeiro (8 + 6 B3) + registrar_lacuna + 3 domínios-vazios = 18
    expect(ids).toHaveLength(20);
  });

  it("viewer sem domínio vê registrar_lacuna + 3 domínios-vazios (sempreVisivel)", () => {
    const ids = tools("viewer", []);
    for (const id of DOMINIOS_VAZIOS_IDS) expect(ids).toContain(id);
    expect(ids).toContain("registrar_lacuna");
    // registrar_lacuna + 3 domínios-vazios = 4
    expect(ids).toHaveLength(6);
  });

  // ─── Onda B: comercial , assertivas de perfil (R2-I1) ────────────────────────
  // Usa apenas perfis existentes no fixture (não estende o mapa de mocks).

  it("admin vê as 21 tools de comercial (RBAC camada 1 , vê tudo)", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    for (const id of COMERCIAL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("viewer com apenas estoque NÃO vê as tools de comercial", () => {
    const ids = tools("viewer", ["estoque"]);
    for (const id of COMERCIAL_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  // ─── Onda D: cadastros , assertivas de perfil (R2-I1) ────────────────────────
  // Usa apenas perfis existentes no fixture (não estende o mapa de mocks).

  it("admin vê as 13 tools de cadastros (RBAC camada 1 , vê tudo)", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    for (const id of CADASTROS_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("viewer com apenas estoque NÃO vê as tools de cadastros", () => {
    const ids = tools("viewer", ["estoque"]);
    for (const id of CADASTROS_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  // ─── Onda E: contábil , assertivas de perfil (R2-I1) ─────────────────────────
  // Usa apenas perfis existentes no fixture (não estende o mapa de mocks).

  it("admin vê as 8 tools de contábil incluindo a detalhar_conta gated (RBAC camada 1 , vê tudo)", () => {
    const ids = tools("admin", ["estoque", "financeiro"]);
    for (const id of CONTABIL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("viewer sem domínio contabil NÃO vê as tools de contábil", () => {
    const ids = tools("viewer", ["estoque"]);
    for (const id of CONTABIL_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  // ─── Onda F: domínios-vazios , sempreVisivel (R2-I1, achado I5) ──────────────

  it("viewer SEM nenhum domínio vê as 3 tools de domínios-vazios (sempreVisivel)", () => {
    const ids = tools("viewer", []);
    for (const id of DOMINIOS_VAZIOS_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("manager SEM domínio vê as 3 tools de domínios-vazios (sempreVisivel)", () => {
    const ids = tools("manager", []);
    for (const id of DOMINIOS_VAZIOS_IDS) {
      expect(ids).toContain(id);
    }
  });

  // viewer-comercial: vê comercial + domínios-vazios; NÃO vê fiscal/cadastros/contabil
  it("viewer COM domínio comercial vê as 14 tools de comercial", () => {
    const ids = tools("viewer", ["comercial"]);
    for (const id of COMERCIAL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("viewer COM domínio comercial NÃO vê tools de fiscal", () => {
    const ids = tools("viewer", ["comercial"]);
    for (const id of FISCAL_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  it("viewer COM domínio comercial NÃO vê tools de cadastros", () => {
    const ids = tools("viewer", ["comercial"]);
    for (const id of CADASTROS_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  it("viewer COM domínio comercial NÃO vê tools de contábil", () => {
    const ids = tools("viewer", ["comercial"]);
    for (const id of CONTABIL_IDS) {
      expect(ids).not.toContain(id);
    }
  });

  it("viewer COM domínio comercial vê as 3 tools de domínios-vazios (sempreVisivel)", () => {
    const ids = tools("viewer", ["comercial"]);
    for (const id of DOMINIOS_VAZIOS_IDS) {
      expect(ids).toContain(id);
    }
  });
});

// ─── 3. bi_consulta_avancada , gate de role ───────────────────────────────────

describe("bi_consulta_avancada , gate de role", () => {
  const biTool = catalogo.find((t) => t.id === "bi_consulta_avancada");

  it("bi_consulta_avancada existe no catálogo", () => {
    expect(biTool).toBeDefined();
  });

  it("bi_consulta_avancada tem gatedRoles = [super_admin, admin]", () => {
    expect(biTool?.gatedRoles).toEqual(expect.arrayContaining(["super_admin", "admin"]));
    expect(biTool?.gatedRoles).toHaveLength(2);
  });

  it.each(["super_admin", "admin"])("%s pode ver bi_consulta_avancada", (role) => {
    const user = { userId: "u", role, domains: ["estoque", "financeiro"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).toContain("bi_consulta_avancada");
  });

  it.each(["manager", "viewer"])("%s NÃO pode ver bi_consulta_avancada", (role) => {
    const user = { userId: "u", role, domains: ["estoque", "financeiro"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).not.toContain("bi_consulta_avancada");
  });
});

// ─── 3b. contabil_detalhar_conta , gate de role (F2 Bloco D) ──────────────────

describe("contabil_detalhar_conta , gate de role", () => {
  const contaTool = catalogo.find((t) => t.id === "contabil_detalhar_conta");

  it("existe no catálogo com gatedRoles [admin, super_admin]", () => {
    expect(contaTool).toBeDefined();
    expect(contaTool?.gatedRoles).toEqual(expect.arrayContaining(["admin", "super_admin"]));
    expect(contaTool?.gatedRoles).toHaveLength(2);
  });

  it.each(["super_admin", "admin"])("%s COM domínio contabil vê contabil_detalhar_conta", (role) => {
    const user = { userId: "u", role, domains: ["contabil"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).toContain("contabil_detalhar_conta");
  });

  it.each(["manager", "viewer"])("%s COM domínio contabil NÃO vê contabil_detalhar_conta (gate por role, não por domínio)", (role) => {
    const user = { userId: "u", role, domains: ["contabil"] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    // o manager/viewer vê as demais tools de contabil, mas NÃO a gated.
    expect(ids).toContain("contabil_plano_de_contas");
    expect(ids).not.toContain("contabil_detalhar_conta");
  });
});

// ─── 4. registrar_lacuna , sempreVisivel ──────────────────────────────────────

describe("registrar_lacuna , sempreVisivel", () => {
  const lacunaTool = catalogo.find((t) => t.id === "registrar_lacuna");

  it("registrar_lacuna existe no catálogo", () => {
    expect(lacunaTool).toBeDefined();
  });

  it("registrar_lacuna tem sempreVisivel=true", () => {
    expect(lacunaTool?.sempreVisivel).toBe(true);
  });

  it.each(["super_admin", "admin", "manager", "viewer"])("%s com domínio vazio ainda vê registrar_lacuna", (role) => {
    const user = { userId: "u", role, domains: [] } as Parameters<typeof visibleTools>[1];
    const ids = visibleTools(catalogo, user).map((t) => t.id);
    expect(ids).toContain("registrar_lacuna");
  });
});

// ─── 5. Servidor HTTP real , protocolo Streamable HTTP end-to-end ────────────
//
// Exercita a cadeia completa: initialize → captura mcp-session-id → tools/list
// → tools/call, tudo passando pelo StreamableHTTPServerTransport real.
// Verifica que o catálogo filtrado por perfil e o gate de 3c funcionam ponta a ponta.

/** Extrai o result de um body JSON-RPC (pode vir como JSON direto ou SSE). */
function extractRpcResult(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  return b.result as Record<string, unknown> | undefined;
}

/**
 * Faz initialize via HTTP e retorna o mcp-session-id emitido pelo servidor.
 * Falha o teste se o sessionId não estiver presente no cabeçalho de resposta.
 */
async function initializeSession(baseUrl: string, userId: string): Promise<string> {
  const { status, body, sessionId } = await mcpRequest(
    baseUrl,
    {
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "nexus-test-harness", version: "1.0" },
        capabilities: {},
      },
    },
    userId,
  );

  expect(status).toBe(200);
  const result = extractRpcResult(body);
  expect(result?.serverInfo).toBeDefined();

  // O SDK Streamable HTTP stateful SEMPRE emite mcp-session-id no cabeçalho do initialize.
  expect(sessionId).toBeDefined();
  return sessionId!;
}

describe("Servidor HTTP real , protocolo Streamable HTTP end-to-end", () => {
  let testServer: TestServer;

  beforeAll(async () => {
    resetRpcId();
    testServer = await startTestServer();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  // ── 5a. Handshake básico ───────────────────────────────────────────────────

  it("initialize retorna serverInfo e mcp-session-id no cabeçalho", async () => {
    await initializeSession(testServer.baseUrl, "user-super-admin");
  });

  it("token inválido retorna 401", async () => {
    const { status } = await fetch(`${testServer.baseUrl}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong-token",
        "x-mcp-user-id": "user-super-admin",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "t", version: "1" }, capabilities: {} } }),
    });
    expect(status).toBe(401);
  });

  it("userId desconhecido retorna 403", async () => {
    const { status } = await fetch(`${testServer.baseUrl}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TEST_SERVICE_TOKEN}`,
        "x-mcp-user-id": "user-desconhecido",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "t", version: "1" }, capabilities: {} } }),
    });
    expect(status).toBe(403);
  });

  // ── 5b. tools/list via HTTP , catálogo filtrado por perfil ────────────────

  it("super_admin: tools/list via HTTP retorna 102 tools com os IDs corretos", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-super-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-super-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    expect(tools!).toHaveLength(104);

    const names = tools!.map((t) => t.name).sort();
    expect(names).toEqual([...TODOS_IDS].sort());
  });

  it("manager: tools/list via HTTP não inclui bi_consulta_avancada", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-manager");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-manager",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    const names = tools!.map((t) => t.name);
    expect(names).not.toContain("bi_consulta_avancada");
    expect(names).toContain("registrar_lacuna");
    for (const id of DOMINIOS_VAZIOS_IDS) expect(names).toContain(id);
    // 8 estoque + 7 financeiro + registrar_lacuna + 3 domínios-vazios = 19
    expect(names).toHaveLength(29);
  });

  it("viewer (estoque): tools/list via HTTP retorna só estoque + registrar_lacuna", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-viewer");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list", params: {} },
      "user-viewer",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    const tools = result?.tools as Array<{ name: string }> | undefined;
    expect(tools).toBeDefined();
    const names = tools!.map((t) => t.name);
    // 6 estoque + registrar_lacuna + 3 domínios-vazios = 10; sem bi_consulta_avancada, sem financeiro
    expect(names).toHaveLength(15);
    expect(names).toContain("registrar_lacuna");
    expect(names).not.toContain("bi_consulta_avancada");
    for (const id of FINANCEIRO_IDS) expect(names).not.toContain(id);
    for (const id of ESTOQUE_IDS) expect(names).toContain(id);
    for (const id of DOMINIOS_VAZIOS_IDS) expect(names).toContain(id);
  });

  // ── 5c. tools/call via HTTP , um por domínio + gate 3c + registrar_lacuna ──

  it("super_admin: tools/call registrar_lacuna via HTTP retorna resultado sem isError", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-super-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "registrar_lacuna",
          arguments: { perguntaResumo: "Qual a margem por produto?", dominio: "financeiro" },
        },
      },
      "user-super-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    // MCP empacota o resultado em result.content[0].text (JSON stringificado)
    const content = result?.content as Array<{ type: string; text: string }> | undefined;
    expect(content).toBeDefined();
    expect(content![0]?.type).toBe("text");
    // Sem isError = sucesso
    expect(result?.isError).toBeFalsy();
  });

  it("admin: tools/call bi_consulta_avancada via HTTP , novo contrato { sql } (sem MCP_BI_DATABASE_URL → erro estruturado)", async () => {
    // O harness de teste não configura MCP_BI_DATABASE_URL, portanto o pool é null
    // e o handler lança Error("modo BI não configurado") → isError=true, outcome="error".
    // Este é o comportamento correto em ambiente sem configuração do Caminho 3c.
    const sid = await initializeSession(testServer.baseUrl, "user-admin");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "bi_consulta_avancada",
          arguments: { sql: "SELECT 1" },
        },
      },
      "user-admin",
      sid,
    );

    expect(status).toBe(200);
    const result = extractRpcResult(body);
    // Sem MCP_BI_DATABASE_URL → pool null → handler lança Error → pipeline → isError=true.
    // O pipeline usa safeErrorMessage que mascara a mensagem interna (nunca vaza detalhes).
    expect(result?.isError).toBe(true);
    const content = result?.content as Array<{ type: string; text: string }> | undefined;
    expect(content).toBeDefined();
    expect(content!.length).toBeGreaterThan(0);
  });

  it("manager: tools/call bi_consulta_avancada via HTTP retorna erro (gate de role ponta a ponta)", async () => {
    // manager não vê bi_consulta_avancada no catálogo, mas mesmo que tente chamar via HTTP
    // diretamente, o pipeline handleToolCall nega via assertToolAllowed (camada 2).
    const sid = await initializeSession(testServer.baseUrl, "user-manager");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "bi_consulta_avancada",
          arguments: { sql: "SELECT 1" },
        },
      },
      "user-manager",
      sid,
    );

    // O SDK responde 200 com isError=true no MCP (erros de tool não são HTTP 4xx)
    // OU 404 se a tool não estiver registrada nesta sessão (catálogo filtrado).
    // Ambos são comportamentos corretos , o que importa é que manager não executa a tool.
    const result = extractRpcResult(body);
    const isToolError = result?.isError === true;
    const isHttpNotFound = status === 404;
    const isJsonRpcError = !!(body as Record<string, unknown>)?.error;
    expect(isToolError || isHttpNotFound || isJsonRpcError).toBe(true);
  });

  it("viewer (estoque): tools/call tool financeira via HTTP é negado ponta a ponta", async () => {
    const sid = await initializeSession(testServer.baseUrl, "user-viewer");

    const { status, body } = await mcpRequest(
      testServer.baseUrl,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: "financeiro_saldo_contas",
          arguments: {},
        },
      },
      "user-viewer",
      sid,
    );

    // Tool não registrada na sessão → SDK retorna erro JSON-RPC; ou pipeline nega com isError.
    const result = extractRpcResult(body);
    const isToolError = result?.isError === true;
    const isHttpNotFound = status === 404;
    const isJsonRpcError = !!(body as Record<string, unknown>)?.error;
    expect(isToolError || isHttpNotFound || isJsonRpcError).toBe(true);
  });
});

// ─── 6. Pipeline handleToolCall , domínio negado → denied ─────────────────────

describe("handleToolCall , domínio negado retorna denied", () => {
  it("viewer de estoque não pode chamar tool financeira", async () => {
    const finTool = catalogo.find((t) => t.id === "financeiro_saldo_contas");
    expect(finTool).toBeDefined();

    const result = await handleToolCall(
      finTool!,
      {},
      "user-viewer", // só tem domínio estoque
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/denied|acesso negado/i);
  });

  it("manager não pode chamar bi_consulta_avancada (gate de role)", async () => {
    const biTool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(biTool).toBeDefined();

    const result = await handleToolCall(
      biTool!,
      { sql: "SELECT 1" },
      "user-manager",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/denied|acesso negado/i);
  });
});

// ─── 7. Pipeline handleToolCall , input inválido → erro estruturado ───────────

describe("handleToolCall , input inválido retorna erro estruturado", () => {
  it("bi_consulta_avancada com sql vazio retorna isError=true", async () => {
    // bi_consulta_avancada exige sql: z.string().min(1) , string vazia é inválida
    const tool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(tool).toBeDefined();

    const result = await handleToolCall(
      tool!,
      { sql: "" }, // min(1) rejeita string vazia
      "user-super-admin",
    );

    expect(result.isError).toBe(true);
  });

  it("bi_consulta_avancada sem campo 'sql' retorna isError=true", async () => {
    const tool = catalogo.find((t) => t.id === "bi_consulta_avancada");
    expect(tool).toBeDefined();

    const result = await handleToolCall(
      tool!,
      {}, // campo obrigatório ausente
      "user-super-admin",
    );

    expect(result.isError).toBe(true);
  });
});
