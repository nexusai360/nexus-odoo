// src/lib/reports/builder/agent/geracao/progresso.ts
// Fonte UNICA da barra de % e das frases girando da tela de espera. As faixas sao
// PESADAS PELA DURACAO esperada: as fases LLM (compositor/critico) dominam o trajeto;
// amostra/build/validacao (sem LLM, ou I/O curto) sao caudas curtas. Frases sem termos
// tecnicos (o usuario nunca ve plano/compositor/critico).
import type { FaseGeracao } from "./types";

export const FASES_ORDEM: FaseGeracao[] = [
  "compositor",
  "amostra",
  "critico",
  "build",
  "validacao",
];

/** Faixa de % de cada fase (de..ate). Compositor e critico (LLM) dominam a barra. */
export const FAIXAS: Record<FaseGeracao, { de: number; ate: number }> = {
  compositor: { de: 5, ate: 55 },
  amostra: { de: 55, ate: 62 },
  critico: { de: 62, ate: 90 },
  build: { de: 90, ate: 97 },
  validacao: { de: 97, ate: 100 },
};

/** Frases amigaveis e especificas por fase (giram durante a fase). */
export const FRASES: Record<FaseGeracao, string[]> = {
  compositor: [
    "Entendendo o que realmente importa no seu pedido",
    "Escolhendo os indicadores que valem destaque",
    "Decidindo o gráfico certo para cada número",
    "Montando a história do relatório (panorama, comparação, detalhe)",
  ],
  amostra: ["Olhando os números de verdade para acertar a escolha"],
  critico: [
    "Conferindo se cada parte responde ao que você pediu",
    "Ajustando o que pode ficar mais claro",
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
