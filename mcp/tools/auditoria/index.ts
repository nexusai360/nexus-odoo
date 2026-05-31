// mcp/tools/auditoria/index.ts , B7. Auditoria não é ReportDomain do RBAC →
// tool sempreVisivel (padrão producao/dominios-vazios). Cobre auditoria.regra
// (15 reg). auditoria.log/.item (313k/14MI) ficam fora (volume).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { makeHonestTool } from "../lib/honest-tool.js";
import {
  queryAuditoriaRegras,
  fatoAuditoriaRegraCount,
} from "@/lib/reports/queries/crm-auditoria.js";

export const auditoriaRegras = makeHonestTool({
  id: "auditoria_regras",
  sempreVisivel: true,
  descricao:
    "Regras de auditoria configuradas no Odoo: nome, se está ativa e a janela em dias. " +
    "Use para saber o que está sendo auditado/monitorado. (A trilha de eventos de alto " +
    "volume , auditoria.log , não é cacheada.)",
  fato: "fato_auditoria_regra",
  naoOperado: "Não há regras de auditoria cadastradas no Odoo.",
  inputShape: {
    apenasAtivas: z.boolean().optional().describe("Só regras ativas"),
    limite: z.number().int().min(1).max(200).optional(),
  },
  count: fatoAuditoriaRegraCount,
  query: (p, i) => queryAuditoriaRegras(p, i),
  resumoOk: (n) => `${n} regras de auditoria cadastradas.`,
});

export const auditoriaTools: ToolEntry[] = [auditoriaRegras as ToolEntry];
