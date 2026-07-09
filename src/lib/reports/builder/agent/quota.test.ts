import {
  verificarQuota,
  TETO_TOKENS_PERIODO,
  JANELA_DIAS,
} from "./quota";

const aggregate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { llmUsage: { aggregate: (...a: unknown[]) => aggregate(...a) } },
}));

beforeEach(() => aggregate.mockReset());

describe("quota do construtor", () => {
  it("libera quando o consumo da janela esta abaixo do teto", async () => {
    aggregate.mockResolvedValue({ _sum: { tokensInput: 1000, tokensOutput: 2000 } });
    const r = await verificarQuota("user-1");
    expect(r).toEqual({ ok: true });
  });

  it("bloqueia quando o consumo atinge ou passa o teto", async () => {
    aggregate.mockResolvedValue({
      _sum: { tokensInput: TETO_TOKENS_PERIODO, tokensOutput: 1 },
    });
    const r = await verificarQuota("user-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/teto/i);
  });

  it("trata soma nula (nenhum uso ainda) como zero", async () => {
    aggregate.mockResolvedValue({ _sum: { tokensInput: null, tokensOutput: null } });
    const r = await verificarQuota("user-1");
    expect(r).toEqual({ ok: true });
  });

  it("filtra por origin=construtor e pela janela em dias", async () => {
    aggregate.mockResolvedValue({ _sum: { tokensInput: 0, tokensOutput: 0 } });
    await verificarQuota("user-1");
    const arg = aggregate.mock.calls[0][0] as {
      where: { origin: string; createdAt: { gte: Date } };
    };
    expect(arg.where.origin).toBe("construtor");
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(JANELA_DIAS).toBeGreaterThan(0);
  });
});
