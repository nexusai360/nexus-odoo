import { describe, it, expect } from "@jest/globals";
import {
  formatadorPorTool,
  calculosCanonicosPorTool,
  formatBRL,
  ehFormatadorGenerico,
  TOOLS_QUE_PRECISAM_FORMATADOR,
} from "./responder";

// Helper para comparar strings ignorando NBSP vs espaço normal
// (Intl.NumberFormat usa NBSP entre R$ e o número).
const normSpaces = (s: string) => s.replace(/\s+/g, " ");

describe("formatBRL", () => {
  it("formata em pt-BR com R$ e separadores", () => {
    expect(normSpaces(formatBRL(1234567.89))).toBe("R$ 1.234.567,89");
    expect(normSpaces(formatBRL(0))).toBe("R$ 0,00");
    expect(normSpaces(formatBRL(0.5))).toBe("R$ 0,50");
  });
});

describe("formatadorPorTool", () => {
  it("financeiro_contas_a_receber usa totalAReceber + contagem + topParticipante", () => {
    const fmt = formatadorPorTool("financeiro_contas_a_receber");
    const env = {
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "1min",
      _DESTAQUE: { totalAReceber: 100000, contagem: 50 },
      topPorParticipante: [{ nome: "Smartfit", soma: 60000, n: 5 }],
    };
    const r = normSpaces(fmt(env));
    expect(r).toContain("R$ 100.000,00");
    expect(r).toContain("50");
    expect(r).toContain("Smartfit");
  });

  it("financeiro_contas_a_pagar usa totalAPagar + topParticipante (maior fornecedor)", () => {
    const fmt = formatadorPorTool("financeiro_contas_a_pagar");
    const env = {
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "5min",
      _DESTAQUE: { totalAPagar: 50000, contagem: 10 },
      topPorParticipante: [{ nome: "Jds Comércio", soma: 30000, n: 3 }],
    };
    const r = normSpaces(fmt(env));
    expect(r).toContain("R$ 50.000,00");
    expect(r).toContain("Jds Comércio");
    expect(r.toLowerCase()).toContain("fornecedor");
  });

  it("registrar_lacuna devolve apenas respostaSugerida (T-19: canal removido)", () => {
    const fmt = formatadorPorTool("registrar_lacuna");
    const env = {
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "0s",
      _DESTAQUE: {
        respostaSugerida: "Essa métrica não está disponível.",
        sugestoesRelacionadas: ["Liste contas", "Veja faturamento"],
      } as unknown as Record<string, string | number>,
    };
    const r = fmt(env);
    expect(r).toContain("Essa métrica não está disponível.");
    // T-19: canal [[suggestions]]:... NAO deve mais aparecer no _RESPOSTA
    // (suggestions ficam disponiveis no campo separado sugestoesRelacionadas).
    expect(r).not.toContain("[[suggestions]]");
  });

  it("tool desconhecida cai no formatador generico (T-18: sem freshness)", () => {
    const fmt = formatadorPorTool("tool_inexistente_xyz");
    const r = fmt({
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "x",
      atualizadoHa: "1min",
    });
    expect(r).toContain("Resultado obtido");
    // T-18: freshness textual nao deve mais aparecer no _RESPOSTA.
    expect(r).not.toContain("atualizado ha");
  });

  it("ehFormatadorGenerico devolve true para tool nao registrada", () => {
    const fmt = formatadorPorTool("tool_inexistente_xyz");
    expect(ehFormatadorGenerico(fmt)).toBe(true);
  });

  it("ehFormatadorGenerico devolve false para tool registrada", () => {
    expect(ehFormatadorGenerico(formatadorPorTool("financeiro_contas_a_receber"))).toBe(false);
  });
});

describe("calculosCanonicosPorTool", () => {
  it("financeiro_contas_a_receber expoe lista finita de calculos", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_receber");
    const nomes = calcs.map((c) => c.nome);
    expect(nomes).toContain("soma_vrSaldo");
    expect(nomes).toContain("contagem");
    expect(nomes).toContain("max_vrSaldo");
    expect(nomes.length).toBeGreaterThan(5);
  });

  it("calculo soma_vrSaldo soma corretamente", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_receber");
    const soma = calcs.find((c) => c.nome === "soma_vrSaldo");
    expect(soma).toBeDefined();
    const r = soma!.computar([
      { vrSaldo: 100 },
      { vrSaldo: 200 },
      { vrSaldo: 50 },
    ]);
    expect(r).toBe(350);
  });

  it("calculo contagem retorna length", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_pagar");
    const c = calcs.find((x) => x.nome === "contagem");
    expect(c!.computar([{ vrSaldo: 1 }, { vrSaldo: 2 }, { vrSaldo: 3 }])).toBe(3);
  });

  it("calculo soma_top5_vrSaldo pega os 5 maiores", () => {
    const calcs = calculosCanonicosPorTool("financeiro_contas_a_receber");
    const c = calcs.find((x) => x.nome === "soma_top5_vrSaldo");
    const r = c!.computar([
      { vrSaldo: 100 },
      { vrSaldo: 50 },
      { vrSaldo: 200 },
      { vrSaldo: 300 },
      { vrSaldo: 150 },
      { vrSaldo: 80 },
      { vrSaldo: 10 },
    ]);
    expect(r).toBe(830); // 300+200+150+100+80
  });

  it("tool sem calculos retorna []", () => {
    expect(calculosCanonicosPorTool("tool_xyz")).toEqual([]);
  });
});

describe("TOOLS_QUE_PRECISAM_FORMATADOR", () => {
  it("contem pelo menos 25 tools (contrato spec §4.5)", () => {
    expect(TOOLS_QUE_PRECISAM_FORMATADOR.length).toBeGreaterThanOrEqual(25);
  });

  it("inclui as 4 tools financeiras criticas", () => {
    expect(TOOLS_QUE_PRECISAM_FORMATADOR).toEqual(
      expect.arrayContaining([
        "financeiro_contas_a_pagar",
        "financeiro_contas_a_receber",
        "financeiro_titulos_vencidos",
        "financeiro_fluxo_caixa",
      ]),
    );
  });
});

// CRIT-alpha v2: teste de contrato. SKIP em PR1, PR2 remove o .skip.
describe.skip("contrato pre-PR2 (TOOLS_QUE_PRECISAM_FORMATADOR)", () => {
  it("nenhuma tool da lista ainda usa fmtGenerico", () => {
    const faltam: string[] = [];
    for (const tool of TOOLS_QUE_PRECISAM_FORMATADOR) {
      const fmt = formatadorPorTool(tool);
      if (ehFormatadorGenerico(fmt)) faltam.push(tool);
    }
    expect(faltam).toEqual([]);
  });
});
