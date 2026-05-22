// mcp/tools/cadastros/index.ts
// Índice do domínio cadastros. Exporta o array de tools (3 tools — D.7).
import type { ToolEntry } from "../../catalog/types.js";
import { cadastroBuscarParceiro } from "./buscar-parceiro.js";
import { cadastroParceirosPorUf } from "./parceiros-por-uf.js";
import { cadastroContarParceiros } from "./contar-parceiros.js";
import { cadastrosServicoBuscar } from "./servico-buscar.js";
import { cadastrosServicoListar } from "./servico-listar.js";

export const cadastrosTools: ToolEntry[] = [
  cadastroBuscarParceiro as ToolEntry,
  cadastroParceirosPorUf as ToolEntry,
  cadastroContarParceiros as ToolEntry,
  cadastrosServicoBuscar as ToolEntry,
  cadastrosServicoListar as ToolEntry,
];
