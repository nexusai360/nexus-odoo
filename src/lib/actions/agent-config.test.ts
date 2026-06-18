/**
 * Testes para as server actions de configuração do agente.
 * TDD: testes escritos antes da implementação (Task 3.0a).
 */

// Mocks de dependências server-only
jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    llmConfig: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { getCurrentUser } = jest.requireMock("@/lib/auth");

import {
  getAgentSettings,
  updateAgentSettings,
  activateLlmConfig,
  getPublicAgentFlags,
  updateAgentAvailability,
} from "./agent-config";

const ADMIN_USER = {
  id: "user-admin",
  platformRole: "admin",
  name: "Admin",
  email: "admin@test.com",
};

const SUPER_ADMIN_USER = {
  id: "user-super",
  platformRole: "super_admin",
  name: "Super",
  email: "super@test.com",
};

const VIEWER_USER = {
  id: "user-viewer",
  platformRole: "viewer",
  name: "Viewer",
  email: "viewer@test.com",
};

const MOCK_SETTINGS = {
  id: "global",
  identityBase: "Identidade base existente",
  personality: "Profissional e direto",
  tone: "Formal",
  guardrails: ["Não discutir dados de outras empresas"],
  terminology: { estoque: "inventário" },
  advancedOverride: null,
  suggestionsEnabled: true,
  bubbleAccessLevel: "viewer",
  whatsappAccessLevel: "viewer",
  audioCheckpoint: "OFF",
  imageCheckpoint: "OFF",
  kbCheckpoint: "PRODUCTION",
  audioProvider: null,
  audioModel: null,
  imageProvider: null,
  imageModel: null,
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAgentSettings", () => {
  it("retorna settings existentes para admin", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    prisma.agentSettings.findUnique.mockResolvedValue(MOCK_SETTINGS);

    const result = await getAgentSettings();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data!.personality).toBe("Profissional e direto");
      expect(result.data!.guardrails).toHaveLength(1);
    }
  });

  it("retorna settings padrão quando não existe (upsert)", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    prisma.agentSettings.findUnique.mockResolvedValue(null);
    prisma.agentSettings.upsert.mockResolvedValue({
      ...MOCK_SETTINGS,
      personality: "",
      tone: "",
      guardrails: [],
    });

    const result = await getAgentSettings();

    expect(result.success).toBe(true);
  });

  // Auto-reparo foi removido/refatorado; mantido como referencia historica.
  it.skip("auto-repara singleton antigo criado vazio", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    // Instalação antiga: singleton existe mas com campos em branco.
    prisma.agentSettings.findUnique.mockResolvedValue({
      ...MOCK_SETTINGS,
      identityBase: null,
      personality: "",
      tone: "",
      guardrails: [],
    });
    prisma.agentSettings.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...MOCK_SETTINGS,
        ...data,
      }),
    );

    const result = await getAgentSettings();

    expect(result.success).toBe(true);
    // O reparo preenche apenas os campos vazios.
    expect(prisma.agentSettings.update).toHaveBeenCalledTimes(1);
    if (result.success) {
      expect(result.data!.identityBase).toBeTruthy();
      expect(result.data!.personality.length).toBeGreaterThan(0);
      expect(result.data!.tone.length).toBeGreaterThan(0);
      expect(result.data!.guardrails.length).toBeGreaterThan(0);
    }
  });

  it("não repara singleton já preenchido", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    prisma.agentSettings.findUnique.mockResolvedValue(MOCK_SETTINGS);

    await getAgentSettings();

    expect(prisma.agentSettings.update).not.toHaveBeenCalled();
  });

  it("nega acesso a viewer", async () => {
    getCurrentUser.mockResolvedValue(VIEWER_USER);

    const result = await getAgentSettings();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/acesso|permissão/i);
    }
  });

  it("retorna erro quando não autenticado", async () => {
    getCurrentUser.mockResolvedValue(null);

    const result = await getAgentSettings();

    expect(result.success).toBe(false);
  });
});

