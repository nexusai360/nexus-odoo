// Onda M (Arquitetura 3.0) , T1.2: digest determinístico de tool results.
// O digest é a memória de longo prazo do turno: 1-3 linhas com tool, args-chave
// e números do _DESTAQUE/_agregado, que substituem o payload bruto no replay.
import { derivarToolDigest } from "./tool-digest";

const CALL_FATURAMENTO = {
  id: "call_1",
  name: "fiscal_faturamento_periodo",
  arguments: { periodoDe: "2026-06-01", periodoAte: "2026-06-12" },
};

const RESULT_FATURAMENTO = JSON.stringify({
  estado: "ok",
  dados: {
    receitaExterna: 6334712.46,
    _RESPOSTA: "No mês corrente faturamos R$ 6.334.712,46...",
    _DESTAQUE: {
      headlineValor: 6334712.46,
      intragrupoEliminavel: 3403016.08,
      periodoLabel: "2026-06-01 a 2026-06-12",
    },
    _agregado: { soma: 6334712.46 },
  },
});

const CALL_ESTOQUE = {
  id: "call_2",
  name: "estoque_saldo_produto",
  arguments: { termo: "T600X", limit: 50 },
};

const RESULT_ESTOQUE = JSON.stringify({
  estado: "ok",
  dados: {
    _DESTAQUE: {
      totalProdutos: 7,
      valorTotal: 7303651.43,
      produtoPrincipal: "[99] T600X Esteira",
      valorPrincipal: 6778839.44,
    },
  },
});

describe("derivarToolDigest", () => {
  it("deriva digest com tool, dominio, args-chave e numeros do _DESTAQUE", () => {
    const d = derivarToolDigest(
      [CALL_FATURAMENTO],
      { call_1: RESULT_FATURAMENTO },
    );
    expect(d).toBeTruthy();
    expect(d).toContain("fiscal_faturamento_periodo");
    expect(d).toContain("2026-06-01");
    expect(d).toContain("6334712.46");
    expect(d).toContain("dominio=fiscal");
  });

  it("multiplas tools viram linhas separadas (uma por call)", () => {
    const d = derivarToolDigest(
      [CALL_FATURAMENTO, CALL_ESTOQUE],
      { call_1: RESULT_FATURAMENTO, call_2: RESULT_ESTOQUE },
    )!;
    const linhas = d.split("\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain("estoque_saldo_produto");
    expect(linhas[1]).toContain("T600X");
    expect(linhas[1]).toContain("6778839.44");
  });

  it("cap de tamanho: digest de uma call nunca passa de 400 chars", () => {
    const gigante = JSON.stringify({
      estado: "ok",
      dados: {
        _DESTAQUE: Object.fromEntries(
          Array.from({ length: 80 }, (_, i) => [`campo_long_${i}`, i * 1000.55]),
        ),
      },
    });
    const d = derivarToolDigest([CALL_ESTOQUE], { call_2: gigante })!;
    expect(d.length).toBeLessThanOrEqual(400);
  });

  it("retorna null sem tool calls ou sem results", () => {
    expect(derivarToolDigest([], {})).toBeNull();
    expect(derivarToolDigest([CALL_FATURAMENTO], {})).toBeNull();
  });

  it("result nao-JSON ou estado de erro nao derruba: digest minimo com a tool", () => {
    const d = derivarToolDigest([CALL_ESTOQUE], { call_2: "Erro interno" })!;
    expect(d).toContain("estoque_saldo_produto");
    expect(d).toContain("sem resultado");
  });

  it("tool desconhecida no catalogo: dominio=? sem quebrar", () => {
    const d = derivarToolDigest(
      [{ id: "c9", name: "tool_inexistente_xyz", arguments: {} }],
      { c9: JSON.stringify({ estado: "ok", dados: { _agregado: { soma: 10 } } }) },
    )!;
    expect(d).toContain("tool_inexistente_xyz");
    expect(d).toContain("dominio=?");
  });
});
