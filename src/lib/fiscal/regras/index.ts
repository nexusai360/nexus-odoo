// src/lib/fiscal/regras/index.ts
// API publica da Tabela de Regras fiscal (reusada pelas Fases 2-4).
export type { CategoriaGerencial, RegraOperacao } from "./tipos";
export { ROTULO_CATEGORIA } from "./tipos";
export { extrairCfop } from "./extrair-cfop";
export { MAPA_CFOP } from "./cfop-mapa";
export { regraPorPrefixo } from "./cfop-prefixo";
export { classificarCfop } from "./classificar";
