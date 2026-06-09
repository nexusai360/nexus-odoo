import { cadastroFiliaisListar } from "./filiais-listar";
import type { PrismaClient } from "@/generated/prisma/client.js";

const FATO = [
  { empresaId: 1, empresaNome: "JHT Brasília - Matriz DF 07.390.039/0001-01" },
  { empresaId: 2, empresaNome: "Jht DF Comércio - Matriz DF 10.557.556/0001-37" },
  { empresaId: 3, empresaNome: "Jht DF Comércio - Filial SE 10.557.556/0003-07" },
  { empresaId: 4, empresaNome: "Jds Comércio - Matriz DF 18.282.961/0001-00" },
  { empresaId: 5, empresaNome: "Jds Comércio - Filial SP 18.282.961/0003-63" },
  { empresaId: 6, empresaNome: "Jds Comércio - Filial SE 18.282.961/0004-44" },
];

function mkCtx(rows = FATO) {
  const prisma = {
    fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaClient;
  return { prisma } as unknown as Parameters<typeof cadastroFiliaisListar.handler>[1];
}

async function run(input: Parameters<typeof cadastroFiliaisListar.handler>[0]) {
  const out = await cadastroFiliaisListar.handler(input, mkCtx());
  if (!("dados" in out)) throw new Error("esperava envelope com dados");
  return out;
}

describe("cadastro_filiais_listar (derivado do fato)", () => {
  it("lista todas com odooId = empresaId do fato", async () => {
    const out = await run({});
    expect(out.dados.totalEncontrados).toBe(6);
    expect(out.dados.totalMatrizes).toBe(3);
    expect(out.dados.totalFiliais).toBe(3);
    const jds = out.dados.linhas.find((l) => l.odooId === 4)!;
    expect(jds).toMatchObject({ nome: "Jds Comércio", tipo: "matriz", uf: "DF", cnpj: "18.282.961/0001-00" });
  });

  it("filtra por tipo=filial", async () => {
    const out = await run({ tipo: "filial" });
    expect(out.dados.totalEncontrados).toBe(3);
    expect(out.dados.linhas.every((l) => l.tipo === "filial")).toBe(true);
  });

  it("filtra por UF (SE)", async () => {
    const out = await run({ uf: "se" });
    expect(out.dados.linhas.map((l) => l.odooId).sort()).toEqual([3, 6]);
  });

  it("respeita limite", async () => {
    const out = await run({ limite: 2 });
    expect(out.dados.linhasExibidas).toBe(2);
    expect(out.dados.totalEncontrados).toBe(6);
  });

  it("UF sem empresa retorna vazio", async () => {
    const out = await run({ uf: "RJ" });
    expect(out.estado).toBe("vazio");
    expect(out.dados.totalEncontrados).toBe(0);
  });
});
