import {
  createCredential,
  listCredentials,
  deleteCredential,
  getDecryptedKey,
  CREDENTIAL_IN_USE,
} from "./credentials";

// Mock do prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    llmCredential: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    llmConfig: {
      count: jest.fn(),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace("enc:", "")),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

const { prisma } = jest.requireMock("@/lib/prisma");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createCredential", () => {
  test("cria credencial com label e chave válidas", async () => {
    prisma.llmCredential.findFirst.mockResolvedValue(null); // label não duplicada
    prisma.llmCredential.create.mockResolvedValue({
      id: "uuid-1",
      provider: "openai",
      label: "Minha Chave",
      last4: "1234",
    });

    const result = await createCredential({
      provider: "openai",
      label: "Minha Chave",
      apiKey: "sk-abcdefghij1234",
    });

    expect(result.id).toBe("uuid-1");
    expect(result.last4).toBe("1234");
  });

  test("lança quando label é vazia", async () => {
    await expect(
      createCredential({ provider: "openai", label: "", apiKey: "sk-validkey1234" })
    ).rejects.toThrow(/label/i);
  });

  test("lança quando label tem mais de 60 chars", async () => {
    await expect(
      createCredential({ provider: "openai", label: "a".repeat(61), apiKey: "sk-validkey1234" })
    ).rejects.toThrow(/label/i);
  });

  test("lança quando chave tem menos de 10 chars", async () => {
    await expect(
      createCredential({ provider: "openai", label: "Chave", apiKey: "sk-short" })
    ).rejects.toThrow(/curta/i);
  });

  test("lança quando label já está em uso pelo mesmo provider", async () => {
    prisma.llmCredential.findFirst.mockResolvedValue({ id: "outro-id" }); // duplicata

    await expect(
      createCredential({ provider: "openai", label: "Duplicada", apiKey: "sk-validkey1234" })
    ).rejects.toThrow(/já existe/i);
  });
});

describe("listCredentials", () => {
  test("retorna lista mascarando a chave (expõe last4)", async () => {
    prisma.llmCredential.findMany.mockResolvedValue([
      {
        id: "id-1",
        provider: "anthropic",
        label: "Prod",
        last4: "abcd",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const list = await listCredentials();
    expect(list).toHaveLength(1);
    expect(list[0].last4).toBe("abcd");
    // Não deve expor a chave cifrada
    expect(list[0]).not.toHaveProperty("encryptedApiKey");
  });
});

describe("deleteCredential", () => {
  test("bloqueia exclusão quando credencial está em uso por LlmConfig", async () => {
    prisma.llmConfig.count.mockResolvedValue(1); // em uso

    await expect(deleteCredential("id-1")).rejects.toThrow(CREDENTIAL_IN_USE);
    expect(prisma.llmCredential.delete).not.toHaveBeenCalled();
  });

  test("deleta quando não está em uso", async () => {
    prisma.llmConfig.count.mockResolvedValue(0);
    prisma.llmCredential.delete.mockResolvedValue({});

    await expect(deleteCredential("id-1")).resolves.toBeUndefined();
    expect(prisma.llmCredential.delete).toHaveBeenCalledWith({ where: { id: "id-1" } });
  });
});

describe("getDecryptedKey", () => {
  test("decifra e retorna a chave", async () => {
    prisma.llmCredential.findFirst.mockResolvedValue({
      encryptedApiKey: "enc:sk-secretkey1234",
    });

    const key = await getDecryptedKey("id-1");
    expect(key).toBe("sk-secretkey1234");
  });

  test("retorna null quando credencial não encontrada", async () => {
    prisma.llmCredential.findFirst.mockResolvedValue(null);
    const key = await getDecryptedKey("nao-existe");
    expect(key).toBeNull();
  });
});
