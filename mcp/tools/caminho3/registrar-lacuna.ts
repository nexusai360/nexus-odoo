// mcp/tools/caminho3/registrar-lacuna.ts
// Tool MCP: registrar_lacuna (Caminho 3a)
// Registra uma pergunta não coberta pelo catálogo de tools.
// sempreVisivel: true , aparece para qualquer usuário independente de domínio.
// Sem gatedRoles , qualquer role pode sinalizar lacunas.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({
  perguntaResumo: z.string().min(1),
  dominio: z.string().optional(),
});

const outputSchema = z.object({
  registrado: z.boolean(),
  /** Quando ha tool alternativa pra tentar antes de aceitar lacuna. */
  redirecionar: z
    .object({ tool: z.string(), motivo: z.string() })
    .optional(),
  /** Para lacunas reais: pergunta-modelo pronta + 3-5 alternativas relacionadas. */
  respostaSugerida: z.string().optional(),
  sugestoesRelacionadas: z.array(z.string()).optional(),
});

/**
 * Lacunas REAIS (sem tool, sem composicao). Retornam mensagem util +
 * chips de assuntos proximos, NUNCA "registrei pra proxima etapa".
 */
const LACUNAS_REAIS: Array<{
  pattern: RegExp;
  resposta: string;
  sugestoes: string[];
}> = [
  {
    pattern: /vai (bater|fechar|atingir) (a )?meta|bater.*meta esse m[eê]s/i,
    resposta: "Não temos cadastro de metas no ERP, então não consigo comparar contra meta. Posso te ajudar com indicadores reais do mês:",
    sugestoes: ["Faturamento esse mês", "Comparativo mês vs mês anterior", "Top 5 clientes esse mês"],
  },
  {
    pattern: /liquidez (imediata|seca|corrente|geral)/i,
    resposta: "Esse indicador financeiro não está calculado no painel. Posso te dar os componentes pra você avaliar:",
    sugestoes: ["Saldo geral em contas", "Contas a receber em aberto", "Contas a pagar em aberto"],
  },
  {
    pattern: /tempo m[eé]dio.*(fechament|conclus|entrega).*pedido/i,
    resposta: "Não calculamos esse tempo médio porque o fluxo do pedido não tem data fim instrumentada. Posso te ajudar com:",
    sugestoes: ["Pedidos em aberto no funil", "Pedidos atrasados", "Volume de pedidos por etapa"],
  },
  {
    pattern: /faturamento por (regi[ãa]o|estado)|por (regi[ãa]o|estado).*faturament/i,
    resposta: "Esse corte não está agrupado no painel. Posso te dar visões alternativas:",
    sugestoes: ["Faturamento por marca esse mês", "Faturamento por cliente esse mês", "Faturamento total esse mês"],
  },
  {
    pattern: /parceiros novos.*(semana|mes|periodo)|cadastrados.*semana|fornecedor sem cadastro/i,
    resposta: "Não temos a data de cadastro indexada pra filtrar por período. Posso te ajudar com:",
    sugestoes: ["Quantos parceiros temos cadastrados", "Parceiros por UF", "Buscar um parceiro específico"],
  },
  {
    pattern: /pedidos? sem vendedor/i,
    resposta: "Não consigo filtrar pedidos sem vendedor atribuído com as ferramentas atuais. Posso te ajudar com:",
    sugestoes: ["Pedidos por vendedor esse mês", "Volume de pedidos por etapa", "Vendedores cadastrados"],
  },
  {
    pattern: /pedido (sem nota emitida|faturado parcialmente)/i,
    resposta: "Não temos o cruzamento pedido↔nota com esse filtro. Posso te ajudar com:",
    sugestoes: ["Pedidos em aberto no funil", "Notas emitidas esta semana", "Pedidos atrasados"],
  },
  {
    pattern: /(produtos? sem saldo cadastrado|quantos produtos? n[ãa]o tem saldo)/i,
    resposta: "Posso te dar a contagem de produtos com saldo zero (que cobre os sem estoque). Outras visões úteis:",
    sugestoes: ["Quantos produtos com saldo zero", "Produtos parados há mais de 90 dias", "Saldo de um produto específico"],
  },
  {
    pattern: /valor.*impostos? pagos?|impostos? pagos? no? m[eê]s/i,
    resposta: "Não temos o agregado de impostos pagos. Posso te ajudar com:",
    sugestoes: ["Impostos do período", "Plano de contas de impostos", "Notas emitidas esse mês"],
  },
];

function detectarLacunaReal(perguntaResumo: string) {
  for (const l of LACUNAS_REAIS) {
    if (l.pattern.test(perguntaResumo)) return l;
  }
  return null;
}

/**
 * REDIRECIONAMENTOS: padroes onde uma "lacuna" tem solucao via composicao
 * de tools existentes. Mini chama registrar_lacuna prematuramente nesses
 * casos; o handler bloqueia e instrui qual tool usar. Derivado do audit
 * R12+R13 (51 falhas, 17 EVITAVEIS por composicao).
 */
