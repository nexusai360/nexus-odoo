import { applyIntentArgs, EXAUSTIVA_LIMIT, AMOSTRAGEM_LIMIT } from "../apply-intent-args";

const suportaTudo = { limit: true, orderBy: true };
const semOrderBy = { limit: true, orderBy: false };

describe("applyIntentArgs", () => {
  it("exaustiva: capa limit em EXAUSTIVA_LIMIT (vence o do LLM se maior)", () => {
    const r = applyIntentArgs("exaustiva", { limit: 1000 }, suportaTudo);
    expect(r.args.limit).toBe(EXAUSTIVA_LIMIT);
    expect(r.degradou).toBe(false);
  });

  it("exaustiva: aplica limit mesmo quando o LLM nao mandou", () => {
    const r = applyIntentArgs("exaustiva", {}, suportaTudo);
    expect(r.args.limit).toBe(EXAUSTIVA_LIMIT);
  });

  it("exaustiva: limit menor do LLM e preservado (nao aumenta)", () => {
    const r = applyIntentArgs("exaustiva", { limit: 10 }, suportaTudo);
    expect(r.args.limit).toBe(10);
  });

  it("amostragem: limit dentro de [3,5]", () => {
    const r = applyIntentArgs("amostragem", {}, suportaTudo);
    expect(r.args.limit).toBe(AMOSTRAGEM_LIMIT);
  });

  it("ranking: preserva orderBy do LLM quando a tool suporta", () => {
    const r = applyIntentArgs("ranking", { orderBy: "valor" }, suportaTudo);
    expect(r.args.orderBy).toBe("valor");
    expect(r.degradou).toBe(false);
  });

  it("ranking: tool sem orderBy => degrada para pontual com aviso", () => {
    const r = applyIntentArgs("ranking", { limit: 5 }, semOrderBy);
    expect(r.degradou).toBe(true);
    expect(r.aviso).toMatch(/orderBy|ranking|pontual/i);
  });

  it("pontual: nao mexe nos args do LLM", () => {
    const r = applyIntentArgs("pontual", { limit: 7, foo: "bar" }, suportaTudo);
    expect(r.args).toEqual({ limit: 7, foo: "bar" });
    expect(r.degradou).toBe(false);
  });

  it("nao injeta limit quando a tool nao suporta limit", () => {
    const r = applyIntentArgs("exaustiva", {}, { limit: false, orderBy: false });
    expect(r.args.limit).toBeUndefined();
  });
});
