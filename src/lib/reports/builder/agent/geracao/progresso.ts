// src/lib/reports/builder/agent/geracao/progresso.ts
// Fonte UNICA da barra de % e das frases girando da tela de espera. As faixas sao
// PESADAS PELA DURACAO esperada: as fases LLM (blueprint/revisao) dominam o trajeto;
// build/validacao (sem LLM) sao caudas curtas , a barra nao rasteja e depois salta.
// Frases especificas por fase (nada de "Montando o relatorio" seco), sem termos
// tecnicos (o usuario nunca ve blueprint/spec/plano).
import type { FaseGeracao } from "./types";

export const FASES_ORDEM: FaseGeracao[] = ["blueprint", "build", "validacao"];

/** Faixa de % de cada fase (de..ate). A fase blueprint e a que PENSA (1 chamada de
 *  raciocinio alto), entao domina a barra; build/validacao sao caudas curtas. */
export const FAIXAS: Record<FaseGeracao, { de: number; ate: number }> = {
  blueprint: { de: 5, ate: 90 },
  build: { de: 90, ate: 97 },
  validacao: { de: 97, ate: 100 },
};

/** Frases amigaveis e especificas por fase (giram durante a fase). */
export const FRASES: Record<FaseGeracao, string[]> = {
  blueprint: [
    "Entendendo o que realmente importa no seu pedido",
    "Escolhendo os indicadores que valem destaque",
    "Decidindo o gráfico certo para cada número",
    "Montando a história do relatório (panorama, comparação, detalhe)",
    "Cortando o que é redundante para ficar limpo",
  ],
  build: ["Encaixando as seções na ordem certa", "Dando os retoques finais"],
  validacao: ["Conferindo os últimos detalhes"],
};

export function pctBase(fase: FaseGeracao): number {
  return FAIXAS[fase].de;
}
export function pctAlvo(fase: FaseGeracao): number {
  return FAIXAS[fase].ate;
}
export function frasesDe(fase: FaseGeracao): string[] {
  return FRASES[fase];
}
