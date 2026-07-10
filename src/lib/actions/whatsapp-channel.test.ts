/**
 * Testes das Server Actions de gerenciamento do canal WhatsApp.
 */

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

const mockGetCurrentUser = jest.fn();
const mockPrismaChannelFindUnique = jest.fn();
const mockPrismaChannelUpsert = jest.fn();
const mockEncrypt = jest.fn((s: string) => `enc:${s}`);
const mockDecrypt = jest.fn((s: string) => s.replace("enc:", ""));
const mockMask = jest.fn((s: string) => `••••${s.slice(-4)}`);
const mockLogAudit = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
jest.mock("@/lib/encryption", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  mask: mockMask,
}));
jest.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappChannel: {
      findUnique: mockPrismaChannelFindUnique,
      upsert: mockPrismaChannelUpsert,
    },
  },
}));

// Trava de número único (SPEC §3.4.1): a ação resolve o telefone real na Graph
// API e valida contra as Conexões por webhook antes de salvar.
const mockFetchDisplayPhoneNumber = jest.fn();
jest.mock("@/lib/whatsapp/cloud-client", () => ({
  fetchDisplayPhoneNumber: mockFetchDisplayPhoneNumber,
}));
const mockVerificarNumeroParaCanalDireto = jest.fn();
jest.mock("@/lib/whatsapp/numero-unico", () => ({
  verificarNumeroParaCanalDireto: mockVerificarNumeroParaCanalDireto,
}));

// ──────────────────────────────────────────────
// Import após mocks
// ──────────────────────────────────────────────

import { getWhatsappChannel, updateWhatsappChannel } from "./whatsapp-channel";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const SUPER_ADMIN = { id: "user-sa", name: "Admin", platformRole: "super_admin", isActive: true };
const REGULAR_USER = { id: "user-r", name: "User", platformRole: "user", isActive: true };

const CHANNEL_ROW = {
  id: "global",
  encryptedApiToken: "enc:real-token-abc",
  businessAccountId: "biz-123",
  phoneNumberId: "phone-456",
  responseMode: "direct",
  enabled: true,
  updatedAt: new Date(),
};

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(SUPER_ADMIN);
  mockPrismaChannelFindUnique.mockResolvedValue(CHANNEL_ROW);
  mockPrismaChannelUpsert.mockResolvedValue({ ...CHANNEL_ROW });
  // Por padrão: a Graph API resolve o número e a trava libera.
  mockFetchDisplayPhoneNumber.mockResolvedValue("+55 61 99563-0029");
  mockVerificarNumeroParaCanalDireto.mockResolvedValue({ ok: true });
});

// ──────────────────────────────────────────────
// getWhatsappChannel
// ──────────────────────────────────────────────

