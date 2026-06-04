// mcp/tools/contabil/plano-de-contas.ts
// Tool MCP: contabil_plano_de_contas
//
// NOTA OBRIGATÓRIA: não há lançamento/movimento contábil no Odoo da Matrix
// Fitness Group , apenas a estrutura do plano de contas (tipo S/A).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPlanoDeContas } from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  termo: z.string().optional(),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  nome: z.string(),
  tipo: z.string(),
  contaPaiNome: z.string().nullable(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  truncado: z.boolean(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({
  status: z.string(),
  ultimaSyncEm: z.string().nullable(),
});

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const AVISO =
  "ATENÇÃO: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group , " +
  "este domínio expõe apenas a estrutura do plano de contas (contas sintéticas e analíticas).";

export const contabilPlanoDeContas: ToolEntry<Input, Output> = {
  id: "contabil_plano_de_contas",
  dominio: "contabil",
  descricao:
    "Lista as contas do plano de contas contábil da Matrix, com código hierárquico, nome, tipo (S=sintética/A=analítica) e conta pai. " +
    "Filtre por termo (código ou nome). " +
    "NOTA: não há lançamento/movimento contábil no Odoo da Matrix, apenas a estrutura do plano de contas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_conta_contabil"],
      async () => {
        const result = await queryPlanoDeContas(ctx.prisma, { ...input, limit, offset });
        const aviso = result.truncado
          ? `${AVISO} Mostrando ${offset + 1} a ${offset + result.linhas.length} de ${result.total} contas , refine com o parâmetro "termo" ou peça "os próximos" para ver mais.`
          : AVISO;
        return {
          linhas: result.linhas,
          total: result.total,
          truncado: result.truncado,
          aviso,
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const linhas = envelope.dados.linhas;
    const totalNoBanco = envelope.dados.total; // count absoluto (nao truncado)
    const paginacao = montarPaginacaoMeta(totalNoBanco, offset, limit, linhas.length);
    return enriquecerEnvelope(envelope, "contabil_plano_de_contas", {
      destaque: {
        // T-25 (Ronda 1): totalContas agora reflete o count absoluto do banco,
        // nao o tamanho da fatia retornada. Resolve "Quantas contas temos no
        // plano contabil?" sem precisar de tool nova.
        totalContas: totalNoBanco,
        contagem: totalNoBanco,
        linhasExibidas: linhas.length,
        termo: input.termo ?? "",
        ...(linhas.length === 1
          ? {
              codigo: linhas[0]?.codigo ?? "",
              nome: linhas[0]?.nome ?? "",
            }
          : {}),
      },
      agregado: {
        contagem: totalNoBanco,
      },
      paginacao,
    });
  },
};
