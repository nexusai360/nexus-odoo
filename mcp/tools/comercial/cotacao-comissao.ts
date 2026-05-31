// mcp/tools/comercial/cotacao-comissao.ts
// B4 , tools de cotação e comissão. Honestas (count==0 -> "não operado").
import { z } from "zod";
import {
  queryCotacoes, fatoCotacaoCount,
  queryComissoes, fatoComissaoCount,
} from "@/lib/reports/queries/comercial-cotacao.js";
import { makeHonestTool } from "../lib/honest-tool.js";

export const comercialCotacoes = makeHonestTool({
  id: "comercial_cotacoes",
  dominio: "comercial",
  descricao:
    "Cotações/propostas comerciais: número, status, se é compra ou venda e operação. " +
    "Filtre por status, por ehCompra (true=compra, false=venda) e limite. Enquanto a Matrix " +
    "não operar cotações no Odoo, responde que não há cotações.",
  fato: "fato_cotacao",
  naoOperado: "As cotações/propostas ainda não são operadas no Odoo da Matrix (sem cotações).",
  inputShape: {
    status: z.string().optional().describe("Status da cotação (valor do Odoo)"),
    ehCompra: z.boolean().optional().describe("true = cotação de compra; false = de venda"),
    limite: z.number().int().min(1).max(200).optional(),
  },
  count: fatoCotacaoCount,
  query: (p, i) => queryCotacoes(p, i),
  resumoOk: (n) => `${n} cotações no recorte.`,
});

export const comercialComissoes = makeHonestTool({
  id: "comercial_comissoes",
  dominio: "comercial",
  descricao:
    "Comissões por pedido/vendedor: pedido, participante (vendedor), base de cálculo, alíquota e " +
    "valor da comissão. Filtre por participanteId, pedidoId e limite. Enquanto a Matrix não " +
    "operar comissões no Odoo, responde que não há comissões.",
  fato: "fato_comissao",
  naoOperado: "As comissões ainda não são operadas no Odoo da Matrix (sem comissões).",
  inputShape: {
    participanteId: z.number().int().optional().describe("ID do participante (vendedor)"),
    pedidoId: z.number().int().optional().describe("ID do pedido"),
    limite: z.number().int().min(1).max(200).optional(),
  },
  count: fatoComissaoCount,
  query: (p, i) => queryComissoes(p, i),
  resumoOk: (n) => `${n} comissões no recorte.`,
});
