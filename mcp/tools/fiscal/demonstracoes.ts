// mcp/tools/fiscal/demonstracoes.ts
// Tool MCP: fiscal_demonstracoes , tool CANÔNICA do recorte demonstração.
//
// Remessa para demonstração = CFOP 5912/6912; retorno = 1913/2913 (pareiam).
// Fonte: fato_nota_fiscal_item (desnormalizado), SÓ notas autorizadas ,
// rascunho/cancelada/denegada nunca contam (âncora validada 2026-06-11:
// remessa 89 notas / R$ 6.347.354,48; retorno 40 / R$ 3.860.567,56).
// O valor é de REMESSA (a mercadoria pode retornar), não é receita de venda.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { buildEmpresaSqlFragment } from "@/lib/metrics/_shared/empresa.js";
import { resolverPeriodoFiscal, type PeriodoResolvido } from "./_periodo-padrao.js";

const inputSchema = z.object({
  agruparPor: z.enum(["uf", "empresa", "mes"]).optional()
    .describe("Dimensão do agrupamento (default uf)."),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional()
    .describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

const linhaSchema = z.object({
  chave: z.string().nullable(),
  vrRemessa: z.number(),
  nNotasRemessa: z.number().int(),
  vrRetorno: z.number(),
  nNotasRetorno: z.number().int(),
});

const dados = z.object({
  agruparPor: z.string(),
  linhas: z.array(linhaSchema),
  vrRemessa: z.number(),
  nNotasRemessa: z.number().int(),
  vrRetorno: z.number(),
  nNotasRetorno: z.number().int(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

interface Row {
  chave: string | null;
  vr_remessa: string | number;
  n_remessa: bigint;
  vr_retorno: string | number;
  n_retorno: bigint;
}

const REMESSA = "('5912','6912')";
const RETORNO = "('1913','2913')";

async function queryDemonstracoes(
  prisma: PrismaClient,
  agruparPor: "uf" | "empresa" | "mes",
  per: PeriodoResolvido,
  empresaId?: number,
) {
  // chave por dimensão; UF exige JOIN ao cabeçalho + parceiro (i é o item,
  // desnormalizado com situacao_nfe/data_emissao/empresa próprios).
  const chaveSql =
    agruparPor === "uf"
      ? "COALESCE(p.uf, '(sem UF)')"
      : agruparPor === "empresa"
        ? "COALESCE(nf.empresa_nome, '(sem empresa)')"
        : "to_char(date_trunc('month', i.data_emissao), 'YYYY-MM')";
  const joins =
    agruparPor === "mes"
      ? ""
      : `JOIN fato_nota_fiscal nf ON i.documento_id = nf.odoo_id
         LEFT JOIN fato_parceiro p ON p.odoo_id = nf.participante_id`;
  const emp = buildEmpresaSqlFragment(empresaId, "i", 3);
  const cfop = "substring(i.cfop_nome from '^[0-9]{4}')";

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${chaveSql} AS chave,
            COALESCE(SUM(i.vr_produtos) FILTER (WHERE ${cfop} IN ${REMESSA}), 0)::text AS vr_remessa,
            COUNT(DISTINCT i.documento_id) FILTER (WHERE ${cfop} IN ${REMESSA})::bigint AS n_remessa,
            COALESCE(SUM(i.vr_produtos) FILTER (WHERE ${cfop} IN ${RETORNO}), 0)::text AS vr_retorno,
            COUNT(DISTINCT i.documento_id) FILTER (WHERE ${cfop} IN ${RETORNO})::bigint AS n_retorno
     FROM fato_nota_fiscal_item i
     ${joins}
     WHERE i.situacao_nfe = 'autorizada'
       AND ${cfop} IN ('5912','6912','1913','2913')
       AND i.data_emissao >= $1::timestamp
       AND i.data_emissao <= $2::timestamp
       ${emp.sql}
     GROUP BY 1
     ORDER BY 2 DESC NULLS LAST, 1 ASC`,
    `${per.periodoDe}T00:00:00`,
    `${per.periodoAte}T23:59:59`,
    ...emp.params,
  );

  const linhas = rows.map((r) => ({
    chave: r.chave === "(sem UF)" || r.chave === "(sem empresa)" ? null : r.chave,
    vrRemessa: Number(r.vr_remessa),
    nNotasRemessa: Number(r.n_remessa),
    vrRetorno: Number(r.vr_retorno),
    nNotasRetorno: Number(r.n_retorno),
  }));
  // totais full-set (linhas de agrupamento são poucas; soma fecha o recorte)
  const tot = linhas.reduce(
    (a, l) => ({
      vrRemessa: a.vrRemessa + l.vrRemessa,
      nNotasRemessa: a.nNotasRemessa + l.nNotasRemessa,
      vrRetorno: a.vrRetorno + l.vrRetorno,
      nNotasRetorno: a.nNotasRetorno + l.nNotasRetorno,
    }),
    { vrRemessa: 0, nNotasRemessa: 0, vrRetorno: 0, nNotasRetorno: 0 },
  );
  return { linhas, ...tot };
}

export const fiscalDemonstracoes: ToolEntry<Input, Output> = {
  id: "fiscal_demonstracoes",
  dominio: "fiscal",
  descricao:
    "Demonstrações de equipamentos (remessa para demonstração, CFOP 5912/6912, e retorno " +
    "de demonstração, CFOP 1913/2913; só notas autorizadas): valor e número de notas " +
    "fiscais emitidas, agrupados por UF, empresa ou mês. Use para 'faturamento de " +
    "operações de demonstração', 'remessas para demonstração por estado', 'quantas notas " +
    "de demonstração emitimos', 'quanto retornou de demonstração'. O valor é de REMESSA " +
    "(a mercadoria pode retornar), não é receita de venda. Tool canônica para qualquer " +
    "recorte de demonstração.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const agruparPor = input.agruparPor ?? "uf";
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal_item", "fato_nota_fiscal", "fato_parceiro"],
      async () => ({
        agruparPor,
        ...(await queryDemonstracoes(ctx.prisma, agruparPor, per, escopo.empresaId)),
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        ordenadoPor: "vrRemessa desc",
        aviso:
          "Valor de REMESSA para demonstração (CFOP 5912/6912), não é receita de venda; " +
          "a mercadoria pode retornar (retornos: CFOP 1913/2913). Só notas autorizadas. " +
          `Período: ${per.label}. ${escopo.escopo.aviso}`,
      }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "fiscal_demonstracoes", {
      periodo: per,
      destaque: {
        vrRemessa: d.vrRemessa,
        nNotasRemessa: d.nNotasRemessa,
        vrRetorno: d.vrRetorno,
        nNotasRetorno: d.nNotasRetorno,
        agruparPor: d.agruparPor,
        linhasExibidas: d.linhas.length,
      },
      agregado: { soma: d.vrRemessa, contagem: d.nNotasRemessa },
    });
  },
};
