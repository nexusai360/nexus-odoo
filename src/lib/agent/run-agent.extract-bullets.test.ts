/**
 * Tests para extractBulletQuestions + extractSuggestions integracao.
 *
 * Cobertura:
 * 1. Bullets-perguntas trailing apos "?" sao extraidos como chips.
 * 2. Bullets de dados (sem "?" precedente) NAO sao extraidos.
 * 3. Cap de 7 bullets respeitado.
 * 4. Quando [[suggestions]] esta presente, bullet extraction nao acontece.
 * 5. Sanitizacao de markdown.
 * 6. Bullets enumerados (1. 2. 3.) tambem capturados.
 */

// Importa do modulo puro (sem prisma) para o jest nao quebrar com
// import.meta do prisma client generated.
import {
  extractBulletQuestions,
  extractSuggestions,
} from "./suggestions-extractor";

describe("extractBulletQuestions", () => {
  it("extrai bullets apos pergunta '?' no final do texto", () => {
    const text = `Em 05/2026 ha muitas notas registradas.

Para listar certinho, qual visao voce precisa?
- Somente autorizadas
- Todas (autorizadas + em digitacao + rejeitadas + inutilizadas)`;
    const result = extractBulletQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.bullets).toEqual([
      "Somente autorizadas",
      "Todas (autorizadas + em digitacao + rejeitadas + inutilizadas)",
    ]);
    expect(result?.message).toContain("qual visao voce precisa?");
    expect(result?.message).not.toContain("Somente autorizadas");
  });

  it("NAO extrai quando nao ha '?' precedente (bullets de dados)", () => {
    const text = `Produtos com estoque alto:
- Esteira Premium 9000: 52 unidades
- Bicicleta Indoor X1: 41 unidades
- Halteres 10kg: 38 unidades`;
    const result = extractBulletQuestions(text);
    expect(result).toBeNull();
  });

  it("respeita cap de 7 bullets (descarta 8+)", () => {
    const text = `Qual voce quer?
- Opcao 1
- Opcao 2
- Opcao 3
- Opcao 4
- Opcao 5
- Opcao 6
- Opcao 7
- Opcao 8
- Opcao 9`;
    const result = extractBulletQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.bullets.length).toBe(7);
    // Verifica que o primeiro bullet eh "Opcao 3" (pois pegou os ULTIMOS 7).
    expect(result?.bullets[0]).toBe("Opcao 3");
    expect(result?.bullets[6]).toBe("Opcao 9");
  });

  it("retorna null com apenas 1 bullet (precisa >= 2)", () => {
    const text = `Qual voce quer?
- Somente autorizadas`;
    const result = extractBulletQuestions(text);
    expect(result).toBeNull();
  });

  it("captura bullets enumerados (1. 2.)", () => {
    const text = `Voce quer qual opcao?
1. Trazer todas
2. Apenas autorizadas
3. Apenas rejeitadas`;
    const result = extractBulletQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.bullets).toEqual([
      "Trazer todas",
      "Apenas autorizadas",
      "Apenas rejeitadas",
    ]);
  });

  it("sanitiza markdown (** e crases)", () => {
    const text = `Qual voce quer?
- **Somente autorizadas**
- \`Todas as situacoes\``;
    const result = extractBulletQuestions(text);
    expect(result?.bullets).toEqual([
      "Somente autorizadas",
      "Todas as situacoes",
    ]);
  });
});

describe("extractSuggestions integracao com bullet extraction", () => {
  it("usa [[suggestions]] quando presente (ignora bullets no corpo)", () => {
    const text = `Em 05/2026 ha muitas notas.
Qual visao voce quer?
- Somente autorizadas
- Todas

[[suggestions]]:Veja autorizadas|Veja todas`;
    const result = extractSuggestions(text, 3);
    expect(result.suggestions).toEqual(["Veja autorizadas", "Veja todas"]);
    // Os bullets do corpo continuam no message (canal explicito venceu).
    expect(result.message).toContain("Somente autorizadas");
  });

  it("promove bullet-perguntas a chips quando [[suggestions]] ausente", () => {
    const text = `Em 05/2026 ha muitas notas.
Para te listar certinho, qual visao voce precisa?
- Somente autorizadas
- Todas (autorizadas + em digitacao + rejeitadas)`;
    const result = extractSuggestions(text, 3);
    expect(result.suggestions).toEqual([
      "Somente autorizadas",
      "Todas (autorizadas + em digitacao + rejeitadas)",
    ]);
    expect(result.message).not.toContain("- Somente autorizadas");
    expect(result.message).toContain("qual visao voce precisa?");
  });

  it("fallback generico quando nao ha bullets-perguntas E nao ha [[suggestions]]", () => {
    const text = "Faturamento em 05/2026: R$ 35.421.925,20.";
    const result = extractSuggestions(text, 3);
    expect(result.suggestions.length).toBe(3);
    // Fallback contem perguntas conhecidas (definidas em FALLBACK_SUGGESTIONS).
    expect(result.suggestions[0]).toMatch(/Detalhe|Qual|Compare|Quais/);
  });
});
