import {
  ARRAY_KEYS_VOCAB,
  ARRAY_KEYS_PRIORITY,
  ARRAY_KEYS_GUARD,
  ARRAY_KEYS_VALOR,
  ARRAY_KEYS_SANITIZE,
  primeiraListaDe,
} from "../array-keys.js";

describe("array-keys , vocabulario e subconjuntos", () => {
  it("o vocabulario contem todas as chaves de todos os subconjuntos", () => {
    const vocab = new Set<string>(ARRAY_KEYS_VOCAB);
    for (const sub of [ARRAY_KEYS_PRIORITY, ARRAY_KEYS_GUARD, ARRAY_KEYS_VALOR, ARRAY_KEYS_SANITIZE]) {
      for (const k of sub) expect(vocab.has(k)).toBe(true);
    }
  });

  it("subconjuntos espelham as listas atuais dos consumidores (caracterizacao)", () => {
    expect([...ARRAY_KEYS_PRIORITY]).toEqual(["linhas", "titulos", "serie", "contas", "top", "familia", "marca"]);
    expect([...ARRAY_KEYS_GUARD]).toEqual(["titulos", "linhas", "serie", "top"]);
    expect([...ARRAY_KEYS_VALOR]).toEqual(["titulos", "linhas", "serie", "top", "topMaiores"]);
    expect([...ARRAY_KEYS_SANITIZE]).toEqual(["linhas", "titulos", "serie", "contas", "top"]);
  });
});

describe("primeiraListaDe", () => {
  it("retorna a 1a chave de prioridade presente com valor array", () => {
    expect(primeiraListaDe({ contas: [1, 2], linhas: [9] })?.key).toBe("linhas"); // linhas tem prioridade
    expect(primeiraListaDe({ contas: [1, 2] })?.key).toBe("contas");
    expect(primeiraListaDe({ serie: [1] })?.arr).toEqual([1]);
  });

  it("null quando nao ha array conhecido", () => {
    expect(primeiraListaDe({ foo: 1 })).toBeNull();
    expect(primeiraListaDe(null)).toBeNull();
    expect(primeiraListaDe(undefined)).toBeNull();
  });
});
