/**
 * T2 , Início do dia no fuso de São Paulo (corte do teto diário).
 *
 * O teto diário cortava à meia-noite do SERVIDOR (containers em UTC), ou seja,
 * às 21h no Brasil: quem usava o Nex à noite tinha o contador zerado no meio da
 * conversa. O corte agora é a meia-noite de America/Sao_Paulo (UTC-3 fixo, sem
 * horário de verão desde 2019).
 */
import { inicioDoDiaEmSaoPaulo } from "./dia-local";

describe("inicioDoDiaEmSaoPaulo", () => {
  it("de madrugada em UTC (22h30 do dia anterior no BR), o dia BR ainda é o anterior", () => {
    // 2026-07-10T01:30Z = 2026-07-09 22:30 em São Paulo.
    const agora = new Date("2026-07-10T01:30:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(agora).toISOString()).toBe("2026-07-09T03:00:00.000Z");
  });

  it("à tarde, o início do dia é a meia-noite BR de hoje (03:00Z)", () => {
    // 2026-07-10T15:00Z = 2026-07-10 12:00 em São Paulo.
    const agora = new Date("2026-07-10T15:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(agora).toISOString()).toBe("2026-07-10T03:00:00.000Z");
  });

  it("exatamente à meia-noite BR, o corte é o próprio instante", () => {
    const meiaNoiteBr = new Date("2026-07-10T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(meiaNoiteBr).toISOString()).toBe("2026-07-10T03:00:00.000Z");
  });

  it("um instante antes da meia-noite BR ainda pertence ao dia anterior", () => {
    const quaseMeiaNoite = new Date("2026-07-10T02:59:59.999Z");
    expect(inicioDoDiaEmSaoPaulo(quaseMeiaNoite).toISOString()).toBe("2026-07-09T03:00:00.000Z");
  });
});
