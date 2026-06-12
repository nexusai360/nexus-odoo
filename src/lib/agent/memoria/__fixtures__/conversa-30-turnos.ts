// Onda M (Arquitetura 3.0) T0.1 , fixture determinística de 30 turnos.
// Simula uma conversa longa real: cada turno tem user + assistant; um a cada
// três turnos consultou tool (toolCalls + toolDigest preenchidos, como o
// banco fica após a Onda M.1). Números ÚNICOS por turno permitem assertar
// que a memória de longo prazo sobrevive à janela.
//
// Consumida por: conversation (loadHistoryTurnos/síntese) e
// montar-conversa.memoria.test.ts.

export interface MsgFixture {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: { id: string; name: string; arguments: object }[] | null;
  toolDigest: string | null;
}

// Números-chave referenciados nos testes (1 por turno com tool).
export const NUMERO_TURNO_3 = "6334712.46"; // faturamento junho
export const NUMERO_TURNO_12 = "7303651.43"; // estoque T600X agregado
export const NUMERO_TURNO_21 = "153232144.14"; // a pagar vivo
export const DOMINIO_TURNO_21 = "financeiro";

function turnoSimples(n: number): MsgFixture[] {
  return [
    {
      id: `u${n}`,
      role: "user",
      content: `Pergunta conversacional ${n} sem consulta a dados.`,
      toolCalls: null,
      toolDigest: null,
    },
    {
      id: `a${n}`,
      role: "assistant",
      content: `Resposta conversacional do turno ${n}.`,
      toolCalls: null,
      toolDigest: null,
    },
  ];
}

function turnoComTool(
  n: number,
  tool: string,
  dominio: string,
  pergunta: string,
  digestNumeros: string,
  resposta: string,
): MsgFixture[] {
  return [
    {
      id: `u${n}`,
      role: "user",
      content: pergunta,
      toolCalls: null,
      toolDigest: null,
    },
    {
      id: `a${n}`,
      role: "assistant",
      content: resposta,
      toolCalls: [{ id: `call_${n}`, name: tool, arguments: {} }],
      toolDigest: `[${tool} dominio=${dominio}] ${digestNumeros}`,
    },
  ];
}

export const CONVERSA_30_TURNOS: MsgFixture[] = [
  ...turnoSimples(1),
  ...turnoSimples(2),
  ...turnoComTool(
    3,
    "fiscal_faturamento_periodo",
    "fiscal",
    "Quanto faturamos em junho?",
    `headlineValor=${NUMERO_TURNO_3} periodoLabel=2026-06-01 a 2026-06-12`,
    "Em junho até dia 12, faturamos R$ 6.334.712,46 de receita externa.",
  ),
  ...turnoSimples(4),
  ...turnoSimples(5),
  ...turnoSimples(6),
  ...turnoSimples(7),
  ...turnoSimples(8),
  ...turnoSimples(9),
  ...turnoSimples(10),
  ...turnoSimples(11),
  ...turnoComTool(
    12,
    "estoque_saldo_produto",
    "estoque",
    "Quanto temos de T600X em estoque?",
    `valorTotal=${NUMERO_TURNO_12} produtoPrincipal=[99] T600X Esteira`,
    "O grupo T600X soma R$ 7.303.651,43 a custo.",
  ),
  ...turnoSimples(13),
  ...turnoSimples(14),
  ...turnoSimples(15),
  ...turnoSimples(16),
  ...turnoSimples(17),
  ...turnoSimples(18),
  ...turnoSimples(19),
  ...turnoSimples(20),
  ...turnoComTool(
    21,
    "financeiro_contas_a_pagar",
    DOMINIO_TURNO_21,
    "Quanto temos a pagar em aberto?",
    `valorTotal=${NUMERO_TURNO_21} titulos=2183`,
    "Temos R$ 153.232.144,14 a pagar em aberto (confirmado + provisório).",
  ),
  ...turnoSimples(22),
  ...turnoSimples(23),
  ...turnoSimples(24),
  ...turnoSimples(25),
  ...turnoSimples(26),
  ...turnoSimples(27),
  ...turnoSimples(28),
  ...turnoSimples(29),
  ...turnoSimples(30),
];
