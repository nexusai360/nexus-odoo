// src/lib/reports/filtro-avancado.test.ts
import {
  compilarFiltro,
  isGrupo,
  grupoVazio,
  operadoresParaTipo,
  SEP_LISTA,
  type Condicao,
  type Grupo,
} from "./filtro-avancado";
import type { ColumnDef } from "@/components/charts/data-table";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Row = {
  nome: string;
  qtd: number;
  valor: number;
  ativo: string;
};

const COLS: ColumnDef<Row>[] = [
  { key: "nome", header: "Nome", tipo: "texto" },
  { key: "qtd", header: "Qtd", tipo: "numero" },
  { key: "valor", header: "Valor", tipo: "moeda" },
  { key: "ativo", header: "Ativo", tipo: "texto" },
];

const ROWS: Row[] = [
  { nome: "Esteira Alpha", qtd: 10, valor: 5000, ativo: "sim" },
  { nome: "Bike Beta", qtd: 5, valor: 2500, ativo: "não" },
  { nome: "Haltere Gamma", qtd: 100, valor: 50, ativo: "sim" },
  { nome: "Barra Delta", qtd: 0, valor: 0, ativo: "não" },
];

function cond(
  campo: string,
  operador: Condicao["operador"],
  valor: string,
): Condicao {
  return { campo, operador, valor };
}

function grupo(conector: "E" | "OU", ...itens: Grupo["itens"]): Grupo {
  return { conector, itens };
}

// ---------------------------------------------------------------------------
// isGrupo
// ---------------------------------------------------------------------------

