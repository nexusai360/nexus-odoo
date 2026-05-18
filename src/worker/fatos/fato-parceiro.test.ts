// src/worker/fatos/fato-parceiro.test.ts
import { mapParceiroRow, rebuildFatoParceiro } from "./fato-parceiro";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

// ---------------------------------------------------------------------------
// Fixtures — formato real de res.partner
// Dados confirmados contra o banco real: 6545 parceiros (rawDeleted=false)
// ---------------------------------------------------------------------------

const RAW_PARCEIRO_EMPRESA_CLIENTE = {
  id: 1001,
  name: "Empresa Fitness SA",
  complete_name: "Empresa Fitness SA",
  vat: "12.345.678/0001-99",
  customer: true,
  supplier: false,
  is_company: true,
  city: "Brasília",
  state_id: [9, "DF"],
  country_id: [31, "Brasil"],
  zip: "70000-001",
  email: "contato@empresafitness.com.br",
  phone: "(61) 3333-4444",
  mobile: "(61) 99999-0000",
  active: true,
};

const RAW_PARCEIRO_PESSOA_FORNECEDOR = {
  id: 2002,
  name: "João Silva",
  complete_name: "João Silva",
  vat: "123.456.789-00",
  customer: false,
  supplier: true,
  is_company: false,
  city: "São Paulo",
  state_id: [57, "SP"],
  country_id: [31, "Brasil"],
  zip: "01310-100",
  email: null,
  phone: null,
  mobile: "(11) 98765-4321",
  active: true,
};

const RAW_PARCEIRO_SEM_UF = {
  id: 3003,
  name: "Parceiro Sem UF",
  complete_name: "Parceiro Sem UF",
  vat: null,
  customer: true,
  supplier: true,
  is_company: false,
  city: null,
  state_id: false,
  country_id: false,
  zip: null,
  email: false,
  phone: false,
  mobile: false,
  active: false,
};

// ---------------------------------------------------------------------------
// mapParceiroRow
// ---------------------------------------------------------------------------

describe("mapParceiroRow", () => {
  it("mapeia parceiro empresa-cliente corretamente", () => {
    const result = mapParceiroRow(RAW_PARCEIRO_EMPRESA_CLIENTE);
    expect(result.odooId).toBe(1001);
    expect(result.nome).toBe("Empresa Fitness SA");
    expect(result.nomeCompleto).toBe("Empresa Fitness SA");
    expect(result.documento).toBe("12.345.678/0001-99");
    expect(result.ehCliente).toBe(true);
    expect(result.ehFornecedor).toBe(false);
    expect(result.ehEmpresa).toBe(true);
    expect(result.cidade).toBe("Brasília");
    expect(result.uf).toBe("DF");
    expect(result.pais).toBe("Brasil");
    expect(result.cep).toBe("70000-001");
    expect(result.email).toBe("contato@empresafitness.com.br");
    // phone existe, usa phone (não mobile)
    expect(result.telefone).toBe("(61) 3333-4444");
    expect(result.ativo).toBe(true);
  });

  it("fallback phone ?? mobile — usa mobile quando phone é null", () => {
    const result = mapParceiroRow(RAW_PARCEIRO_PESSOA_FORNECEDOR);
    expect(result.odooId).toBe(2002);
    expect(result.ehFornecedor).toBe(true);
    expect(result.ehCliente).toBe(false);
    expect(result.ehEmpresa).toBe(false);
    // phone é null, mobile existe → usa mobile
    expect(result.telefone).toBe("(11) 98765-4321");
    expect(result.email).toBeNull();
  });

  it("fallback phone ?? mobile — phone=false, mobile=false → null", () => {
    const result = mapParceiroRow(RAW_PARCEIRO_SEM_UF);
    expect(result.telefone).toBeNull();
  });

  it("state_id=false → uf null; country_id=false → pais null", () => {
    const result = mapParceiroRow(RAW_PARCEIRO_SEM_UF);
    expect(result.uf).toBeNull();
    expect(result.pais).toBeNull();
    expect(result.cidade).toBeNull();
    expect(result.documento).toBeNull();
    expect(result.cep).toBeNull();
    expect(result.ativo).toBe(false);
  });

  it("NÃO produz atualizadoEm (campo tem @default(now()) no schema)", () => {
    const raw = { id: 1, name: "X" };
    expect(mapParceiroRow(raw)).not.toHaveProperty("atualizadoEm");
  });
});

// ---------------------------------------------------------------------------
// rebuildFatoParceiro
// ---------------------------------------------------------------------------

describe("rebuildFatoParceiro", () => {
  it("reconstrói fato_parceiro a partir de rawResPartner (rawDeleted=false)", async () => {
    const tx = {
      fatoParceiro: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawResPartner: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_PARCEIRO_EMPRESA_CLIENTE },
          { data: RAW_PARCEIRO_PESSOA_FORNECEDOR },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoParceiro(prisma);
    expect(n).toBe(2);
    expect(tx.fatoParceiro.deleteMany).toHaveBeenCalled();
    expect(tx.fatoParceiro.createMany).toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_parceiro");
  });

  it("não chama createMany quando não há linhas", async () => {
    const tx = {
      fatoParceiro: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawResPartner: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoParceiro(prisma);
    expect(n).toBe(0);
    expect(tx.fatoParceiro.deleteMany).toHaveBeenCalled();
    expect(tx.fatoParceiro.createMany).not.toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_parceiro");
  });

  it("dados do createMany contêm campos corretos (sem atualizadoEm)", async () => {
    const tx = {
      fatoParceiro: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawResPartner: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_PARCEIRO_EMPRESA_CLIENTE },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoParceiro(prisma);
    const callArg = tx.fatoParceiro.createMany.mock.calls[0][0];
    const row = callArg.data[0];
    expect(row.odooId).toBe(1001);
    expect(row.nome).toBe("Empresa Fitness SA");
    expect(row.ehCliente).toBe(true);
    expect(row.uf).toBe("DF");
    expect(row).not.toHaveProperty("atualizadoEm");
  });
});
