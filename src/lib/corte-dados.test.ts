// Data de inicio das analises , helpers de clamp (fonte unica de toda leitura de historico).
import { describe, it, expect } from "@jest/globals";
import {
  janelaClampada,
  janelaDemandaAberta,
  PISO_DEMANDA_ABERTA,
  whereData,
  clampMesAoCorte,
  clampIsoAoCorte,
  CORTE_DADOS_PADRAO,
} from "./corte-dados";

const CORTE = "2026-03-16";

describe("janelaClampada", () => {
  it("sem periodo, o piso e o corte e o fim e aberto", () => {
    const j = janelaClampada(undefined, undefined, CORTE);
    expect(j.gte).toEqual(new Date("2026-03-16T00:00:00Z"));
    expect(j.lt.getUTCFullYear()).toBe(2100);
    expect(j.deIso).toBe(CORTE);
    expect(j.cortado).toBe(false);
  });

  it("pedido anterior ao corte e puxado para o corte e marcado como cortado", () => {
    const j = janelaClampada("2025-01-01", "2026-06-30", CORTE);
    expect(j.deIso).toBe(CORTE);
    expect(j.cortado).toBe(true);
  });

  it("pedido dentro da janela passa intacto", () => {
    const j = janelaClampada("2026-05-01", "2026-05-31", CORTE);
    expect(j.deIso).toBe("2026-05-01");
    expect(j.cortado).toBe(false);
  });

  it("a borda de fim e exclusiva: o dia 'ate' entra inteiro", () => {
    const j = janelaClampada("2026-05-01", "2026-05-31", CORTE);
    expect(j.lt).toEqual(new Date("2026-06-01T00:00:00Z"));
  });

  it("tolera timestamp ISO completo no lugar da data", () => {
    const j = janelaClampada("2026-05-01T10:30:00Z", "2026-05-31T23:59:59Z", CORTE);
    expect(j.deIso).toBe("2026-05-01");
    expect(j.lt).toEqual(new Date("2026-06-01T00:00:00Z"));
  });

  it("so `ate`, sem `de`: piso no corte assim mesmo", () => {
    const j = janelaClampada(undefined, "2026-04-30", CORTE);
    expect(j.deIso).toBe(CORTE);
    expect(j.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });
});

describe("whereData", () => {
  it("monta o where do campo pedido, ja clampado", () => {
    const w = whereData("dataVencimento", "2020-01-01", "2026-06-30", CORTE);
    expect(w).toEqual({
      dataVencimento: {
        gte: new Date("2026-03-16T00:00:00Z"),
        lt: new Date("2026-07-01T00:00:00Z"),
      },
    });
  });
});

describe("clampMesAoCorte", () => {
  it("mes anterior ao corte vira o mes do corte", () => {
    expect(clampMesAoCorte("2025-11", CORTE)).toBe("2026-03");
    expect(clampMesAoCorte("2026-01", CORTE)).toBe("2026-03");
  });
  it("mes do corte e posteriores passam intactos", () => {
    expect(clampMesAoCorte("2026-03", CORTE)).toBe("2026-03");
    expect(clampMesAoCorte("2026-07", CORTE)).toBe("2026-07");
  });
});

describe("clampIsoAoCorte", () => {
  it("usa o padrao 16/03/2026 quando ninguem configurou", () => {
    expect(CORTE_DADOS_PADRAO).toBe("2026-03-16");
    expect(clampIsoAoCorte("2024-01-01")).toBe(CORTE_DADOS_PADRAO);
  });
});

describe("janelaDemandaAberta , demanda a entregar nao grampeia no corte", () => {
  it("sem periodo => abre do piso (2000) ate o fim aberto", () => {
    const j = janelaDemandaAberta();
    expect(j.gte.toISOString().slice(0, 10)).toBe(PISO_DEMANDA_ABERTA);
    expect(j.lt.getUTCFullYear()).toBeGreaterThanOrEqual(2100);
  });

  it("com intervalo anterior ao corte NAO grampeia (recorta exato)", () => {
    const j = janelaDemandaAberta("2024-11-01", "2025-12-31");
    expect(j.gte.toISOString().slice(0, 10)).toBe("2024-11-01");
    expect(j.cortado).toBe(false); // piso 2000, entao nunca "cortado"
  });
});
