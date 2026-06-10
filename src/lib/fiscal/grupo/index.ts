// src/lib/fiscal/grupo/index.ts
// API publica da camada de grupo economico (marcacao intercompany). Reusada pela Fase 3.
export { RAIZES_GRUPO } from "./raizes-cnpj";
export { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "./cnpj";
export { carregarParticipantesGrupo, ehNotaIntragrupo } from "./participantes-grupo";
