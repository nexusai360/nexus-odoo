// mcp/tools/crm/pipeline-funis.ts , B7. Funis de CRM (config). Honesta.
import { z } from "zod";
import { makeHonestTool } from "../lib/honest-tool.js";
import {
  queryCrmPipelines,
  fatoCrmPipelineCount,
} from "@/lib/reports/queries/crm-auditoria.js";

export const crmPipelineFunis = makeHonestTool({
  id: "crm_pipeline_funis",
  dominio: "crm",
  descricao:
    "Funis de CRM cadastrados (configuração de pipeline): número, nome, tipo e se ativo. " +
    "O CRM transacional (leads/oportunidades) não existe neste Odoo; enquanto o funil não " +
    "for operado, responde que não há.",
  fato: "fato_crm_pipeline",
  naoOperado: "O funil de CRM não é operado no Odoo da Matrix (sem pipelines).",
  inputShape: { limite: z.number().int().min(1).max(200).optional() },
  count: fatoCrmPipelineCount,
  query: (p, i) => queryCrmPipelines(p, i),
  resumoOk: (n) => `${n} funis de CRM cadastrados.`,
});
