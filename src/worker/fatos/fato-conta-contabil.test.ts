// src/worker/fatos/fato-conta-contabil.test.ts
import { mapContaContabilRow, rebuildFatoContaContabil } from "./fato-conta-contabil";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

// ---------------------------------------------------------------------------
// Fixtures — formato real de contabil.conta (discovery O.2/O.3)
// Fields confirmados contra raw_contabil_conta real (934 linhas):
//   id, codigo, nome, tipo (S/A), nivel, natureza, conta_superior_id (M2O),
//   parent_path, caracteristica_saldo, eh_redutora
// Conta pai (conta_superior_id): M2O = [id, nome] ou false (conta raiz)
// ---------------------------------------------------------------------------

const RAW_CONTA_RAIZ = {
  id: 4,
  codigo: "1",
  nome: "ATIVO",
  tipo: "S",
  nivel: 1,
  natureza: "01",
  conta_superior_id: false,    // conta raiz — sem pai
  parent_path: "4/",
  caracteristica_saldo: "D",
  eh_redutora: false,
};

const RAW_CONTA_FILHA = {
  id: 5,
  codigo: "1.1",
  nome: "ATIVO CIRCULANTE",
  tipo: "S",
  nivel: 2,
  natureza: "01",
  conta_superior_id: [4, "1 - ATIVO [D]"],  // M2O com pai
  parent_path: "4/5/",
  caracteristica_saldo: "D",
  eh_redutora: false,
};

const RAW_CONTA_ANALITICA = {
  id: 100,
  codigo: "1.1.1",
  nome: "CAIXA E EQUIVALENTES",
  tipo: "A",
  nivel: 3,
  natureza: "01",
  conta_superior_id: [5, "1.1 - ATIVO CIRCULANTE"],
  parent_path: "4/5/100/",
  caracteristica_saldo: "D",
  eh_redutora: false,
};

const RAW_CONTA_REDUTORA = {
  id: 200,
  codigo: "1.2.99",
  nome: "(-) DEPRECIAÇÃO ACUMULADA",
  tipo: "A",
  nivel: 3,
  natureza: "01",
  conta_superior_id: [150, "1.2 - ATIVO NÃO CIRCULANTE"],
  parent_path: "4/150/200/",
  caracteristica_saldo: "C",
  eh_redutora: true,
};

// ---------------------------------------------------------------------------
// mapContaContabilRow
// ---------------------------------------------------------------------------

describe("mapContaContabilRow", () => {
  it("mapeia conta raiz corretamente (conta_superior_id=false → null)", () => {
    const result = mapContaContabilRow(RAW_CONTA_RAIZ);
    expect(result.odooId).toBe(4);
    expect(result.codigo).toBe("1");
    expect(result.nome).toBe("ATIVO");
    expect(result.tipo).toBe("S");
    expect(result.nivel).toBe(1);
    expect(result.natureza).toBe("01");
    expect(result.contaPaiId).toBeNull();
    expect(result.contaPaiNome).toBeNull();
    expect(result.parentPath).toBe("4/");
    expect(result.caracteristicaSaldo).toBe("D");
    expect(result.ehRedutora).toBe(false);
  });

  it("mapeia conta filha com conta_superior_id M2O corretamente", () => {
    const result = mapContaContabilRow(RAW_CONTA_FILHA);
    expect(result.odooId).toBe(5);
    expect(result.contaPaiId).toBe(4);
    expect(result.contaPaiNome).toBe("1 - ATIVO [D]");
    expect(result.parentPath).toBe("4/5/");
    expect(result.nivel).toBe(2);
  });

  it("mapeia conta analítica (tipo A)", () => {
    const result = mapContaContabilRow(RAW_CONTA_ANALITICA);
    expect(result.tipo).toBe("A");
    expect(result.contaPaiId).toBe(5);
    expect(result.contaPaiNome).toBe("1.1 - ATIVO CIRCULANTE");
  });

  it("mapeia conta redutora (eh_redutora=true)", () => {
    const result = mapContaContabilRow(RAW_CONTA_REDUTORA);
    expect(result.ehRedutora).toBe(true);
    expect(result.caracteristicaSaldo).toBe("C");
  });

  it("tolera campos opcionais ausentes", () => {
    const raw = { id: 999, codigo: "9", nome: "TESTE" };
    const result = mapContaContabilRow(raw);
    expect(result.odooId).toBe(999);
    expect(result.tipo).toBe("");
    expect(result.nivel).toBeNull();
    expect(result.natureza).toBeNull();
    expect(result.contaPaiId).toBeNull();
    expect(result.contaPaiNome).toBeNull();
    expect(result.parentPath).toBeNull();
    expect(result.caracteristicaSaldo).toBeNull();
    expect(result.ehRedutora).toBe(false);
  });

  it("NÃO produz atualizadoEm (campo tem @default(now()) no schema)", () => {
    const raw = { id: 1, codigo: "1", nome: "X" };
    expect(mapContaContabilRow(raw)).not.toHaveProperty("atualizadoEm");
  });
});

// ---------------------------------------------------------------------------
// rebuildFatoContaContabil
// ---------------------------------------------------------------------------

describe("rebuildFatoContaContabil", () => {
  it("lê de rawContabilConta (rawDeleted=false) e reconstrói o fato", async () => {
    const tx = {
      fatoContaContabil: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawContabilConta: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_CONTA_RAIZ },
          { data: RAW_CONTA_FILHA },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoContaContabil(prisma);
    expect(n).toBe(2);
    expect(tx.fatoContaContabil.deleteMany).toHaveBeenCalled();
    expect(tx.fatoContaContabil.createMany).toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_conta_contabil");
  });

  it("não chama createMany quando não há linhas", async () => {
    const tx = {
      fatoContaContabil: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawContabilConta: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoContaContabil(prisma);
    expect(n).toBe(0);
    expect(tx.fatoContaContabil.deleteMany).toHaveBeenCalled();
    expect(tx.fatoContaContabil.createMany).not.toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_conta_contabil");
  });

  it("createMany recebe dados corretos (odooId, codigo, contaPaiId)", async () => {
    const tx = {
      fatoContaContabil: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawContabilConta: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_CONTA_FILHA },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoContaContabil(prisma);
    const callArg = tx.fatoContaContabil.createMany.mock.calls[0][0];
    expect(callArg.data[0].odooId).toBe(5);
    expect(callArg.data[0].codigo).toBe("1.1");
    expect(callArg.data[0].contaPaiId).toBe(4);
    expect(callArg.data[0]).not.toHaveProperty("atualizadoEm");
  });
});
