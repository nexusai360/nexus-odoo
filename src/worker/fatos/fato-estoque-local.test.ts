import { mapLocalRow, buildEmpresasDoGrupo } from "./fato-estoque-local";

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

  it("classifica o local intercompany como fisico quando o dono e empresa do grupo", () => {
    // Local 285 real: Jds Matriz DF guardando mercadoria da Jht SP (mesmo grupo).
    const intercompany = mapLocalRow(
      raw({
        id: 285,
        nome_completo: "Terceiros / Jds Comércio - Matriz DF - Jht SP Comércio",
        local_superior_id: [2, "Terceiros"],
        proprietario_local_id: [15, "Jht SP Comércio - Matriz DF"],
      }),
      new Set([15]),
    );
    expect(intercompany.classificacao).toBe("fisico");
  });

  it("mantem fora o local de Terceiros de um cliente de verdade", () => {
    const cliente = mapLocalRow(
      raw({
        id: 249,
        nome_completo: "Terceiros / Jds Comércio - Condominio Manhattan",
        local_superior_id: [2, "Terceiros"],
        proprietario_local_id: [8001, "Condominio Manhattan"],
      }),
      new Set([15]),
    );
    expect(cliente.classificacao).toBe("fora");
  });

  it("sem o conjunto de empresas do grupo, Terceiros continua fora (fail-closed)", () => {
    const semConjunto = mapLocalRow(
      raw({
        id: 285,
        nome_completo: "Terceiros / Jds Comércio - Matriz DF - Jht SP Comércio",
        proprietario_local_id: [15, "Jht SP Comércio - Matriz DF"],
      }),
    );
    expect(semConjunto.classificacao).toBe("fora");
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

describe("buildEmpresasDoGrupo", () => {
  it("junta os participantes marcados como empresa do grupo", () => {
    const conjunto = buildEmpresasDoGrupo([
      { data: { id: 15, eh_empresa: true, tipo_pessoa: "J" } },
      { data: { id: 11, eh_empresa: true, tipo_pessoa: "J" } },
      { data: { id: 8001, eh_empresa: false, tipo_pessoa: "J" } },
    ]);
    expect([...conjunto].sort()).toEqual([11, 15]);
  });

  it("ignora pessoa fisica marcada como empresa (cadastro errado no Odoo)", () => {
    // Caso real: o participante 990 (CPF, pessoa fisica) esta com eh_empresa=true.
    // Se entrasse, o local de Terceiros dele viraria estoque proprio.
    const conjunto = buildEmpresasDoGrupo([
      { data: { id: 990, eh_empresa: true, tipo_pessoa: "F" } },
    ]);
    expect(conjunto.size).toBe(0);
  });

  it("ignora linha sem id valido", () => {
    expect(
      buildEmpresasDoGrupo([{ data: { eh_empresa: true, tipo_pessoa: "J" } }]).size,
    ).toBe(0);
  });
});
