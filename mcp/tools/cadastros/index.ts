// mcp/tools/cadastros/index.ts
// Índice do domínio cadastros. Exporta o array de tools.
import type { ToolEntry } from "../../catalog/types.js";
import { cadastroBuscarParceiro } from "./buscar-parceiro.js";
import { cadastroParceirosPorUf } from "./parceiros-por-uf.js";
import { cadastroContarParceiros } from "./contar-parceiros.js";
import { cadastrosServicoBuscar } from "./servico-buscar.js";
import { cadastrosServicoListar } from "./servico-listar.js";
import { cadastrosServicoContar } from "./contar-servicos.js";

export const cadastrosTools: ToolEntry[] = [
  cadastroBuscarParceiro as ToolEntry,
  cadastroParceirosPorUf as ToolEntry,
  cadastroContarParceiros as ToolEntry,
  cadastrosServicoBuscar as ToolEntry,
  cadastrosServicoListar as ToolEntry,
  cadastrosServicoContar as ToolEntry,
];
