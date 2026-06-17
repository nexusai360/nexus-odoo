import { describe, it, expect } from "@jest/globals";
import {
  buildRodadaNamesFromMarkers,
  channelToOrigem,
  R8_ANCHOR_MARKER,
  ORIGEM_AGENTE_NEX,
  ORIGEM_AGENTE_NEX_BUBBLE,
  ORIGEM_AGENTE_NEX_WHATSAPP,
  ORIGEM_PLAYGROUND,
  ORIGEM_BACKTEST,
  ORIGEM_LABELS,
} from "./rodada-labels";

// Markers reais da pericia 2026-06-01 (ordem cronologica).
const PRE_R8 = [
  "[AUDIT-POS-2026-05-26T03-43-05]",
  "[AUDIT-POS-2026-05-26T12-12-53]",
  "[AUDIT-POS-2026-05-26T16-59-45]",
];
const R8 = R8_ANCHOR_MARKER; // 2026-05-26T17-21-31
const R9 = "[AUDIT-POS-2026-05-26T18-01-27]";
const R23 = "[AUDIT-POS-2026-05-28T10-12-30]";
const R24 = "[AUDIT-POS-2026-05-31T18-18-13]";

describe("buildRodadaNamesFromMarkers", () => {
  it("ancora R8 no marker oficial e numera sequencialmente ate R24", () => {
    const all = [...PRE_R8, R8, R9, R23, R24];
    const map = buildRodadaNamesFromMarkers(all);
    expect(map.get(R8)).toBe("Rodada 8");
    expect(map.get(R9)).toBe("Rodada 9");
    // Com so esses 4 markers de rodada presentes, a numeracao e' por indice:
    // R8=0, R9=1, R23=2, R24=3 -> Rodada 8,9,10,11. O conjunto REAL (17 markers
    // com avaliacao) produz R8..R24; aqui validamos a ancora + ordem.
    expect(map.get(R23)).toBe("Rodada 10");
    expect(map.get(R24)).toBe("Rodada 11");
  });

  it("numera a rodada recente como R24 quando recebe os 17 markers reais", () => {
    // 17 markers de R8 a R24 (timestamps crescentes), como vem do banco
    // (so conversas com avaliacao). Index 0 -> R8, index 16 -> R24.
    const reais = [
      "2026-05-26T17-21-31", "2026-05-26T18-01-27", "2026-05-26T18-05-49",
      "2026-05-26T21-58-49", "2026-05-26T22-44-49", "2026-05-27T01-32-20",
      "2026-05-27T02-47-42", "2026-05-27T03-33-55", "2026-05-27T04-13-16",
      "2026-05-27T15-10-40", "2026-05-27T16-16-15", "2026-05-27T21-50-50",
      "2026-05-27T22-43-15", "2026-05-28T02-43-02", "2026-05-28T03-20-54",
      "2026-05-28T10-12-30", "2026-05-31T18-18-13",
    ].map((t) => `[AUDIT-POS-${t}]`);
    const map = buildRodadaNamesFromMarkers(reais);
    expect(map.get("[AUDIT-POS-2026-05-26T17-21-31]")).toBe("Rodada 8");
    expect(map.get("[AUDIT-POS-2026-05-28T10-12-30]")).toBe("Rodada 23");
    expect(map.get("[AUDIT-POS-2026-05-31T18-18-13]")).toBe("Rodada 24");
  });

  it("rotula markers pre-R8 como Teste, nao como rodada", () => {
    const map = buildRodadaNamesFromMarkers([...PRE_R8, R8, R24]);
    for (const m of PRE_R8) {
      expect(map.get(m)).toMatch(/^Teste /);
      expect(map.get(m)).not.toMatch(/^Rodada /);
    }
  });

  it("preserva labels de origens virtuais", () => {
    const map = buildRodadaNamesFromMarkers([R8, ORIGEM_AGENTE_NEX, ORIGEM_PLAYGROUND]);
    expect(map.get(ORIGEM_AGENTE_NEX)).toBe("Agente Nex");
    expect(map.get(ORIGEM_PLAYGROUND)).toBe("Playground");
  });

  it("rotula a origem Backtest", () => {
    const map = buildRodadaNamesFromMarkers([R8, ORIGEM_BACKTEST]);
    expect(map.get(ORIGEM_BACKTEST)).toBe("Backtest");
  });
});

describe("channelToOrigem", () => {
  it("in_app vira Agente Nex Bubble e whatsapp vira Agente Nex WhatsApp (F5 E)", () => {
    expect(channelToOrigem("in_app")).toBe(ORIGEM_AGENTE_NEX_BUBBLE);
    expect(channelToOrigem("whatsapp")).toBe(ORIGEM_AGENTE_NEX_WHATSAPP);
  });
  it("labels das duas origens novas (F5 E)", () => {
    expect(ORIGEM_LABELS[ORIGEM_AGENTE_NEX_BUBBLE]).toBe("Agente Nex · Bubble");
    expect(ORIGEM_LABELS[ORIGEM_AGENTE_NEX_WHATSAPP]).toBe("Agente Nex · WhatsApp");
  });
  it("playground vira Playground", () => {
    expect(channelToOrigem("playground")).toBe(ORIGEM_PLAYGROUND);
  });
  it("backtest vira Backtest (replay fora do uso real)", () => {
    expect(channelToOrigem("backtest")).toBe(ORIGEM_BACKTEST);
  });
  it("null/desconhecido vira null", () => {
    expect(channelToOrigem(null)).toBeNull();
    expect(channelToOrigem("xpto")).toBeNull();
  });
});
