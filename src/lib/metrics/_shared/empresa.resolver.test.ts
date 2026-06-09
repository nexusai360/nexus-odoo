import { resolverEmpresa, parseEmpresaNome, listarEmpresasDoFato } from "./empresa";
import type { PrismaClient } from "../../../generated/prisma/client";

// Notas reais (distintas) por empresaId, no formato cru de fato_nota_fiscal.empresa_nome.
const FATO = [
  { empresaId: 1, empresaNome: "JHT Brasília - Matriz DF 07.390.039/0001-01" },
  { empresaId: 2, empresaNome: "Jht DF Comércio - Matriz DF 10.557.556/0001-37" },
  { empresaId: 3, empresaNome: "Jht DF Comércio - Filial SE 10.557.556/0003-07" },
  { empresaId: 4, empresaNome: "Jds Comércio - Matriz DF 18.282.961/0001-00" },
  { empresaId: 5, empresaNome: "Jds Comércio - Filial SP 18.282.961/0003-63" },
  { empresaId: 6, empresaNome: "Jds Comércio - Filial SE 18.282.961/0004-44" },
];

function mkPrisma(rows: Array<{ empresaId: number; empresaNome: string | null }> = FATO): PrismaClient {
  return {
    fatoNotaFiscal: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

describe("parseEmpresaNome", () => {
  it("parseia '{Nome} - {Matriz|Filial} {UF} {CNPJ}'", () => {
    const e = parseEmpresaNome(2, "Jht DF Comércio - Matriz DF 10.557.556/0001-37");
    expect(e).toEqual({
      empresaId: 2,
      nome: "Jht DF Comércio",
      nomeCompleto: "Jht DF Comércio - Matriz DF 10.557.556/0001-37",
      tipo: "matriz",
      uf: "DF",
      cnpj: "10.557.556/0001-37",
    });
  });

  it("reconhece filial e UF diferente", () => {
    const e = parseEmpresaNome(5, "Jds Comércio - Filial SP 18.282.961/0003-63");
    expect(e.tipo).toBe("filial");
    expect(e.uf).toBe("SP");
    expect(e.nome).toBe("Jds Comércio");
  });

  it("nome fora do padrao vira base com tipo desconhecido", () => {
    const e = parseEmpresaNome(99, "Empresa Avulsa");
    expect(e).toMatchObject({ empresaId: 99, nome: "Empresa Avulsa", tipo: "desconhecido", uf: null, cnpj: null });
  });

  it("nome nulo nao quebra", () => {
    const e = parseEmpresaNome(99, null);
    expect(e).toMatchObject({ nome: "", tipo: "desconhecido", uf: null, cnpj: null });
  });
});

describe("listarEmpresasDoFato", () => {
  it("uma entrada por empresaId, parseada, ordenada por id", async () => {
    const prisma = mkPrisma();
    const lista = await listarEmpresasDoFato(prisma);
    expect(lista.map((e) => e.empresaId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lista.find((e) => e.empresaId === 4)).toMatchObject({ nome: "Jds Comércio", tipo: "matriz", uf: "DF" });
  });
});

describe("resolverEmpresa (derivado do fato)", () => {
  it("(a) ref de id (<=9) devolve o empresaId do fato (mesmo id-space das notas)", async () => {
    const r = await resolverEmpresa(mkPrisma(), "2");
    expect(r.status).toBe("unica");
    if (r.status === "unica") {
      expect(r.empresa.odooId).toBe(2);
      expect(r.empresa.nome).toContain("Jht DF Comércio");
    }
  });

  it("(b) ref de 14 digitos casa o CNPJ exato e devolve o empresaId certo", async () => {
    const r = await resolverEmpresa(mkPrisma(), "10557556000307");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.empresa.odooId).toBe(3); // Filial SE, nao a Matriz
  });

  it("(c) nome e insensivel a acento: 'Jds Comercio' (sem acento) casa 'Jds Comércio'", async () => {
    const r = await resolverEmpresa(mkPrisma(), "Jds Comercio - Matriz");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.empresa.odooId).toBe(4);
  });

  it("(d) nome base que cobre matriz+filiais retorna ambigua com ids do fato", async () => {
    const r = await resolverEmpresa(mkPrisma(), "Jht DF");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.candidatas.map((c) => c.odooId).sort()).toEqual([2, 3]);
    }
  });

  it("(e) nome sem match retorna nenhuma", async () => {
    const r = await resolverEmpresa(mkPrisma(), "Inexistente");
    expect(r.status).toBe("nenhuma");
  });

  it("(f) id que nao existe no fato cai para nome e retorna nenhuma", async () => {
    const r = await resolverEmpresa(mkPrisma(), "999");
    expect(r.status).toBe("nenhuma");
  });

  it("(g) CNPJ 14 digitos sem match retorna nenhuma", async () => {
    const r = await resolverEmpresa(mkPrisma(), "00000000000000");
    expect(r.status).toBe("nenhuma");
  });
});
