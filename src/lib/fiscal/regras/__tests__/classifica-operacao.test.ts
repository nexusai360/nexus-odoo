// src/lib/fiscal/regras/__tests__/classifica-operacao.test.ts
import { classificaOperacao } from "../classifica-operacao";

const EXTERNO = { participanteId: 111, participanteNome: "Cliente Externo Ltda" };
const GRUPO = new Set<number>([999]); // participante 999 = empresa do grupo (injetado)
const SEM_GRUPO = new Set<number>();

describe("classificaOperacao , venda externa x intragrupo x demanda", () => {
  it("venda 5102 a cliente externo: receita e demanda", () => {
    const r = classificaOperacao({ cfop: "5102", ...EXTERNO }, SEM_GRUPO);
    expect(r.categoria).toBe("venda");
    expect(r.ehReceita).toBe(true);
    expect(r.intragrupo).toBe(false);
    expect(r.entraFaturamentoVenda).toBe(true);
    expect(r.entraDemanda).toBe(true);
  });

  it("venda 5102 para empresa do GRUPO: intragrupo, nao entra faturamento nem demanda", () => {
    const r = classificaOperacao(
      { cfop: "5102", participanteId: 999, participanteNome: "Jht SP Comercio" },
      GRUPO,
    );
    expect(r.intragrupo).toBe(true);
    expect(r.entraFaturamentoVenda).toBe(false);
    expect(r.entraDemanda).toBe(false);
  });

  it("transferencia 6152: nao e receita, nao e demanda", () => {
    const r = classificaOperacao({ cfop: "6152", ...EXTERNO }, SEM_GRUPO);
    expect(r.categoria).toBe("transferencia");
    expect(r.entraFaturamentoVenda).toBe(false);
    expect(r.entraDemanda).toBe(false);
  });

  it("venda futura 5922 (simples_faturamento): NAO e receita, MAS entra na demanda", () => {
    const r = classificaOperacao({ cfop: "5922", ...EXTERNO }, SEM_GRUPO);
    expect(r.categoria).toBe("simples_faturamento");
    expect(r.ehReceita).toBe(false);
    expect(r.entraFaturamentoVenda).toBe(false);
    expect(r.entraDemanda).toBe(true);
  });

  it("bonificacao 5910: fora de faturamento e de demanda", () => {
    const r = classificaOperacao({ cfop: "5910", ...EXTERNO }, SEM_GRUPO);
    expect(r.entraFaturamentoVenda).toBe(false);
    expect(r.entraDemanda).toBe(false);
  });

  it("sem cfop: nao entra em nada (linha de gap)", () => {
    const r = classificaOperacao({ cfop: null, ...EXTERNO }, SEM_GRUPO);
    expect(r.categoria).toBe("sem_cfop");
    expect(r.entraFaturamentoVenda).toBe(false);
    expect(r.entraDemanda).toBe(false);
  });
});
