import { describe, expect, it } from "@jest/globals";
import {
  DOMAINS,
  KNOWN_DOMAINS,
  SAUDACOES_STOP_LIST,
  computeVocabularyHash,
  getVocabularyVersion,
} from "../domain-vocabulary";

describe("domain-vocabulary: estrutura", () => {
  it("define exatamente 9 dominios", () => {
    expect(DOMAINS).toHaveLength(9);
  });

  it("cobre todos os dominios esperados", () => {
    const names = DOMAINS.map((d) => d.domain).sort();
    expect(names).toEqual(
      [
        "cadastros",
        "caminho3",
        "comercial",
        "contabil",
        "crm",
        "dominios-vazios",
        "estoque",
        "financeiro",
        "fiscal",
      ].sort(),
    );
  });

  it("KNOWN_DOMAINS bate com DOMAINS", () => {
    expect(KNOWN_DOMAINS.size).toBe(DOMAINS.length);
    DOMAINS.forEach((d) => {
      expect(KNOWN_DOMAINS.has(d.domain)).toBe(true);
    });
  });

  it("toda descricao tem pelo menos 50 chars (prosa real, nao stub)", () => {
    DOMAINS.forEach((d) => {
      expect(d.description.length).toBeGreaterThanOrEqual(50);
    });
  });

  it("toda entrada tem pelo menos 1 exemplo", () => {
    DOMAINS.forEach((d) => {
      expect(d.examples.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("domain-vocabulary: excludeFromFiltering", () => {
  it("caminho3 marcado como escape hatch", () => {
    const caminho3 = DOMAINS.find((d) => d.domain === "caminho3");
    expect(caminho3?.excludeFromFiltering).toBe(true);
  });

  it("dominios-vazios marcado como escape hatch", () => {
    const dv = DOMAINS.find((d) => d.domain === "dominios-vazios");
    expect(dv?.excludeFromFiltering).toBe(true);
  });

  it("outros dominios NAO sao escape hatch", () => {
    const others = DOMAINS.filter(
      (d) => !["caminho3", "dominios-vazios"].includes(d.domain),
    );
    others.forEach((d) => {
      expect(d.excludeFromFiltering ?? false).toBe(false);
    });
  });
});

describe("domain-vocabulary: forceIncludeOn", () => {
  it("cadastros tem regex para CNPJ", () => {
    const cad = DOMAINS.find((d) => d.domain === "cadastros");
    expect(cad?.forceIncludeOn).toBeDefined();
    expect(cad!.forceIncludeOn!.some((r) => r.test("informa CNPJ 12.345"))).toBe(
      true,
    );
  });

  it("regex usa \\b para evitar falso positivo (cnpj nao casa em 'racnpjao')", () => {
    const cad = DOMAINS.find((d) => d.domain === "cadastros")!;
    const matchesFalsePositive = cad.forceIncludeOn!.some((r) =>
      r.test("racnpjao"),
    );
    expect(matchesFalsePositive).toBe(false);
  });
});

describe("domain-vocabulary: SAUDACOES_STOP_LIST", () => {
  it("contem saudacoes basicas", () => {
    ["oi", "ola", "bom dia", "obrigado", "ok"].forEach((s) => {
      expect(SAUDACOES_STOP_LIST).toContain(s);
    });
  });
});

describe("domain-vocabulary: hash de versao", () => {
  it("computeVocabularyHash() retorna 8 hex chars", () => {
    expect(computeVocabularyHash()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("hash e estavel entre chamadas", () => {
    expect(computeVocabularyHash()).toBe(computeVocabularyHash());
  });

  it("getVocabularyVersion() cacheia", () => {
    const v1 = getVocabularyVersion();
    const v2 = getVocabularyVersion();
    expect(v1).toBe(v2);
    expect(v1).toBe(computeVocabularyHash());
  });
});
