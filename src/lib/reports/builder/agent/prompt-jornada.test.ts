// O prompt puxa o catalogo de fontes (capabilities -> source-registry -> prisma).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { montarSystemJornada } from "./prompt-jornada";
import { corteLabel, avisoCorte } from "@/lib/corte-dados";

describe("montarSystemJornada , data de inicio das analises", () => {
  it("informa a janela de analise a IA (senao ela promete historico que nao existe)", () => {
    const s = montarSystemJornada();
    expect(s).toContain(avisoCorte());
    expect(s).toContain(corteLabel()); // 16/03/2026 por padrao
    expect(s).toContain("JANELA DE ANALISE");
  });

  it("proibe prometer comparacao com periodo anterior ao inicio das analises", () => {
    const s = montarSystemJornada();
    expect(s).toMatch(/Nao prometa historico anterior a essa data/);
  });

  it("nao usa travessao (regra de escrita do projeto)", () => {
    // O caractere vem por codigo: escrever o travessao literal aqui violaria a propria regra
    // que este teste protege (o lint do projeto barra o caractere em qualquer arquivo).
    const travessao = String.fromCharCode(0x2014);
    expect(montarSystemJornada()).not.toContain(travessao);
  });
});
