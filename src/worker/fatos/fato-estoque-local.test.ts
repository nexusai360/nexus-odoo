import { mapLocalRow } from "./fato-estoque-local";

/** Linha crua de raw_estoque_local, no formato que o Odoo devolve. */
function raw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 11,
    nome: "Jds - Matriz DF",
    nome_completo: "Próprio / Jds - Matriz DF",
    tipo: "A",
    nivel: 2,
    local_superior_id: [1, "Próprio"],
    estoque_em_maos: true,
    calcula_extrato_saldo: true,
    proprietario_local_id: [7, "Jds Comércio"],
    ...over,
  };
}

describe("mapLocalRow", () => {
  it("mapeia um deposito real e o classifica como fisico", () => {
    expect(mapLocalRow(raw())).toEqual({
      odooId: 11,
      nome: "Jds - Matriz DF",
      nomeCompleto: "Próprio / Jds - Matriz DF",
      tipo: "A",
      nivel: 2,
      localSuperiorId: 1,
      estoqueEmMaos: true,
      calculaExtratoSaldo: true,
      temProprietario: true,
      classificacao: "fisico",
    });
  });

  it("le o proprietario como presente so quando o many2one vem preenchido", () => {
    // No Odoo, many2one vazio vem como `false`, nao como null.
    expect(mapLocalRow(raw({ proprietario_local_id: false })).temProprietario).toBe(
      false,
    );
    expect(mapLocalRow(raw({ proprietario_local_id: false })).classificacao).toBe(
      "fora",
    );
  });

  it("classifica a assistencia tecnica como fora (nao calcula extrato de saldo)", () => {
    const astec = mapLocalRow(
      raw({
        id: 29,
        nome: "ASTEC DF",
        nome_completo: "Próprio / ASTEC DF",
        calcula_extrato_saldo: false,
      }),
    );
    expect(astec.classificacao).toBe("fora");
  });

  it("classifica a demonstracao no cliente", () => {
    const demo = mapLocalRow(
      raw({
        id: 300,
        nome_completo: "Terceiros / Demonstração / Condominio Manhattan",
        estoque_em_maos: false,
      }),
    );
    expect(demo.classificacao).toBe("demonstracao");
  });

  it("classifica o no sintetico Virtual como fora", () => {
    const virtual = mapLocalRow(
      raw({
        id: 3,
        nome: "Virtual",
        nome_completo: "Virtual",
        tipo: "S",
        nivel: 1,
        local_superior_id: false,
        estoque_em_maos: false,
        calcula_extrato_saldo: false,
      }),
    );
    expect(virtual.classificacao).toBe("fora");
    expect(virtual.localSuperiorId).toBeNull();
    expect(virtual.tipo).toBe("S");
  });

  it("trata campos ausentes sem quebrar (fail-closed)", () => {
    const vazio = mapLocalRow({ id: 999 });
    expect(vazio).toMatchObject({
      odooId: 999,
      nome: null,
      nomeCompleto: null,
      tipo: null,
      nivel: null,
      localSuperiorId: null,
      estoqueEmMaos: false,
      calculaExtratoSaldo: false,
      temProprietario: false,
      classificacao: "fora",
    });
  });
});
