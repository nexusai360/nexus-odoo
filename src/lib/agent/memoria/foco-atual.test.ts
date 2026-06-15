// Onda M (Arquitetura 3.0) T3.2 , working memory determinística do turno.
import { derivarFocoAtual, type FocoAtual } from "./foco-atual";

const TURNO_FATURAMENTO = {
  pergunta: "Quanto faturamos em junho?",
  toolCalls: [
    {
      id: "c1",
      name: "fiscal_faturamento_periodo",
      arguments: { periodoDe: "2026-06-01", periodoAte: "2026-06-12" },
    },
  ],
  toolResults: {
    c1: JSON.stringify({
      estado: "ok",
      dados: { _DESTAQUE: { headlineValor: 6334712.46, periodoLabel: "2026-06-01 a 2026-06-12" } },
    }),
  },
  respostaFinal: "Em junho, faturamos R$ 6.334.712,46.",
  messageId: "m1",
  turno: 3,
};

describe("derivarFocoAtual", () => {
  it("extrai metrica, periodo e ultimo resultado do turno com tool", () => {
    const f = derivarFocoAtual(null, TURNO_FATURAMENTO);
    expect(f.metrica?.toolUsada).toBe("fiscal_faturamento_periodo");
    expect(f.periodo?.inicio).toBe("2026-06-01");
    expect(f.periodo?.fim).toBe("2026-06-12");
    expect(f.ultimoResultado?.valorChave).toContain("6334712.46");
    expect(f.turnoAtualizado).toBe(3);
  });

  it("extrai entidades dos argumentos (termo/vendedor/empresaRef/documento)", () => {
    const f = derivarFocoAtual(null, {
      ...TURNO_FATURAMENTO,
      toolCalls: [
        { id: "c1", name: "estoque_saldo_produto", arguments: { termo: "T600X" } },
        { id: "c2", name: "fiscal_faturamento_por_vendedor", arguments: { vendedor: "Weverton" } },
      ],
      toolResults: { c1: "{}", c2: "{}" },
      turno: 5,
    });
    const tipos = (f.entidades ?? []).map((e) => `${e.tipo}:${e.rotulo}`);
    expect(tipos).toContain("produto:T600X");
    expect(tipos).toContain("vendedor:Weverton");
  });

  it("HERANCA: turno sem periodo/entidade mantem os do foco anterior", () => {
    const prev = derivarFocoAtual(null, TURNO_FATURAMENTO);
    const f = derivarFocoAtual(prev, {
      pergunta: "e o estoque?",
      toolCalls: [{ id: "c9", name: "estoque_valor_armazem", arguments: {} }],
      toolResults: { c9: "{}" },
      respostaFinal: "O estoque vale R$ 35 mi.",
      messageId: "m2",
      turno: 4,
    });
    expect(f.periodo?.inicio).toBe("2026-06-01"); // herdado
    expect(f.metrica?.toolUsada).toBe("estoque_valor_armazem"); // atualizado
    expect(f.turnoAtualizado).toBe(4);
  });

  it("turno SEM tool nao perde o foco anterior (so atualiza o turno)", () => {
    const prev = derivarFocoAtual(null, TURNO_FATURAMENTO);
    const f = derivarFocoAtual(prev, {
      pergunta: "obrigado!",
      toolCalls: [],
      toolResults: {},
      respostaFinal: "De nada!",
      messageId: "m3",
      turno: 6,
    });
    expect(f.metrica?.toolUsada).toBe("fiscal_faturamento_periodo");
    expect(f.periodo?.inicio).toBe("2026-06-01");
  });

  it("serializa em bloco curto para o prompt (formatarFocoAtual)", async () => {
    const { formatarFocoAtual } = await import("./foco-atual");
    const f: FocoAtual = derivarFocoAtual(null, TURNO_FATURAMENTO);
    const txt = formatarFocoAtual(f);
    expect(txt).toContain("fiscal_faturamento_periodo");
    expect(txt).toContain("2026-06-01");
    expect(txt.length).toBeLessThan(600);
  });
});
