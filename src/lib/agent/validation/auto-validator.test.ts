import { describe, it, expect } from "@jest/globals";
import {
  validateResponse,
  extrairNumeros,
  type ToolResultLike,
} from "./auto-validator";

// Helper para montar tool result envelope-style.
function trEnvelope(
  toolName: string,
  destaque?: Record<string, string | number>,
  linhas: unknown[] = [],
  topPorParticipante?: Array<{ nome: string; soma: number; n: number }>,
): ToolResultLike {
  return {
    toolName,
    dados: {
      _RESPOSTA: destaque ? "ok" : undefined,
      _DESTAQUE: destaque,
      _agregado: destaque ? { soma: Number(destaque.total ?? 0) } : undefined,
      topPorParticipante,
      titulos: linhas,
      linhas,
    },
  };
}

describe("extrairNumeros", () => {
  it("pega valor monetario BR", () => {
    const ns = extrairNumeros("Total R$ 1.234.567,89 em titulos.");
    expect(ns).toHaveLength(1);
    expect(ns[0]?.valor).toBeCloseTo(1234567.89);
    expect(ns[0]?.tipo).toBe("moeda");
  });

  it("pega contagens com unidade", () => {
    const ns = extrairNumeros("519 pedidos abertos e 68 notas.");
    expect(ns.map((n) => n.valor).sort((a, b) => a - b)).toEqual([68, 519]);
  });

  it("ignora numeros pequenos sem unidade", () => {
    const ns = extrairNumeros("Top 3 produtos.");
    expect(ns).toHaveLength(0);
  });

  it("dedup numeros repetidos", () => {
    const ns = extrairNumeros("R$ 100,00 e R$ 100,00 de novo");
    expect(ns).toHaveLength(1);
  });
});

describe("validateV1 (anti-truncamento)", () => {
  it("dispara quando 'veio truncado' e tool tem _DESTAQUE", () => {
    const out = validateResponse({
      question: "Total a pagar",
      llmResponse: "A lista veio truncada, nao posso fechar o total.",
      toolResults: [trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 1000 })],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V1");
  });

  it("NAO dispara quando nao ha _DESTAQUE/_agregado", () => {
    const out = validateResponse({
      question: "Total a pagar",
      llmResponse: "A lista veio truncada.",
      toolResults: [{ toolName: "x", dados: { linhas: [] } }],
    });
    expect(out.ok).toBe(true);
  });

  it("NAO dispara quando resposta nao tem termo de truncamento", () => {
    const out = validateResponse({
      question: "Total",
      llmResponse: "Total: R$ 1.000,00.",
      toolResults: [trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 1000 })],
    });
    expect(out.ok).toBe(true);
  });

  it("captura 'retorno veio incompleto'", () => {
    const out = validateResponse({
      question: "Quanto temos a receber?",
      llmResponse: "O retorno veio incompleto.",
      toolResults: [trEnvelope("financeiro_contas_a_receber", { totalAReceber: 500 })],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V1");
  });
});

