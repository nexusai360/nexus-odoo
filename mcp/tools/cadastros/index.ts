// mcp/tools/cadastros/index.ts
// Indice do dominio cadastros. Reads (alfabetico) + writes (alfabetico).
import type { ToolEntry } from "../../catalog/types.js";
// reads
import { cadastroBuscarParceiro } from "./buscar-parceiro.js";
import { cadastroContarParceiros } from "./contar-parceiros.js";
import { cadastroParceirosPorUf } from "./parceiros-por-uf.js";
import { cadastroParceirosPorCidade } from "./parceiros-por-cidade.js";
import { cadastroCidadesListar } from "./cidades-listar.js";
import { cadastroParceirosNovos } from "./parceiros-novos.js";
import { cadastroDetalharParceiro } from "./detalhar-parceiro.js";
import { cadastrosServicoBuscar } from "./servico-buscar.js";
import { cadastrosServicoContar } from "./contar-servicos.js";
import { cadastrosServicoListar } from "./servico-listar.js";
// writes (onda 2)
import { cadastrosMailActivityComplete } from "./mail-activity-complete.js";
import { cadastrosMailActivityCreate } from "./mail-activity-create.js";
import { cadastrosMailActivityUpdate } from "./mail-activity-update.js";
import { cadastrosResPartnerArchive } from "./res-partner-archive.js";
import { cadastrosResPartnerCategoryCreate } from "./res-partner-category-create.js";
import { cadastrosResPartnerCategorySetTags } from "./res-partner-category-set-tags.js";
import { cadastrosResPartnerDelete } from "./res-partner-delete.js";
import { cadastrosResPartnerUpdate } from "./res-partner-update.js";

export const cadastrosTools: ToolEntry[] = [
  // reads
  cadastroBuscarParceiro as ToolEntry,
  cadastroContarParceiros as ToolEntry,
  cadastroParceirosPorUf as ToolEntry,
  cadastroParceirosPorCidade as ToolEntry,
  cadastroCidadesListar as ToolEntry,
  cadastroParceirosNovos as ToolEntry,
  cadastroDetalharParceiro as ToolEntry,
  cadastrosServicoBuscar as ToolEntry,
  cadastrosServicoContar as ToolEntry,
  cadastrosServicoListar as ToolEntry,
  // writes (discriminadas em runtime por operation: "write")
  cadastrosMailActivityComplete as unknown as ToolEntry,
  cadastrosMailActivityCreate as unknown as ToolEntry,
  cadastrosMailActivityUpdate as unknown as ToolEntry,
  cadastrosResPartnerArchive as unknown as ToolEntry,
  cadastrosResPartnerCategoryCreate as unknown as ToolEntry,
  cadastrosResPartnerCategorySetTags as unknown as ToolEntry,
  cadastrosResPartnerDelete as unknown as ToolEntry,
  cadastrosResPartnerUpdate as unknown as ToolEntry,
];