describe("isGrupo", () => {
  it("retorna true para Grupo", () => {
    expect(isGrupo({ conector: "E", itens: [] })).toBe(true);
  });
  it("retorna false para Condicao", () => {
    expect(isGrupo({ campo: "nome", operador: "igual", valor: "x" })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , grupo vazio
// ---------------------------------------------------------------------------

describe("compilarFiltro , grupo vazio", () => {
  it("grupo vazio deixa passar todos as linhas", () => {
    const pred = compilarFiltro(grupo("E"), COLS);
    expect(ROWS.every(pred)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , operadores texto
// ---------------------------------------------------------------------------

describe("compilarFiltro , texto: igual", () => {
  it("filtra case-insensitive", () => {
    const pred = compilarFiltro(grupo("E", cond("ativo", "igual", "SIM")), COLS);
    const result = ROWS.filter(pred);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.ativo === "sim")).toBe(true);
  });
});

describe("compilarFiltro , texto: diferente", () => {
  it("exclui linha com valor igual", () => {
    const pred = compilarFiltro(
      grupo("E", cond("ativo", "diferente", "sim")),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.every((r) => r.ativo !== "sim")).toBe(true);
  });
});

describe("compilarFiltro , texto: contem", () => {
  it("case-insensitive substring", () => {
    const pred = compilarFiltro(grupo("E", cond("nome", "contem", "beta")), COLS);
    const result = ROWS.filter(pred);
    expect(result).toHaveLength(1);
    expect(result[0]?.nome).toBe("Bike Beta");
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , operadores numéricos
// ---------------------------------------------------------------------------

describe("compilarFiltro , numero: igual", () => {
  it("filtra por valor exato", () => {
    const pred = compilarFiltro(grupo("E", cond("qtd", "igual", "5")), COLS);
    const result = ROWS.filter(pred);
    expect(result).toHaveLength(1);
    expect(result[0]?.nome).toBe("Bike Beta");
  });
});

describe("compilarFiltro , numero: diferente", () => {
  it("exclui linha com valor igual", () => {
    const pred = compilarFiltro(grupo("E", cond("qtd", "diferente", "0")), COLS);
    const result = ROWS.filter(pred);
    expect(result.every((r) => r.qtd !== 0)).toBe(true);
    expect(result).toHaveLength(3);
  });
});

describe("compilarFiltro , numero: maior", () => {
  it("retorna linhas com qtd > 5", () => {
    const pred = compilarFiltro(grupo("E", cond("qtd", "maior", "5")), COLS);
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual(["Esteira Alpha", "Haltere Gamma"]);
  });
  it("valor não-numérico retorna false", () => {
    const pred = compilarFiltro(
      grupo("E", cond("qtd", "maior", "abc")),
      COLS,
    );
    expect(ROWS.every((r) => !pred(r))).toBe(true);
  });
});

describe("compilarFiltro , numero: menor", () => {
  it("retorna linhas com valor < 100", () => {
    const pred = compilarFiltro(grupo("E", cond("valor", "menor", "100")), COLS);
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual(["Haltere Gamma", "Barra Delta"]);
  });
});

describe("compilarFiltro , moeda: maior", () => {
  it("trata coluna moeda como numérica", () => {
    const pred = compilarFiltro(
      grupo("E", cond("valor", "maior", "1000")),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual(["Esteira Alpha", "Bike Beta"]);
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , conector E
// ---------------------------------------------------------------------------

describe("compilarFiltro , conector E", () => {
  it("exige que todas as condições sejam verdadeiras", () => {
    // ativo=sim (Esteira e Haltere) E valor > 1000 (Esteira 5000 e Bike 2500)
    // Intersecção: apenas Esteira Alpha
    const pred = compilarFiltro(
      grupo(
        "E",
        cond("ativo", "igual", "sim"),
        cond("valor", "maior", "1000"),
      ),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result).toHaveLength(1);
    expect(result[0]?.nome).toBe("Esteira Alpha");
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , conector OU
// ---------------------------------------------------------------------------

describe("compilarFiltro , conector OU", () => {
  it("passa se qualquer condição for verdadeira", () => {
    const pred = compilarFiltro(
      grupo(
        "OU",
        cond("qtd", "igual", "0"),
        cond("valor", "maior", "4000"),
      ),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual(["Esteira Alpha", "Barra Delta"]);
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , grupos aninhados
// ---------------------------------------------------------------------------

describe("compilarFiltro , grupos aninhados", () => {
  it("E com subgrupo OU", () => {
    // (ativo = sim) E (qtd = 10 OU qtd = 100)
    const pred = compilarFiltro(
      grupo(
        "E",
        cond("ativo", "igual", "sim"),
        grupo("OU", cond("qtd", "igual", "10"), cond("qtd", "igual", "100")),
      ),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual([
      "Esteira Alpha",
      "Haltere Gamma",
    ]);
  });

  it("OU com subgrupo E", () => {
    // (qtd = 0) OU (ativo = sim E valor > 4000)
    const pred = compilarFiltro(
      grupo(
        "OU",
        cond("qtd", "igual", "0"),
        grupo("E", cond("ativo", "igual", "sim"), cond("valor", "maior", "4000")),
      ),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual(["Esteira Alpha", "Barra Delta"]);
  });

  it("subgrupo vazio não exclui linha", () => {
    const pred = compilarFiltro(
      grupo("E", cond("ativo", "igual", "sim"), grupo("OU")),
      COLS,
    );
    // Subgrupo vazio = true → depende só da primeira condição
    const result = ROWS.filter(pred);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , campo vazio ignorado
// ---------------------------------------------------------------------------

describe("compilarFiltro , campo vazio ignorado", () => {
  it("condição com campo vazio sempre retorna true", () => {
    const pred = compilarFiltro(
      grupo("E", cond("", "igual", "qualquer")),
      COLS,
    );
    expect(ROWS.every(pred)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compilarFiltro , campo ausente nas colunas (tratado como texto)
// ---------------------------------------------------------------------------

describe("compilarFiltro , campo não declarado em columns", () => {
  it("trata campo desconhecido como texto", () => {
    const extRow = { ...ROWS[0]!, extra: "foo" } as Row & {
      extra: string;
    };
    const pred = compilarFiltro(
      grupo("E", cond("extra", "contem", "fo")),
      COLS,
    ) as (row: typeof extRow) => boolean;
    expect(pred(extRow)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 , helpers grupoVazio / operadoresParaTipo
// ---------------------------------------------------------------------------

describe("grupoVazio", () => {
  it("retorna { conector: E, itens: [] } novo a cada chamada", () => {
    expect(grupoVazio()).toEqual({ conector: "E", itens: [] });
    expect(grupoVazio()).not.toBe(grupoVazio());
  });
});

describe("operadoresParaTipo", () => {
  it("data e numero usam comparadores de ordem, sem contem/nao_contem", () => {
    expect(operadoresParaTipo("data")).toEqual([
      "igual",
      "diferente",
      "maior",
      "menor",
      "vazio",
      "preenchido",
    ]);
    expect(operadoresParaTipo("numero")).toEqual([
      "igual",
      "diferente",
      "maior",
      "menor",
      "vazio",
      "preenchido",
    ]);
    expect(operadoresParaTipo("moeda")).toEqual(operadoresParaTipo("numero"));
  });
  it("texto e tag usam contem/nao_contem, sem maior/menor", () => {
    expect(operadoresParaTipo("texto")).toEqual([
      "igual",
      "diferente",
      "contem",
      "nao_contem",
      "vazio",
      "preenchido",
    ]);
    expect(operadoresParaTipo("tag")).toEqual(operadoresParaTipo("texto"));
  });
});

// ---------------------------------------------------------------------------
// Fase 4 , guards de valor vazio (não zerar a tabela)
// ---------------------------------------------------------------------------

describe("compilarFiltro , guard de valor vazio", () => {
  it("contem com valor vazio é inerte (passa tudo)", () => {
    const pred = compilarFiltro(grupo("E", cond("nome", "contem", "")), COLS);
    expect(ROWS.every(pred)).toBe(true);
  });
  it("nao_contem com valor vazio é inerte (passa tudo)", () => {
    const pred = compilarFiltro(
      grupo("E", cond("nome", "nao_contem", "")),
      COLS,
    );
    expect(ROWS.every(pred)).toBe(true);
  });
  it("nao_contem com valor filtra corretamente", () => {
    const pred = compilarFiltro(
      grupo("E", cond("nome", "nao_contem", "beta")),
      COLS,
    );
    const result = ROWS.filter(pred);
    expect(result.map((r) => r.nome)).toEqual([
      "Esteira Alpha",
      "Haltere Gamma",
      "Barra Delta",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 , vazio / preenchido (trim, ignora valor)
// ---------------------------------------------------------------------------

describe("compilarFiltro , vazio / preenchido", () => {
  type LinhaObs = { obs: string | null };
  const colsObs: ColumnDef<LinhaObs>[] = [
    { key: "obs", header: "Obs", tipo: "texto" },
  ];
  it("vazio é verdadeiro para '', null e só espaços", () => {
    const pred = compilarFiltro(
      grupo("E", cond("obs", "vazio", "")),
      colsObs as unknown as ColumnDef<Row>[],
    ) as unknown as (r: LinhaObs) => boolean;
    expect(pred({ obs: "" })).toBe(true);
    expect(pred({ obs: null })).toBe(true);
    expect(pred({ obs: "   " })).toBe(true);
    expect(pred({ obs: "algo" })).toBe(false);
  });
  it("preenchido é o complemento de vazio", () => {
    const pred = compilarFiltro(
      grupo("E", cond("obs", "preenchido", "")),
      colsObs as unknown as ColumnDef<Row>[],
    ) as unknown as (r: LinhaObs) => boolean;
    expect(pred({ obs: "algo" })).toBe(true);
    expect(pred({ obs: "  " })).toBe(false);
    expect(pred({ obs: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 , coluna data (ISO lexicográfico = cronológico, não Number)
// ---------------------------------------------------------------------------

describe("compilarFiltro , coluna data", () => {
  type LinhaData = { prev: string };
  const colsData: ColumnDef<LinhaData>[] = [
    { key: "prev", header: "Prevista", tipo: "data" },
  ];
  const predData = (c: Condicao) =>
    compilarFiltro(
      grupo("E", c),
      colsData as unknown as ColumnDef<Row>[],
    ) as unknown as (r: LinhaData) => boolean;

  it("maior compara datas cronologicamente", () => {
    const p = predData(cond("prev", "maior", "2026-07-10"));
    expect(p({ prev: "2026-07-15" })).toBe(true);
    expect(p({ prev: "2026-07-01" })).toBe(false);
  });
  it("menor compara datas cronologicamente", () => {
    const p = predData(cond("prev", "menor", "2026-07-10"));
    expect(p({ prev: "2026-07-01" })).toBe(true);
    expect(p({ prev: "2026-12-31" })).toBe(false);
  });
  it("igual casa a data ISO exata", () => {
    const p = predData(cond("prev", "igual", "2026-07-15"));
    expect(p({ prev: "2026-07-15" })).toBe(true);
    expect(p({ prev: "2026-07-16" })).toBe(false);
  });
  it("data vazia não passa em maior/menor", () => {
    const p = predData(cond("prev", "maior", "2026-01-01"));
    expect(p({ prev: "" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fase 4 , esta_em_lista (membership OU dentro do campo)
// ---------------------------------------------------------------------------

describe("compilarFiltro , esta_em_lista", () => {
  type LinhaUf = { uf: string };
  const colsUf: ColumnDef<LinhaUf>[] = [
    { key: "uf", header: "UF", tipo: "texto" },
  ];
  it("casa qualquer valor da lista, case-insensitive", () => {
    const pred = compilarFiltro(
      grupo("E", cond("uf", "esta_em_lista", ["SP", "RJ"].join(SEP_LISTA))),
      colsUf as unknown as ColumnDef<Row>[],
    ) as unknown as (r: LinhaUf) => boolean;
    expect(pred({ uf: "SP" })).toBe(true);
    expect(pred({ uf: "rj" })).toBe(true);
    expect(pred({ uf: "ES" })).toBe(false);
  });
  it("lista vazia é inerte (passa tudo)", () => {
    const pred = compilarFiltro(
      grupo("E", cond("uf", "esta_em_lista", "")),
      colsUf as unknown as ColumnDef<Row>[],
    ) as unknown as (r: LinhaUf) => boolean;
    expect(pred({ uf: "qualquer" })).toBe(true);
  });
});
