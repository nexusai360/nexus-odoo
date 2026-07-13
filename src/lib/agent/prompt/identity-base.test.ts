/**
 * Trava da identidade do Nex quanto a DATA DE INICIO DAS ANALISES.
 *
 * O texto antigo cravava "a base guarda apenas dados de 2026 em diante" , mentira assim que
 * o dono muda a data na tela (o padrao vigente e 2026-03-16, entao janeiro e fevereiro de
 * 2026 ja estao FORA da analise). A identidade nao pode carregar data nenhuma: ela ensina o
 * COMPORTAMENTO, e a data vigente chega por turno no item [Contexto] (montar-conversa).
 *
 * A REGRA em si saiu daqui (2026-07-13): ela vive em `regra-corte.ts` e e anexada SEMPRE
 * pelo composeSystemPrompt, porque o identityBase e sobrescrito pelo banco quando o admin
 * salva o prompt na tela , e ai a regra sumia. As asserções sobre o CONTEUDO da regra
 * estao em `regra-corte.test.ts`; aqui fica so o que a identidade nao pode ter.
 */

import { IDENTITY_BASE } from "./identity-base";

describe("IDENTITY_BASE , data de inicio das analises", () => {
  test("nao crava data/ano de corte no prompt estavel", () => {
    expect(IDENTITY_BASE).not.toContain("2026 em diante");
    expect(IDENTITY_BASE).not.toContain("apenas dados de 2026");
    // Nenhuma data ISO nem ano solto como piso hardcoded na secao do corte.
    expect(IDENTITY_BASE).not.toMatch(/anterior(es)? a 2026/i);
  });

  test("nao carrega mais a regra do corte (ela e anexada pelo compose, fora do texto editavel)", () => {
    expect(IDENTITY_BASE).not.toContain("Data de início das análises");
  });
});