describe("getWhatsappChannel", () => {
  it("retorna dados mascarados para super_admin", async () => {
    const result = await getWhatsappChannel();
    expect(result.success).toBe(true);
    if (result.success) {
      // Token deve estar mascarado (não o valor real)
      expect(result.data.maskedApiToken).toBeDefined();
      expect(result.data.maskedApiToken).not.toBe("real-token-abc");
      expect(result.data.businessAccountId).toBe("biz-123");
      expect(result.data.phoneNumberId).toBe("phone-456");
    }
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await getWhatsappChannel();
    expect(result.success).toBe(false);
  });

  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getWhatsappChannel();
    expect(result.success).toBe(false);
  });

  it("retorna canal vazio quando não existe", async () => {
    mockPrismaChannelFindUnique.mockResolvedValue(null);
    const result = await getWhatsappChannel();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maskedApiToken).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────
// updateWhatsappChannel
// ──────────────────────────────────────────────

describe("updateWhatsappChannel", () => {
  it("cifra o token antes de gravar", async () => {
    await updateWhatsappChannel({
      apiToken: "new-token-xyz",
      businessAccountId: "biz-999",
      phoneNumberId: "phone-999",
      responseMode: "direct",
      enabled: true,
    });

    expect(mockEncrypt).toHaveBeenCalledWith("new-token-xyz");
    expect(mockPrismaChannelUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedApiToken: "enc:new-token-xyz" }),
        update: expect.objectContaining({ encryptedApiToken: "enc:new-token-xyz" }),
      }),
    );
  });

  it("audita a atualização", async () => {
    await updateWhatsappChannel({
      apiToken: "tok",
      businessAccountId: "biz",
      phoneNumberId: "phone",
      responseMode: "direct",
      enabled: true,
    });

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp_channel_updated" }),
    );
  });

  it("retorna erro para usuário sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue(REGULAR_USER);
    const result = await updateWhatsappChannel({
      apiToken: "tok",
      businessAccountId: "biz",
      phoneNumberId: "phone",
      responseMode: "direct",
      enabled: true,
    });
    expect(result.success).toBe(false);
    expect(mockPrismaChannelUpsert).not.toHaveBeenCalled();
  });

  it("retorna sucesso após atualização", async () => {
    const result = await updateWhatsappChannel({
      apiToken: "tok",
      businessAccountId: "biz",
      phoneNumberId: "phone",
      responseMode: "direct",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("não cifra se apiToken não for fornecido (mantém token existente)", async () => {
    await updateWhatsappChannel({
      businessAccountId: "biz",
      phoneNumberId: "phone",
      responseMode: "direct",
      enabled: false,
    });

    expect(mockEncrypt).not.toHaveBeenCalled();
    // O upsert deve ser chamado sem alterar o token cifrado
    expect(mockPrismaChannelUpsert).toHaveBeenCalled();
  });

  it("valida responseMode inválido", async () => {
    const result = await updateWhatsappChannel({
      businessAccountId: "biz",
      phoneNumberId: "phone",
      responseMode: "invalid_mode" as "direct",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// updateWhatsappChannel , trava de número único (SPEC §3.4.1)
// ──────────────────────────────────────────────

describe("updateWhatsappChannel , trava de número único", () => {
  const INPUT = {
    apiToken: "tok",
    businessAccountId: "biz",
    phoneNumberId: "phone-456",
    responseMode: "direct" as const,
    enabled: true,
  };

  it("resolve o display_phone_number e grava o número normalizado", async () => {
    await updateWhatsappChannel(INPUT);

    expect(mockFetchDisplayPhoneNumber).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: "phone-456", apiToken: "tok" }),
    );
    expect(mockPrismaChannelUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ phoneNumber: "+5561995630029" }),
      }),
    );
  });

  it("usa o token já gravado (decifrado) quando apiToken não é fornecido", async () => {
    await updateWhatsappChannel({ ...INPUT, apiToken: undefined });

    expect(mockFetchDisplayPhoneNumber).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: "real-token-abc" }),
    );
  });

  it("fail-closed: se a resolução do número falhar, o canal NÃO é salvo", async () => {
    mockFetchDisplayPhoneNumber.mockRejectedValue(new Error("Graph API caiu"));

    const result = await updateWhatsappChannel(INPUT);
    expect(result.success).toBe(false);
    expect(mockPrismaChannelUpsert).not.toHaveBeenCalled();
  });

  it("fail-closed: sem nenhum token disponível, o canal NÃO é salvo", async () => {
    mockPrismaChannelFindUnique.mockResolvedValue(null);

    const result = await updateWhatsappChannel({ ...INPUT, apiToken: undefined });
    expect(result.success).toBe(false);
    expect(mockPrismaChannelUpsert).not.toHaveBeenCalled();
  });

  it("recusa quando o número pertence a uma Conexão por webhook, com a mensagem da trava", async () => {
    mockVerificarNumeroParaCanalDireto.mockResolvedValue({
      ok: false,
      error:
        "Já existe uma conexão de WhatsApp usando este número (Matrix Group). " +
        "Edite essa conexão ou use outro número.",
    });

    const result = await updateWhatsappChannel(INPUT);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Matrix Group");
    expect(mockPrismaChannelUpsert).not.toHaveBeenCalled();
  });

  it("a trava é consultada com o número resolvido da Graph API", async () => {
    await updateWhatsappChannel(INPUT);
    expect(mockVerificarNumeroParaCanalDireto).toHaveBeenCalledWith("+55 61 99563-0029");
  });
});
