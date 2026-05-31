// mcp/tools/estoque/minimo-maximo.ts , B6. Parâmetros de mín/máx de estoque.
import { z } from "zod";
import { makeHonestTool } from "../lib/honest-tool.js";
import {
  queryEstoqueMinMax,
  fatoEstoqueMinMaxCount,
} from "@/lib/reports/queries/estoque-minimo-maximo.js";

export const estoqueMinimoMaximo = makeHonestTool({
  id: "estoque_minimo_maximo",
  dominio: "estoque",
  descricao:
    "Parâmetros de estoque mínimo e máximo cadastrados por produto/local (com unidade). " +
    "Enquanto a Matrix não cadastrar mín/máx no Odoo, responde que não há. " +
    "(O cruzamento com o saldo atual para 'produtos abaixo do mínimo' entra quando houver cadastro.)",
  fato: "fato_estoque_min_max",
  naoOperado: "Não há parâmetros de mínimo/máximo cadastrados no Odoo ainda.",
  inputShape: { limite: z.number().int().min(1).max(200).optional() },
  count: fatoEstoqueMinMaxCount,
  query: (p, i) => queryEstoqueMinMax(p, i),
  resumoOk: (n) => `${n} parâmetros de mín/máx cadastrados.`,
});