describe("updateAgentSettings", () => {
  it("atualiza settings e audita para super_admin", async () => {
    getCurrentUser.mockResolvedValue(SUPER_ADMIN_USER);
    prisma.agentSettings.upsert.mockResolvedValue(MOCK_SETTINGS);

    const { logAudit } = jest.requireMock("@/lib/audit");
    const { revalidatePath } = jest.requireMock("next/cache");

    const result = await updateAgentSettings({
      personality: "Novo tom",
      tone: "Informal",
      guardrails: ["Regra 1"],
      terminology: {},
      suggestionsEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent_settings_updated" }),
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("nega acesso a manager", async () => {
    getCurrentUser.mockResolvedValue({ ...VIEWER_USER, platformRole: "manager" });

    const result = await updateAgentSettings({
      personality: "",
      tone: "",
      guardrails: [],
      terminology: {},
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita personality maior que 1000 chars", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);

    const result = await updateAgentSettings({
      personality: "x".repeat(1001),
      tone: "",
      guardrails: [],
      terminology: {},
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/personality|comportamento|1000|caracteres/i);
    }
  });

  it("aceita guardrails ilimitados (sem teto de quantidade)", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    prisma.agentSettings.upsert.mockResolvedValue(MOCK_SETTINGS);

    const result = await updateAgentSettings({
      personality: "",
      tone: "",
      guardrails: Array(40).fill("Regra"),
      terminology: {},
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita guardrail maior que 500 chars", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);

    const result = await updateAgentSettings({
      personality: "",
      tone: "",
      guardrails: ["x".repeat(501)],
      terminology: {},
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("getPublicAgentFlags , niveis de canal (F5 C.1)", () => {
  it("retorna bubbleAccessLevel e whatsappAccessLevel lidos do settings", async () => {
    getCurrentUser.mockResolvedValue(VIEWER_USER);
    prisma.agentSettings.findUnique.mockResolvedValue({
      audioCheckpoint: "OFF",
      imageCheckpoint: "OFF",
      feedbackCheckpoint: "OFF",
      kbCheckpoint: "PRODUCTION",
      suggestionsCheckpoint: "PRODUCTION",
      bubbleAccessLevel: "manager",
      whatsappAccessLevel: "off",
      maxSuggestions: 3,
    });

    const flags = await getPublicAgentFlags();

    expect(flags.bubbleAccessLevel).toBe("manager");
    expect(flags.whatsappAccessLevel).toBe("off");
  });

  it("usa default viewer/viewer quando nao ha settings", async () => {
    getCurrentUser.mockResolvedValue(VIEWER_USER);
    prisma.agentSettings.findUnique.mockResolvedValue(null);

    const flags = await getPublicAgentFlags();

    expect(flags.bubbleAccessLevel).toBe("viewer");
    expect(flags.whatsappAccessLevel).toBe("viewer");
  });
});

describe("updateAgentAvailability , niveis por canal (F5 C.2)", () => {
  it("grava bubbleAccessLevel e whatsappAccessLevel via upsert", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);
    prisma.agentSettings.upsert.mockResolvedValue({});

    const result = await updateAgentAvailability({
      bubbleAccessLevel: "manager",
      whatsappAccessLevel: "off",
    });

    expect(result.success).toBe(true);
    const arg = prisma.agentSettings.upsert.mock.calls[0][0];
    expect(arg.update.bubbleAccessLevel).toBe("manager");
    expect(arg.update.whatsappAccessLevel).toBe("off");
    expect(arg.create.bubbleAccessLevel).toBe("manager");
    expect(arg.create.whatsappAccessLevel).toBe("off");
  });

  it("nega acesso a viewer", async () => {
    getCurrentUser.mockResolvedValue(VIEWER_USER);

    const result = await updateAgentAvailability({
      bubbleAccessLevel: "viewer",
      whatsappAccessLevel: "viewer",
    });

    expect(result.success).toBe(false);
  });
});

describe("activateLlmConfig", () => {
  it("desativa todos e ativa o escolhido , transacional", async () => {
    getCurrentUser.mockResolvedValue(SUPER_ADMIN_USER);
    prisma.llmConfig.findFirst.mockResolvedValue({ id: "cfg-1", provider: "anthropic" });
    prisma.llmConfig.updateMany.mockResolvedValue({ count: 3 });
    prisma.llmConfig.update.mockResolvedValue({
      id: "cfg-1",
      isActive: true,
      model: "claude-haiku-4-5",
      provider: "anthropic",
    });
    // Onda 7: activateLlmConfig agora chama reconcileReasoningEffort que
    // consulta agentSettings.findUnique. Mockar para evitar crash.
    prisma.agentSettings.findUnique.mockResolvedValue({
      reasoningEffort: "medium",
      reasoningCheckpoint: "PRODUCTION",
    });
    prisma.agentSettings.update.mockResolvedValue({});

    const result = await activateLlmConfig("cfg-1");

    expect(result.success).toBe(true);
    expect(prisma.llmConfig.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
    expect(prisma.llmConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cfg-1" },
        data: { isActive: true },
      }),
    );
  });

  it("retorna erro quando config não existe", async () => {
    getCurrentUser.mockResolvedValue(SUPER_ADMIN_USER);
    prisma.llmConfig.findFirst.mockResolvedValue(null);

    const result = await activateLlmConfig("cfg-inexistente");

    expect(result.success).toBe(false);
  });

  it("nega acesso a manager", async () => {
    getCurrentUser.mockResolvedValue({ ...VIEWER_USER, platformRole: "manager" });

    const result = await activateLlmConfig("cfg-1");

    expect(result.success).toBe(false);
  });
});
