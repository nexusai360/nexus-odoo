import { mapArmazemRow, resolverArmazem, DEFAULTS_ARMAZEM } from "../armazem";
import type { PrismaClient } from "../../../generated/prisma/client";

// Mocks ancorados no shape real de raw_estoque_local.data (fixtures-chave-forte.md B0):
// odoo_id=1, nome_unico="proprio", nome_completo="Próprio", tipo="S".
// Keys do data: id, nome, nome_completo, nome_unico, parent_path, local_superior_id,
// codigo_barras, nivel, tipo. NAO existe `code` (spec 4.1).

type Row = { odooId: number; data: Record<string, unknown> };

function fakePrisma(rows: Row[]): PrismaClient {
  const findUnique = jest.fn(async ({ where }: { where: { odooId: number } }) => {
    return rows.find((r) => r.odooId === where.odooId) ?? null;
  });
  // findMany ignora o where (filtro rawDeleted) e devolve a base mockada: os testes
  // controlam o conjunto via `rows`. Guardado para asserts de chamada.
  const findMany = jest.fn(async () => rows);
  return {
    rawEstoqueLocal: { findUnique, findMany },
  } as unknown as PrismaClient;
}

const ROW_PROPRIO: Row = {
  odooId: 1,
  data: {
    id: 1,
    nome: "Próprio",
    nome_completo: "Próprio",
    nome_unico: "proprio",
    parent_path: "1/",
    local_superior_id: false,
    codigo_barras: false,
    nivel: 0,
    tipo: "S",
  },
};

describe("mapArmazemRow", () => {
  it("extrai as keys do data Json para o shape da candidata", () => {
    const c = mapArmazemRow(ROW_PROPRIO);
    expect(c).toEqual({
      odooId: 1,
      nome: "Próprio",
      nomeCompleto: "Próprio",
      nomeUnico: "proprio",
      parentPath: "1/",
      localSuperiorId: null,
      nivel: 0,
      tipo: "S",
    });
  });

  it("codigo_barras false/null nao vira campo (ignorado, sem virar string 'false')", () => {
    const c = mapArmazemRow(ROW_PROPRIO) as unknown as Record<string, unknown>;
    expect("codigoBarras" in c).toBe(false);
  });

  it("local_superior_id como tupla Odoo [id, label] extrai so o id", () => {
    const c = mapArmazemRow({ odooId: 5, data: { local_superior_id: [1, "Próprio"] } });
    expect(c.localSuperiorId).toBe(1);
  });

  it("data com keys ausentes => campos null/coerentes", () => {
    const c = mapArmazemRow({ odooId: 9, data: {} });
    expect(c.odooId).toBe(9);
    expect(c.nome).toBeNull();
    expect(c.nomeCompleto).toBeNull();
    expect(c.nomeUnico).toBeNull();
    expect(c.localSuperiorId).toBeNull();
    expect(c.tipo).toBeNull();
  });
});

describe("ramos exatos", () => {
  it("ref = odooId string existente => unica score 1 (via findUnique)", async () => {
    const prisma = fakePrisma([ROW_PROPRIO]);
    const r = await resolverArmazem(prisma, "1");
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.entidade.odooId).toBe(1);
      expect(r.score).toBe(1);
    }
    expect(prisma.rawEstoqueLocal.findUnique).toHaveBeenCalledWith({ where: { odooId: 1 } });
  });

  it("ref = nome_unico exato ('proprio') => unica", async () => {
    const prisma = fakePrisma([ROW_PROPRIO]);
    const r = await resolverArmazem(prisma, "proprio");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.nomeUnico).toBe("proprio");
  });

  it("nome_unico exato e case/acento-insensitive", async () => {
    const prisma = fakePrisma([ROW_PROPRIO]);
    const r = await resolverArmazem(prisma, "Proprio");
    expect(r.status).toBe("unica");
  });

  it("ref = odooId inexistente => NAO retorna unica aqui (cai, vira nenhuma)", async () => {
    const prisma = fakePrisma([ROW_PROPRIO]);
    const r = await resolverArmazem(prisma, "99999");
    // id numerico inexistente nao pode virar match fuzzy de nome (CS4)
    expect(r.status).toBe("nenhuma");
  });
});