describe("validateV2 (anti-invencao)", () => {
  it("aceita valor presente em _DESTAQUE", () => {
    const out = validateResponse({
      question: "Total",
      llmResponse: "Total: R$ 1.000,00 em 5 titulos.",
      toolResults: [
        trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 1000, contagem: 5 }),
      ],
    });
    expect(out.ok).toBe(true);
  });

  it("dispara quando cita valor inexistente", () => {
    const out = validateResponse({
      question: "Quantos pedidos abertos?",
      llmResponse: "Temos 519 pedidos abertos.",
      toolResults: [
        {
          toolName: "comercial_pedidos_por_etapa",
          dados: {
            _DESTAQUE: { totalAtuais: 526 },
            linhas: [
              { etapa: "A", n: 100 },
              { etapa: "B", n: 200 },
              { etapa: "C", n: 226 },
            ],
          },
        },
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V2");
  });

  it("aceita soma das linhas (calculo canonico)", () => {
    const calcs = [
      {
        nome: "soma_vrSaldo",
        computar: (linhas: unknown[]) =>
          (linhas as Array<{ vrSaldo: number }>).reduce(
            (s, r) => s + Number(r.vrSaldo ?? 0),
            0,
          ),
      },
    ];
    const out = validateResponse({
      question: "Quanto a Smartfit deve?",
      llmResponse: "Smartfit deve R$ 678.704,00.",
      toolResults: [
        {
          toolName: "financeiro_contas_a_receber",
          calcsCanonicos: calcs,
          dados: {
            titulos: [
              { vrSaldo: 387500 },
              { vrSaldo: 145602 },
              { vrSaldo: 145602 },
              { vrSaldo: 0 },
            ],
          },
        },
      ],
    });
    // 387500+145602+145602+0 = 678704 -> bate, V2 nao dispara
    expect(out.ok).toBe(true);
  });

  it("aceita numero mencionado na pergunta original", () => {
    const out = validateResponse({
      question: "Top 10 produtos",
      llmResponse: "Aqui estao os 10 produtos.",
      toolResults: [{ toolName: "estoque_top_movimentados", dados: { linhas: [] } }],
    });
    expect(out.ok).toBe(true);
  });
});

describe("validateV3 (anti-recusa indevida)", () => {
  it("dispara quando resposta inicia com 'Nao consegui' e ha _DESTAQUE", () => {
    const out = validateResponse({
      question: "Quanto tem em estoque do halter?",
      llmResponse: "Nao consegui obter esse dado.",
      toolResults: [trEnvelope("estoque_saldo_produto", { totalProdutos: 50, valorTotal: 184706 })],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V3");
  });

  it("NAO dispara quando pergunta menciona termo fora-escopo (meta)", () => {
    const out = validateResponse({
      question: "Vai bater a meta esse mes?",
      llmResponse: "Nao consegui obter, essa metrica nao esta no ERP.",
      toolResults: [trEnvelope("registrar_lacuna", { respostaSugerida: "sem tool" })],
    });
    expect(out.ok).toBe(true);
  });

  it("NAO dispara quando pergunta menciona 'margem'", () => {
    const out = validateResponse({
      question: "Top 5 produtos por margem",
      llmResponse: "Nao consegui obter esse dado.",
      toolResults: [trEnvelope("registrar_lacuna", { respostaSugerida: "x" })],
    });
    expect(out.ok).toBe(true);
  });
});

describe("validateV4 (anti-placeholder em bullet)", () => {
  it("dispara quando ha bullet com 'nao consegui obter esse dado'", () => {
    const llm = `Devedores principais:
- Smartfit , R$ 387.500,00
- Vale dos Passaros , nao consegui obter esse dado
- Jds , R$ 322.236,75`;
    const out = validateResponse({
      question: "Devedores principais",
      llmResponse: llm,
      toolResults: [trEnvelope("financeiro_contas_a_receber", { totalAReceber: 1000 })],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V4");
  });

  it("NAO dispara quando 'nao consegui obter' nao esta em bullet", () => {
    const out = validateResponse({
      question: "Total a pagar",
      llmResponse: "Tudo bem, total R$ 100,00.",
      toolResults: [trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 100 })],
    });
    expect(out.ok).toBe(true);
  });
});

describe("flags individuais", () => {
  it("v1Enabled=false desliga V1", () => {
    const out = validateResponse(
      {
        question: "Total",
        llmResponse: "Veio truncado.",
        toolResults: [
          trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 1000 }),
        ],
      },
      { v1Enabled: false },
    );
    expect(out.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bateria contra casos reais do laudo R11-R16 (fixtures sinteticas).
// ---------------------------------------------------------------------------

describe("casos reais do laudo R11-R16", () => {
  it("[R16] 'Quantos pedidos abertos?' (dado_inventado: 519 vs 526)", () => {
    const out = validateResponse({
      question: "Quantos pedidos abertos temos?",
      llmResponse:
        "Considerando as etapas nao finalizadas e excluindo os cancelados, temos 519 pedidos abertos.",
      toolResults: [
        {
          toolName: "comercial_pedidos_por_etapa",
          dados: {
            _DESTAQUE: { totalEtapasNaoFinalizadas: 526 },
            linhas: [
              { etapa: "A", n: 100 },
              { etapa: "B", n: 200 },
              { etapa: "C", n: 226 },
              { etapa: "Cancelado", n: 7 },
              { etapa: "Cancelada", n: 7 },
            ],
          },
        },
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V2");
  });

  it("[R16] 'quanto tem de halter' (recusa indevida com agregado)", () => {
    const out = validateResponse({
      question: "Estou querendo saber quanto tem de halter em estoque",
      llmResponse:
        "Voce tem razao: a consulta nao retornou um resultado confiavel para eu afirmar isso com seguranca.",
      toolResults: [
        trEnvelope("estoque_saldo_produto", {
          totalProdutos: 50,
          valorTotal: 184706.29,
          produtosNegativos: 0,
        }),
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V3");
  });

  it("[R15] 'Devedores principais' (placeholder em bullet)", () => {
    const llm = `Pelos titulos em aberto que apareceram, os maiores devedores sao:
- Smartfit , R$ 387.500,00
- Jds Comercio , R$ 322.236,75
- Vale dos Passaros , nao consegui obter esse dado
- CONDOMINIO ESTRELAS DO MAR , nao consegui obter esse dado`;
    const out = validateResponse({
      question: "Devedores principais",
      llmResponse: llm,
      toolResults: [trEnvelope("financeiro_contas_a_receber", { totalAReceber: 1000000 })],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V4");
  });

  it("[R11] 'Total em aberto a pagar' (truncado com agregado disponivel)", () => {
    const out = validateResponse({
      question: "Total em aberto a pagar",
      llmResponse:
        "Nao consegui obter o total consolidado a pagar com seguranca agora; o retorno veio incompleto.",
      toolResults: [
        trEnvelope("financeiro_contas_a_pagar", { totalAPagar: 4200000, contagem: 218 }),
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V1");
  });

  it("CORRETO valido nao dispara (controle: nao deve haver falso positivo)", () => {
    const out = validateResponse({
      question: "Total a receber",
      llmResponse: "Total em aberto a receber: R$ 100.000,00 em 50 titulos. Maior cliente: Smartfit (R$ 60.000,00).",
      toolResults: [
        trEnvelope(
          "financeiro_contas_a_receber",
          { totalAReceber: 100000, contagem: 50 },
          [],
          [{ nome: "Smartfit", soma: 60000, n: 5 }],
        ),
      ],
    });
    expect(out.ok).toBe(true);
  });
});
