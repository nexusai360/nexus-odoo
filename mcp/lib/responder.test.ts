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

  it("fiscal_faturamento_por_empresa LISTA cada empresa (detalhamento, nao so o total)", () => {
    const fmt = formatadorPorTool("fiscal_faturamento_por_empresa");
    const env = {
      _listaTruncada: false,
      linhas: [
        { empresaId: 1, empresaNome: "Jds Comercio - Filial SE", totalNotas: 3536, valor: 542794073.8 },
        { empresaId: 2, empresaNome: "Jht DF Comercio - Matriz", totalNotas: 778, valor: 108526602.73 },
        { empresaId: null, empresaNome: null, totalNotas: 1, valor: 140000 },
      ],
      atualizadoEm: "x",
      atualizadoHa: "2min",
      _DESTAQUE: { totalGrupo: 651460676.53, empresasComFaturamento: 2 },
      _agregado: { soma: 651460676.53, contagem: 2 },
    };
    const r = normSpaces(fmt(env));
    // cabeca com o total do grupo
    expect(r).toContain("R$ 651.460.676,53");
    // DETALHAMENTO por empresa (era o que faltava , o LLM ecoava o _DESTAQUE cru sem isto)
    expect(r).toContain("Jds Comercio - Filial SE");
    expect(r).toContain("R$ 542.794.073,80");
    expect(r).toContain("Jht DF Comercio - Matriz");
    expect(r).toContain("R$ 108.526.602,73");
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

describe("fmtFaturamentoPorCfop", () => {
  const fmt = formatadorPorTool("fiscal_faturamento_por_cfop");
  const baseEnv = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("modo categoria: lista com marca de receita e aviso de gap", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: {
        agruparPor: "categoria",
        totalProdutos: 2050,
        totalReceita: 1300,
        linhasCount: 4,
        semCfopValor: 50,
        topLinhasJson: JSON.stringify([
          { rotulo: "Venda", valor: 1000, ehReceita: true },
          { rotulo: "Transferencia", valor: 700, ehReceita: false },
        ]),
      },
    };
    const txt = fmt(env as never);
    expect(txt).toContain("por operacao fiscal (categoria)");
    expect(txt).toContain("Receita");
    expect(txt).toContain("nao-receita");
    expect(txt).toContain("sem CFOP");
  });
  it("modo cfop: preserva o codigo+nome do CFOP sem mutilar", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: {
        agruparPor: "cfop",
        totalProdutos: 1000,
        totalReceita: 1000,
        linhasCount: 1,
        semCfopValor: 0,
        topLinhasJson: JSON.stringify([{ rotulo: "5102 - Venda de mercadoria", valor: 1000, ehReceita: true }]),
      },
    };
    const txt = fmt(env as never);
    expect(txt).toContain("por operacao fiscal (cfop)");
    expect(txt).toContain("5102 - Venda de mercadoria");
  });
  it("vazio quando nao ha linhas", () => {
    const txt = fmt({ ...baseEnv, _DESTAQUE: { totalProdutos: 0, linhasCount: 0 } } as never);
    expect(txt).toContain("Nenhum faturamento");
  });

  it("Fase 2.6: decompoe sem CFOP por finalidade e expoe balde outras (substancia a confirmar)", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: {
        agruparPor: "categoria",
        totalProdutos: 1000000,
        totalReceita: 500000,
        linhasCount: 3,
        semCfopValor: 23300150,
        semCfopVendaValor: 11841325,
        semCfopDevolucaoValor: 11458824,
        outrasValor: 11784759,
        outrasFinalidadeVendaValor: 11775042,
        topLinhasJson: JSON.stringify([{ rotulo: "Venda", valor: 500000, ehReceita: true }]),
      },
    };
    const txt = fmt(env as never);
    expect(txt).toContain("sem CFOP");
    expect(txt).toContain("venda candidata");
    expect(txt).toContain("substancia a confirmar");
  });

  it("Fase 2.6: nao imprime linha de outras quando outrasValor=0", () => {
    const env = {
      ...baseEnv,
      _DESTAQUE: { agruparPor: "categoria", totalProdutos: 1000, totalReceita: 1000, linhasCount: 1, outrasValor: 0, topLinhasJson: "[]" },
    };
    const txt = fmt(env as never);
    expect(txt).not.toContain("substancia a confirmar");
  });
});

describe("fmtReceitaConsolidada", () => {
  const fmt = formatadorPorTool("fiscal_receita_consolidada");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("frase com receita externa e percentual eliminado", () => {
    const txt = fmt({ ...base, _DESTAQUE: { receitaExterna: 897, receitaIntragrupoEliminavel: 418, receitaIndividualTotal: 1315, percentualEliminado: 0.318 } } as never);
    expect(txt).toContain("Receita consolidada externa");
    expect(txt).toContain("intragrupo");
  });
  it("vazio quando individual e zero", () => {
    expect(fmt({ ...base, _DESTAQUE: { receitaIndividualTotal: 0 } } as never)).toContain("Nenhuma receita");
  });
});