const REDIRECIONAMENTOS: Array<{ pattern: RegExp; tool: string; motivo: string }> = [
  { pattern: /fornecedor.*(mais devemos|maior saldo|mais devido)/i, tool: "financeiro_contas_a_pagar", motivo: "Agrupe titulos[] por participanteNome e some vrSaldo." },
  { pattern: /cliente.*(mais deve|maior devedor|maior saldo a receber)/i, tool: "financeiro_contas_a_receber", motivo: "Agrupe titulos[] por participanteNome e some vrSaldo." },
  { pattern: /devedores principais|inadimplencia/i, tool: "financeiro_contas_a_receber", motivo: "Agrupe titulos[] por participanteNome + top N." },
  { pattern: /comparativo.*(mes|mensal).*ano|faturamento.*por mes.*ano/i, tool: "fiscal_faturamento_periodo", motivo: "Itere para cada mes do ano corrente (01-01..31-01, 01-02..28-02, etc) e some." },
  { pattern: /(contas? a (pagar|receber)).*( em |daqui ).*\d+\s*dias/i, tool: "financeiro_contas_a_receber/pagar", motivo: "Use a tool de contas e filtre dataVencimento <= hoje+N." },
  { pattern: /quantos clientes ativos|clientes ativos\?/i, tool: "cadastro_contar_parceiros", motivo: "Campo totalClientesAtivos ja existe no envelope." },
  { pattern: /quantos.*pessoa f[ií]sica|parceiros.*pf\b/i, tool: "cadastro_contar_parceiros", motivo: "Campo totalPessoasFisicas existe no envelope." },
  { pattern: /fornecedores ativos|lista.*fornecedores/i, tool: "cadastro_buscar_parceiro", motivo: "Use termo amplo (ex: 'ltda') e filtre ehFornecedor=true && ativo=true." },
  { pattern: /vendedores cadastrados|lista.*vendedores/i, tool: "comercial_pedidos_por_vendedor", motivo: "Sem periodo retorna todos os vendedores com pedidos." },
  { pattern: /quantos itens.*(saldo zero|sem estoque|estoque zerado)/i, tool: "estoque_produtos_saldo_zero", motivo: "Tool dedicada existe." },
  { pattern: /pedido.*maior valor.*aberto|maiores pedidos|top.*pedidos.*valor/i, tool: "comercial_pedidos_listar_top_valor", motivo: "Tool dedicada que lista top N pedidos por valor (use status: aberto)." },
  { pattern: /clientes.*pedido.*aberto.*titulo.*venci|pedido.*aberto.*titulo.*venci/i, tool: "financeiro_titulos_vencidos", motivo: "Cruze participanteNome com comercial_pedidos_periodo." },
  { pattern: /quantas? notas?( fiscais?)? recebidas?.*mes/i, tool: "fiscal_notas_recebidas", motivo: "Tool retorna lista + agregado." },
  { pattern: /quantas? contas.*plano cont|quantas? contas? cont/i, tool: "contabil_plano_de_contas", motivo: "Conte registros retornados." },
];

function detectarRedirecionamento(perguntaResumo: string) {
  for (const r of REDIRECIONAMENTOS) {
    if (r.pattern.test(perguntaResumo)) return r;
  }
  return null;
}

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const registrarLacuna: ToolEntry<Input, Output> = {
  id: "registrar_lacuna",
  // dominio ausente intencionalmente , tool de domínio-neutro (sempreVisivel: true).
  // Nenhum domínio falso: visibilidade é garantida pelo predicado sempreVisivel.
  sempreVisivel: true,
  descricao:
    "Registra uma pergunta que não foi coberta pelo catálogo de tools (Caminho 3a). " +
    "Use quando o usuário faz uma pergunta fora do escopo das tools disponíveis.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const redir = detectarRedirecionamento(input.perguntaResumo);
    if (redir) {
      return {
        registrado: false,
        redirecionar: { tool: redir.tool, motivo: redir.motivo },
      };
    }

    // Lacuna real: registra + retorna resposta util com chips relacionados
    await ctx.prisma.featureRequest.createMany({
      data: [
        {
          userId: ctx.user.userId,
          perguntaResumo: input.perguntaResumo,
          dominio: input.dominio,
        },
      ],
    });

    const lacuna = detectarLacunaReal(input.perguntaResumo);
    if (lacuna) {
      return {
        registrado: true,
        respostaSugerida: lacuna.resposta,
        sugestoesRelacionadas: lacuna.sugestoes,
      };
    }
    return {
      registrado: true,
      respostaSugerida:
        "Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.",
      sugestoesRelacionadas: [
        "Faturamento esse mês",
        "Contas a receber em aberto",
        "Posição financeira atual",
      ],
    };
  },
};
