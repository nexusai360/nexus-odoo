// mcp/tools/producao/index.ts , B5. Produção não é um ReportDomain do RBAC,
// então a tool é sempreVisivel (mesmo padrão de producao_status_dominio).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { makeHonestTool } from "../lib/honest-tool.js";
import {
  queryProducaoProcessos,
  fatoProducaoProcessoCount,
} from "@/lib/reports/queries/producao.js";

export const producaoProcessos = makeHonestTool({
  id: "producao_processos",
  sempreVisivel: true,
  descricao:
    "Processos de produção cadastrados: ordem, nome, descrição e tempo padrão. " +
    "Enquanto a produção não for operada no Odoo, responde que não há processos.",
  fato: "fato_producao_processo",
  naoOperado: "A produção ainda não é operada no Odoo da Matrix (sem processos).",
  inputShape: { limite: z.number().int().min(1).max(200).optional() },
  count: fatoProducaoProcessoCount,
  query: (p, i) => queryProducaoProcessos(p, i),
  resumoOk: (n) => `${n} processos de produção cadastrados.`,
});

export const producaoTools: ToolEntry[] = [producaoProcessos as ToolEntry];
