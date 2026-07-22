// mcp/tools/estoque/evolucao-saldo.ts
// Tool MCP: estoque_evolucao_saldo , serie temporal de saldo (fato_estoque_saldo_historico) de um
// produto, opcionalmente por local. Embrulha serieDeSaldo (src/lib/estoque/serie-historico.ts), que
// ja trata corte de leitura, carry-forward e lacunas. Freshness no fato-BASE `fato_estoque_saldo`
// (que grava FatoBuildState); apontar para o `*_historico` daria "preparando" eterno (INV-7).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { serieDeSaldo } from "@/lib/estoque/serie-historico.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  produtoId: z.number().int().describe("odoo_id do produto (product.product)."),
  localId: z.number().int().optional().describe("odoo_id do local/armazem. Se omitido, soma/serie de todos os locais do produto."),
  de: z.string().optional().describe("Inicio da janela (ISO). Se omitido, ultimos 90 dias. Grampeado ao corte de leitura."),
  ate: z.string().optional().describe("Fim da janela (ISO). Se omitido, agora."),
});

const pontoSchema = z.object({
  capturadoEm: z.string(),
  quantidade: z.string().nullable(),
  vrSaldo: z.string().nullable(),
  evento: z.string(),
});
const lacunaSchema = z.object({
  de: z.string(),
  ate: z.string(),
  tipo: z.enum(["ausencia", "recusada"]),
});
const inicialSchema = z.object({ quantidade: z.string().nullable(), vrSaldo: z.string().nullable() }).nullable();

const dados = z.object({
  produtoId: z.number().int(),
  localId: z.number().int().nullable(),
  de: z.string(),
  ate: z.string(),
  inicial: inicialSchema,
  pontos: z.array(pontoSchema),
  lacunas: z.array(lacunaSchema),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(
  input: Input,
  de: string,
  ate: string,
  serie: Awaited<ReturnType<typeof serieDeSaldo>>,
) {
  return {
    produtoId: input.produtoId,
    localId: input.localId ?? null,
    de,
    ate,
    inicial: serie.inicial,
    pontos: serie.pontos.map((p) => ({
      capturadoEm: p.capturadoEm.toISOString(),
      quantidade: p.quantidade,
      vrSaldo: p.vrSaldo,
      evento: p.evento,
    })),
    lacunas: serie.lacunas.map((l) => ({ de: l.de.toISOString(), ate: l.ate.toISOString(), tipo: l.tipo })),
    ordenadoPor: "pontos: capturadoEm asc",
    aviso:
      "Serie temporal de saldo (quantidade e valor). `inicial` e o saldo vigente ANTES da janela " +
      "(carry-forward; pode ser anterior ao corte, e ESTADO, nao fato analisado). `lacunas` marca " +
      "onde nao houve observacao: 'nao mudou' nao e 'nao observamos'. Sem `localId`, a serie e do " +
      "produto (o historico e por produto:local; leitura sem local cobre o produto todo).",
  };
}

export const estoqueEvolucaoSaldo: ToolEntry<Input, Output> = {
  id: "estoque_evolucao_saldo",
  dominio: "estoque",
  descricao:
    "Evolucao do saldo de estoque de um produto ao longo do tempo (quantidade e valor). Use para " +
    "'como o saldo do produto X evoluiu', 'historico de estoque do item Y', 'o saldo subiu ou caiu'. " +
    "Requer `produtoId`; `localId` opcional. Janela default: ultimos 90 dias.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const ate = input.ate ?? new Date().toISOString();
    const de = input.de ?? new Date(Date.now() - 90 * 864e5).toISOString();

    const envelope = await withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () => {
      const serie = await serieDeSaldo(ctx.prisma, input.produtoId, input.localId ?? undefined, de, ate);
      return shape(input, de, ate, serie);
    });

    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const qIni = d.inicial?.quantidade ?? d.pontos[0]?.quantidade ?? null;
    const qFim = d.pontos.at(-1)?.quantidade ?? d.inicial?.quantidade ?? null;
    const vFim = d.pontos.at(-1)?.vrSaldo ?? d.inicial?.vrSaldo ?? null;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.pontos.length > 0 || d.inicial
            ? `Produto ${d.produtoId}${d.localId != null ? `, local ${d.localId}` : ""}: ${d.pontos.length} mudanca(s) de saldo na janela. ` +
              `Quantidade ${qIni ?? "?"} -> ${qFim ?? "?"} (valor atual ${vFim ?? "?"}).`
            : `Sem historico de saldo para o produto ${d.produtoId}.`,
        _DESTAQUE: {
          produtoId: d.produtoId,
          mudancas: d.pontos.length,
          quantidadeFinal: qFim ?? "",
          valorFinal: vFim ?? "",
        },
        _agregado: { contagem: d.pontos.length },
      },
    };
  },
};
