import {
  queryDemandasPorUf,
  queryIndicadoresDemandas,
  queryDemandasPendentes,
} from "./pedidos";

function makePrisma(
  pedidos: {
    numero: string | null;
    participanteId: number | null;
    participanteNome: string | null;
    etapaNome: string | null;
    dataPrevista: Date | null;
    vrProdutos: number;
    vrNf: number;
  }[],
  parceiros: { odooId: number; uf: string | null }[],
) {
  return {
    fatoPedido: { findMany: jest.fn().mockResolvedValue(pedidos) },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue(parceiros) },
  } as unknown as Parameters<typeof queryDemandasPorUf>[0];
}

const hoje = new Date("2026-06-28");

const pedidos = [
  { numero: "P1", participanteId: 1, participanteNome: "A", etapaNome: "Separação", dataPrevista: new Date("2026-06-20"), vrProdutos: 100, vrNf: 0 },
  { numero: "P2", participanteId: 2, participanteNome: "B", etapaNome: "Aprovado", dataPrevista: new Date("2026-07-10"), vrProdutos: 300, vrNf: 0 },
  { numero: "P3", participanteId: 1, participanteNome: "C", etapaNome: "Separação", dataPrevista: null, vrProdutos: 50, vrNf: 0 },
];
const parceiros = [
  { odooId: 1, uf: "São Paulo (BR)" },
  { odooId: 2, uf: "Minas Gerais (BR)" },
];

describe("queryDemandasPorUf (B4)", () => {
  it("agrupa pendentes por UF (sigla)", async () => {
    const r = await queryDemandasPorUf(makePrisma(pedidos, parceiros), {});
    expect(r.valorGeral).toBe(450);
    expect(r.linhas[0]).toEqual({ uf: "MG", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ uf: "SP", quantidade: 2, valorTotal: 150 });
  });
  it("respeita UF-scoping", async () => {
    const r = await queryDemandasPorUf(makePrisma(pedidos, parceiros), { ufs: ["SP"] });
    expect(r.linhas).toEqual([{ uf: "SP", quantidade: 2, valorTotal: 150 }]);
  });
  it("filtra apenas pendentes (etapaFinaliza=false) no where", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, {});
    expect((p.fatoPedido.findMany as jest.Mock).mock.calls[0][0].where.etapaFinaliza).toBe(false);
  });
});

describe("queryIndicadoresDemandas (B6)", () => {
  it("conta pendentes, valor a entregar e atrasadas", async () => {
    const r = await queryIndicadoresDemandas(makePrisma(pedidos, parceiros), hoje);
    expect(r.totalPendentes).toBe(3);
    expect(r.valorAEntregar).toBe(450);
    expect(r.atrasadas).toBe(1); // só P1 (prevista 06-20 < hoje)
  });
});

describe("queryDemandasPendentes (B2)", () => {
  it("lista pendentes com uf, prazo e flag de atraso", async () => {
    const r = await queryDemandasPendentes(makePrisma(pedidos, parceiros), hoje, {});
    expect(r.linhas[0]).toEqual({
      numero: "P2",
      cliente: "B",
      uf: "MG",
      etapa: "Aprovado",
      dataPrevista: "2026-07-10",
      valor: 300,
      atrasado: false,
    });
    const p1 = r.linhas.find((l) => l.numero === "P1");
    expect(p1?.atrasado).toBe(true);
  });
});
