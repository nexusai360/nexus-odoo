import { resolveReformLlm } from "./get-reform-config";

jest.mock("@/lib/agent/llm/credentials", () => ({
  getDecryptedKey: jest.fn(),
}));
jest.mock("@/lib/agent/llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

const { getDecryptedKey } = jest.requireMock("@/lib/agent/llm/credentials");
const { getActiveLlmConfig } = jest.requireMock("@/lib/agent/llm/get-active-config");

beforeEach(() => jest.clearAllMocks());

describe("resolveReformLlm", () => {
  test("usa config dedicada quando provider+model+credencial setados", async () => {
    getDecryptedKey.mockResolvedValue("sk-reform");
    const r = await resolveReformLlm({
      routerReformProvider: "openai",
      routerReformModel: "gpt-5.4-nano",
      routerReformCredentialId: "cred-1",
    });
    expect(r).toEqual({ provider: "openai", model: "gpt-5.4-nano", apiKey: "sk-reform", credentialId: "cred-1" });
    expect(getActiveLlmConfig).not.toHaveBeenCalled();
  });

  test("fallback para LLM ativo quando config dedicada ausente", async () => {
    getActiveLlmConfig.mockResolvedValue({ provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-active", credentialId: "cred-active" });
    const r = await resolveReformLlm({
      routerReformProvider: null,
      routerReformModel: null,
      routerReformCredentialId: null,
    });
    expect(r).toEqual({ provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-active", credentialId: "cred-active" });
  });

  test("credencial dedicada sem chave -> cai no ativo", async () => {
    getDecryptedKey.mockResolvedValue(null);
    getActiveLlmConfig.mockResolvedValue({ provider: "openai", model: "m", apiKey: "k" });
    const r = await resolveReformLlm({
      routerReformProvider: "openai",
      routerReformModel: "x",
      routerReformCredentialId: "cred-x",
    });
    expect(r?.apiKey).toBe("k");
  });

  test("nada disponível -> null", async () => {
    getActiveLlmConfig.mockResolvedValue(null);
    const r = await resolveReformLlm({ routerReformProvider: null, routerReformModel: null, routerReformCredentialId: null });
    expect(r).toBeNull();
  });
});
