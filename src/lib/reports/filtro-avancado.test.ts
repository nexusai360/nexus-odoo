// src/lib/reports/filtro-avancado.test.ts
import {
  compilarFiltro,
  isGrupo,
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
