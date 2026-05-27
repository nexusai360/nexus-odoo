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
  redirecionar: z
    .object({ tool: z.string(), motivo: z.string() })
    .optional(),
});

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
  { pattern: /pedido.*maior valor.*aberto/i, tool: "comercial_pedidos_atrasados", motivo: "Lista pedidos com valores; ordene por valor." },
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
    // Intercepta lacunas EVITAVEIS (tem solucao via composicao de tools).
    // Mini chama registrar_lacuna prematuramente; aqui forcamos retry.
    const redir = detectarRedirecionamento(input.perguntaResumo);
    if (redir) {
      return {
        registrado: false,
        redirecionar: { tool: redir.tool, motivo: redir.motivo },
      };
    }

    await ctx.prisma.featureRequest.createMany({
      data: [
        {
          userId: ctx.user.userId,
          perguntaResumo: input.perguntaResumo,
          dominio: input.dominio,
        },
      ],
    });
    return { registrado: true };
  },
};