describe("ramo fuzzy hierarquico", () => {
  const ESTOQUE_SP: Row = {
    odooId: 10,
    data: {
      nome: "Estoque SP",
      nome_completo: "Próprio / Filial SP / Estoque SP",
      nome_unico: "estoque_sp",
      parent_path: "1/2/10/",
      local_superior_id: [2, "Filial SP"],
      nivel: 2,
      tipo: "I",
    },
  };
  const ESTOQUE_RJ: Row = {
    odooId: 11,
    data: {
      nome: "Estoque RJ",
      nome_completo: "Próprio / Filial RJ / Estoque RJ",
      nome_unico: "estoque_rj",
      parent_path: "1/3/11/",
      local_superior_id: [3, "Filial RJ"],
      nivel: 2,
      tipo: "I",
    },
  };

  it("nome_completo aproximado, 1 acima do limiar com folga => unica", async () => {
    const prisma = fakePrisma([ROW_PROPRIO, ESTOQUE_SP, ESTOQUE_RJ]);
    const r = await resolverArmazem(prisma, "Próprio / Filial SP / Estoque SP");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(10);
  });

  it("varios proximos => ambigua criterio nome, ordenadas por score, length <= topN", async () => {
    const extras: Row[] = Array.from({ length: 5 }, (_, i) => ({
      odooId: 100 + i,
      data: {
        nome: `Estoque Filial ${i}`,
        nome_completo: `Próprio / Estoque Filial ${i}`,
        nome_unico: `estoque_filial_${i}`,
        parent_path: `1/${100 + i}/`,
        nivel: 1,
        tipo: "I",
      },
    }));
    const prisma = fakePrisma([ROW_PROPRIO, ...extras]);
    const r = await resolverArmazem(prisma, "Estoque Filial");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("nome");
      expect(r.candidatas.length).toBeLessThanOrEqual(DEFAULTS_ARMAZEM.topN);
      // ordenadas por score desc
      for (let i = 1; i < r.candidatas.length; i++) {
        expect(r.candidatas[i - 1].score).toBeGreaterThanOrEqual(r.candidatas[i].score);
      }
    }
  });

  it("nome que so casa o ULTIMO segmento do nome_completo (armadilha 4.1a parent_path) => casa", async () => {
    // "Estoque SP" nao casa o nome_completo inteiro (Próprio / Filial SP / Estoque SP),
    // mas casa o ultimo segmento. O ramo hierarquico tem que pegar isso.
    const prisma = fakePrisma([ROW_PROPRIO, ESTOQUE_SP]);
    const r = await resolverArmazem(prisma, "Estoque SP");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(10);
  });

  it("inexistente => nenhuma", async () => {
    const prisma = fakePrisma([ROW_PROPRIO, ESTOQUE_SP, ESTOQUE_RJ]);
    const r = await resolverArmazem(prisma, "Galpao Inexistente Zzz");
    expect(r.status).toBe("nenhuma");
  });
});

describe("filtros", () => {
  // Nome generico "Estoque" (folha identica) repetido em filiais diferentes: o
  // desempate so sai pelos filtros (tipo / local_superior_id).
  const GENERICO = (odooId: number, tipo: string, sup: number): Row => ({
    odooId,
    data: {
      nome: "Estoque",
      nome_completo: `Próprio / Filial ${sup} / Estoque`,
      nome_unico: `estoque_${odooId}`,
      parent_path: `1/${sup}/${odooId}/`,
      local_superior_id: [sup, "Sup"],
      nivel: 2,
      tipo,
    },
  });

  it("nome generico com varios matches => ambigua", async () => {
    const prisma = fakePrisma([GENERICO(20, "I", 2), GENERICO(21, "I", 3)]);
    const r = await resolverArmazem(prisma, "Estoque");
    expect(r.status).toBe("ambigua");
  });

  it("opcoes.filtros.tipo desempata para unica", async () => {
    const prisma = fakePrisma([GENERICO(20, "I", 2), GENERICO(21, "S", 3)]);
    const r = await resolverArmazem(prisma, "Estoque", { filtros: { tipo: "S" } });
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(21);
  });

  it("opcoes.filtros.local_superior_id desempata para unica", async () => {
    const prisma = fakePrisma([GENERICO(20, "I", 2), GENERICO(21, "I", 3)]);
    const r = await resolverArmazem(prisma, "Estoque", { filtros: { local_superior_id: 3 } });
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.odooId).toBe(21);
  });
});
