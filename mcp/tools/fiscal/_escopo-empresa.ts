// mcp/tools/fiscal/_escopo-empresa.ts
// MOVIDO para mcp/lib/escopo.ts (F4 Apresentacao, Onda 3.2 , dominio-neutro).
// Mantido como re-export para nao quebrar os imports das tools fiscais; novas
// tools (qualquer dominio) devem importar direto de ../../lib/escopo.js.
export {
  montarEscopoEmpresa,
  type EscopoEmpresa,
  type EscopoResolvido,
} from "../../lib/escopo.js";
