/**
 * Trava da identidade do Nex quanto a DATA DE INICIO DAS ANALISES.
 *
 * O texto antigo cravava "a base guarda apenas dados de 2026 em diante" , mentira assim que
 * o dono muda a data na tela (o padrao vigente e 2026-03-16, entao janeiro e fevereiro de
 * 2026 ja estao FORA da analise). A identidade nao pode carregar data nenhuma: ela ensina o
 * COMPORTAMENTO, e a data vigente chega por turno no item [Contexto] (montar-conversa).
 */

import { IDENTITY_BASE } from "./identity-base";

describe("IDENTITY_BASE , data de inicio das analises", () => {
  test("nao crava data/ano de corte no prompt estavel", () => {
    expect(IDENTITY_BASE).not.toContain("2026 em diante");
    expect(IDENTITY_BASE).not.toContain("apenas dados de 2026");
    // Nenhuma data ISO nem ano solto como piso hardcoded na secao do corte.
    expect(IDENTITY_BASE).not.toMatch(/anterior(es)? a 2026/i);
  });

  test("aponta o item [Contexto] como fonte da data vigente", () => {
    expect(IDENTITY_BASE).toContain("Data de início das análises");
    expect(IDENTITY_BASE).toContain("[Início das análises]");
    expect(IDENTITY_BASE).toContain("[Contexto]");
  });

  test("proibe a resposta falsa de 'nao ha registros' e manda avisar", () => {
    expect(IDENTITY_BASE).toContain("não há registros");
    expect(IDENTITY_BASE).toContain("PROIBIDO");
    // O dado existe no Odoo: a plataforma so nao o analisa.
    expect(IDENTITY_BASE).toContain("Odoo");
  });

  test("manda responder a partir da data quando o periodo pedido comeca antes", () => {
    expect(IDENTITY_BASE).toMatch(/começa antes/i);
    expect(IDENTITY_BASE).toMatch(/período efetivamente coberto/i);
  });
});