describe("fmtIntercompany", () => {
  const fmt = formatadorPorTool("fiscal_intercompany");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("lista top pares vendedor-comprador", () => {
    const txt = fmt({ ...base, _DESTAQUE: { total: 1500, totalPares: 1, topLinhasJson: JSON.stringify([{ vendedor: "Emp A", comprador: "Grupo B", valor: 1500 }]) } } as never);
    expect(txt).toContain("intercompany");
    expect(txt).toContain("Emp A");
    expect(txt).toContain("Grupo B");
  });
  it("topLinhasJson invalido cai no fallback sem estourar", () => {
    const txt = fmt({ ...base, _DESTAQUE: { total: 1500, totalPares: 1, topLinhasJson: "{quebrado" } } as never);
    expect(txt).toContain("intercompany");
  });
  it("vazio quando nao ha pares", () => {
    expect(fmt({ ...base, _DESTAQUE: { total: 0, totalPares: 0 } } as never)).toContain("Nenhuma venda entre empresas");
  });
});

describe("fmtFaturamentoPeriodo (Fase 2.5: headline externa/individual)", () => {
  const fmt = formatadorPorTool("fiscal_faturamento_periodo");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("grupo: headline = receita externa real, com auditoria do intragrupo", () => {
    const txt = fmt({
      ...base,
      _DESTAQUE: {
        headlineValor: 325000000,
        headlineRotulo: "Receita externa real (sem intercompany)",
        receitaExterna: 325000000,
        receitaIndividual: 543000000,
        intragrupoEliminavel: 218000000,
        percentualEliminado: 0.4,
        concentrador: 0,
        periodoLabel: "2025",
      },
    } as never);
    expect(txt).toContain("Receita externa real");
    expect(txt).toContain("2025");
    // Transparencia enxuta (sem o "individual X; intragrupo Y" verboso): so a nota curta.
    expect(txt).toContain("vendas entre empresas do grupo");
    expect(txt).not.toContain("Faturamento individual");
  });
  it("empresa concentradora: marca o aviso de concentrador", () => {
    const txt = fmt({
      ...base,
      _DESTAQUE: {
        headlineValor: 229000000,
        headlineRotulo: "Faturamento da empresa (inclui vendas intragrupo)",
        receitaExterna: 12000000,
        receitaIndividual: 229000000,
        intragrupoEliminavel: 217000000,
        percentualEliminado: 0.948,
        concentrador: 1,
        periodoLabel: "2025",
      },
    } as never);
    expect(txt).toContain("concentrador");
  });
  it("vazio quando nao ha faturamento", () => {
    const txt = fmt({ ...base, _DESTAQUE: { headlineValor: 0, receitaIndividual: 0, periodoLabel: "2025" } } as never);
    expect(txt).toContain("Nenhum faturamento");
  });
});

describe("fmtFaturamentoPorCliente (Fase 2.5: clientes externos + intragrupo separado)", () => {
  const fmt = formatadorPorTool("fiscal_faturamento_por_cliente");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("mostra top cliente externo, total externo e nota de intragrupo", () => {
    const txt = fmt({
      ...base,
      _DESTAQUE: {
        topCliente: "Cliente Externo Ltda",
        valorTopCliente: 320000,
        totalExterno: 500000,
        totalIntragrupo: 217000000,
        periodoLabel: "2025",
      },
    } as never);
    expect(txt).toContain("Cliente Externo Ltda");
    expect(txt).toContain("2025");
    expect(txt).toContain("intragrupo");
  });
  it("vazio quando nao ha cliente externo", () => {
    const txt = fmt({ ...base, _DESTAQUE: { topCliente: "", totalExterno: 0, periodoLabel: "2025" } } as never);
    expect(txt).toContain("Nenhum cliente externo");
  });
});

describe("fmtFaturamentoMensalSerie (Fase 2.5: serie externa)", () => {
  const fmt = formatadorPorTool("fiscal_faturamento_mensal_serie");
  const base = { _listaTruncada: false, linhas: [], atualizadoEm: "", atualizadoHa: "" };
  it("cabecalho com receita externa do ano e media mensal", () => {
    const txt = fmt({
      ...base,
      _DESTAQUE: { ano: 2025, totalExternaAno: 300000000, totalIndividualAno: 500000000, totalNotasExternasAno: 1200, mesesConsultados: 6 },
    } as never);
    expect(txt).toContain("2025");
    expect(txt).toContain("externa");
  });
  it("vazio quando nao ha faturamento no ano", () => {
    const txt = fmt({ ...base, _DESTAQUE: { ano: 2025, totalExternaAno: 0, totalIndividualAno: 0, mesesConsultados: 6 } } as never);
    expect(txt).toContain("Nenhum");
  });
});

describe("allowlist resolve formatador real (nao generico) para as tools F2", () => {
  it("fiscal_receita_consolidada e fiscal_intercompany tem formatador real", () => {
    expect(ehFormatadorGenerico(formatadorPorTool("fiscal_receita_consolidada"))).toBe(false);
    expect(ehFormatadorGenerico(formatadorPorTool("fiscal_intercompany"))).toBe(false);
  });
});
