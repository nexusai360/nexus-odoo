// Onda M (Arquitetura 3.0) M.5 , testes do resumo progressivo (parte pura).
import {
  RESUMO_THRESHOLD_NOVAS_MSGS,
  deveResumir,
  extrairDominioDoDigest,
  montarPromptResumo,
  podeInjetarResumo,
} from "./resumo-progressivo";

describe("deveResumir", () => {
  test("abaixo do threshold nao resume; no threshold resume", () => {
    expect(deveResumir(RESUMO_THRESHOLD_NOVAS_MSGS - 1)).toBe(false);
    expect(deveResumir(RESUMO_THRESHOLD_NOVAS_MSGS)).toBe(true);
    expect(deveResumir(RESUMO_THRESHOLD_NOVAS_MSGS + 5)).toBe(true);
  });
});

describe("extrairDominioDoDigest", () => {
  test("extrai o dominio do formato canonico do toolDigest", () => {
    expect(
      extrairDominioDoDigest(
        "[fiscal_faturamento_periodo] dominio=fiscal args: periodoDe=2026-06-01; numeros: total=9737728.54",
      ),
    ).toBe("fiscal");
  });

  test("digest sem dominio -> null", () => {
    expect(extrairDominioDoDigest("texto qualquer sem marcador")).toBeNull();
  });
});

describe("montarPromptResumo", () => {
  const mensagens = [
    { role: "user", content: "faturamento de junho?" },
    {
      role: "assistant",
      content: "O faturamento de junho foi R$ 9.737.728,54.",
      toolDigest:
        "[fiscal_faturamento_periodo] dominio=fiscal numeros: total=9737728.54",
    },
    { role: "user", content: "e o estoque da esteira?" },
    {
      role: "assistant",
      content: "611 unidades, R$ 6.778.839,44.",
      toolDigest: "[estoque_saldo_produto] dominio=estoque numeros: qtd=611",
    },
  ];

  test("transcript contem perguntas, respostas e digests; system exige numeros exatos com proveniencia", () => {
    const p = montarPromptResumo(mensagens);
    expect(p.system).toMatch(/n[uú]meros?/i);
    expect(p.system).toMatch(/proveni[eê]ncia|fonte/i);
    expect(p.user).toContain("faturamento de junho?");
    expect(p.user).toContain("9.737.728,54");
    expect(p.user).toContain("[consultas: [estoque_saldo_produto]");
  });

  test("mensagens longas sao capadas, digest preservado", () => {
    const p = montarPromptResumo([
      { role: "assistant", content: "x".repeat(2000), toolDigest: "[t] dominio=fiscal d" },
    ]);
    expect(p.user.length).toBeLessThan(1200);
    expect(p.user).toContain("[t] dominio=fiscal d");
  });
});

describe("podeInjetarResumo (RBAC lazy)", () => {
  test("super_admin ('all') sempre pode", () => {
    expect(podeInjetarResumo(["fiscal", "estoque"], "all")).toBe(true);
  });

  test("usuario com todos os dominios do resumo pode", () => {
    expect(
      podeInjetarResumo(["fiscal", "estoque"], new Set(["fiscal", "estoque", "comercial"])),
    ).toBe(true);
  });

  test("dominio revogado -> nao injeta (re-resumir antes)", () => {
    expect(podeInjetarResumo(["fiscal", "estoque"], new Set(["fiscal"]))).toBe(false);
  });

  test("resumo sem dominios (so prosa) pode sempre", () => {
    expect(podeInjetarResumo([], new Set())).toBe(true);
  });
});
