import { salvarModeloConstrutor } from "./builder-config";

const requireSuperAdmin = jest.fn();
const definirConfigModeloConstrutor = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("./_helpers", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
}));
jest.mock("@/lib/reports/builder/agent/model-config", () => ({
  definirConfigModeloConstrutor: (...a: unknown[]) => definirConfigModeloConstrutor(...a),
}));

beforeEach(() => {
  requireSuperAdmin.mockReset();
  definirConfigModeloConstrutor.mockReset();
});

describe("salvarModeloConstrutor", () => {
  it("nega quem nao e super_admin e nao grava", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("Acesso negado"));
    const r = await salvarModeloConstrutor({ provider: "openai", model: "gpt-5" });
    expect(r.ok).toBe(false);
    expect(definirConfigModeloConstrutor).not.toHaveBeenCalled();
  });

  it("recusa provider/model vazios", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "u1", platformRole: "super_admin" });
    const r = await salvarModeloConstrutor({ provider: "", model: "" });
    expect(r.ok).toBe(false);
    expect(definirConfigModeloConstrutor).not.toHaveBeenCalled();
  });

  it("grava provider+model+credencial quando super_admin", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "u1", platformRole: "super_admin" });
    definirConfigModeloConstrutor.mockResolvedValue(undefined);
    const r = await salvarModeloConstrutor({
      provider: "openai",
      model: "gpt-5-mini",
      credentialId: "cred-1",
    });
    expect(r.ok).toBe(true);
    expect(definirConfigModeloConstrutor).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-5-mini",
      credentialId: "cred-1",
    });
  });
});
