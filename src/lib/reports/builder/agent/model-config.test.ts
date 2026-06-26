import {
  obterConfigModeloConstrutor,
  definirConfigModeloConstrutor,
  DEFAULT_BUILDER_PROVIDER,
  DEFAULT_BUILDER_MODEL,
} from "./model-config";

const findUnique = jest.fn();
const upsert = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentSettings: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
});

describe("model-config do construtor", () => {
  it("retorna o default (openai/gpt-5-mini) quando o singleton nao tem config", async () => {
    findUnique.mockResolvedValue(null);
    const c = await obterConfigModeloConstrutor();
    expect(c).toEqual({ provider: DEFAULT_BUILDER_PROVIDER, model: DEFAULT_BUILDER_MODEL });
    expect(DEFAULT_BUILDER_PROVIDER).toBe("openai");
    expect(DEFAULT_BUILDER_MODEL).toBe("gpt-5-mini");
  });

  it("retorna o default quando os campos estao vazios (null)", async () => {
    findUnique.mockResolvedValue({ builderModelProvider: null, builderModelId: null });
    const c = await obterConfigModeloConstrutor();
    expect(c).toEqual({ provider: DEFAULT_BUILDER_PROVIDER, model: DEFAULT_BUILDER_MODEL });
  });

  it("retorna o que esta gravado no singleton quando preenchido", async () => {
    findUnique.mockResolvedValue({
      builderModelProvider: "anthropic",
      builderModelId: "claude-haiku-4-5",
    });
    const c = await obterConfigModeloConstrutor();
    expect(c).toEqual({ provider: "anthropic", model: "claude-haiku-4-5" });
  });

  it("grava provider+model no singleton via upsert (id global)", async () => {
    upsert.mockResolvedValue({});
    await definirConfigModeloConstrutor({ provider: "openai", model: "gpt-5" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as {
      where: { id: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ id: "global" });
    expect(arg.update).toMatchObject({
      builderModelProvider: "openai",
      builderModelId: "gpt-5",
    });
    expect(arg.create).toMatchObject({
      id: "global",
      builderModelProvider: "openai",
      builderModelId: "gpt-5",
    });
  });
});
