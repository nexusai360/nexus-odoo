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
  identityBase: null,
  personality: "Profissional e direto",
  tone: "Formal",
  guardrails: ["Não discutir dados de outras empresas"],
  terminology: { estoque: "inventário" },
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
  suggestionsEnabled: true,
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
      expect(result.data.personality).toBe("Profissional e direto");
      expect(result.data.guardrails).toHaveLength(1);
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
      kbEnabled: false,
      audioInputEnabled: true,
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
      kbEnabled: true,
      audioInputEnabled: false,
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita personality maior que 500 chars", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);

    const result = await updateAgentSettings({
      personality: "x".repeat(501),
      tone: "",
      guardrails: [],
      terminology: {},
      kbEnabled: true,
      audioInputEnabled: false,
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/personality|personalidade|500|caracteres/i);
    }
  });

  it("rejeita mais de 20 guardrails", async () => {
    getCurrentUser.mockResolvedValue(ADMIN_USER);

    const result = await updateAgentSettings({
      personality: "",
      tone: "",
      guardrails: Array(21).fill("Regra"),
      terminology: {},
      kbEnabled: true,
      audioInputEnabled: false,
      suggestionsEnabled: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("activateLlmConfig", () => {
  it("desativa todos e ativa o escolhido — transacional", async () => {
    getCurrentUser.mockResolvedValue(SUPER_ADMIN_USER);
    prisma.llmConfig.findFirst.mockResolvedValue({ id: "cfg-1", provider: "anthropic" });
    prisma.llmConfig.updateMany.mockResolvedValue({ count: 3 });
    prisma.llmConfig.update.mockResolvedValue({ id: "cfg-1", isActive: true });

    const result = await activateLlmConfig("cfg-1");

    expect(result.success).toBe(true);
    expect(prisma.llmConfig.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
    expect(prisma.llmConfig.update).toHaveBeenCalledWith({
      where: { id: "cfg-1" },
      data: { isActive: true },
    });
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
