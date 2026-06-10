import { agregarPorRegime, REGIME_NAO_MAPEADO } from "./faturamento-por-regime";
import type { ItemVendaGrupo } from "./_itens-venda-grupo";

const item = (p: Partial<ItemVendaGrupo>): ItemVendaGrupo => ({
  documentoId: 1,
  cfopId: 5102,
  valorProdutos: 0,
  ehReceita: true,
  intragrupo: false,
  participanteId: null,
  participanteNome: null,
  empresaId: null,
  empresaNome: null,
  mesEmissao: 1,
  ...p,
});

const JDS = "Jds Comércio - Matriz DF 18.282.961/0001-00"; // raiz 18282961
const JHT = "JHT Brasília - Matriz DF 07.390.039/0001-01"; // raiz 07390039
const OUTRA = "Outra Empresa - Matriz XX 11.111.111/0001-11"; // raiz 11111111 (sem de-para)

const depara = new Map([
  ["18282961", { codigo: "3.1", label: "Lucro Real" }],
  ["07390039", { codigo: "1", label: "Simples Nacional" }],
]);

const itens: ItemVendaGrupo[] = [
  item({ documentoId: 1, valorProdutos: 1000, empresaId: 4, empresaNome: JDS }), // Real externo
  item({ documentoId: 2, valorProdutos: 500, intragrupo: true, empresaId: 4, empresaNome: JDS }), // Real intra
  item({ documentoId: 3, valorProdutos: 200, empresaId: 1, empresaNome: JHT }), // Simples externo
  item({ documentoId: 4, valorProdutos: 9999, ehReceita: false, empresaId: 1, empresaNome: JHT }), // nao-receita
  item({ documentoId: 5, valorProdutos: 300, empresaId: 99, empresaNome: OUTRA }), // sem de-para
];

describe("agregarPorRegime", () => {
  const r = agregarPorRegime(itens, depara);

  it("agrupa receita por regime, com individual e externa", () => {
    const real = r.regimes.find((x) => x.regimeCodigo === "3.1")!;
    expect(real.regimeLabel).toBe("Lucro Real");
    expect(real.receitaIndividual).toBe(1500); // 1000 + 500
    expect(real.receitaExterna).toBe(1000); // intragrupo (500) eliminado
    expect(real.qtdEmpresas).toBe(1);
    expect(real.qtdNotas).toBe(2);

    const simples = r.regimes.find((x) => x.regimeCodigo === "1")!;
    expect(simples.receitaIndividual).toBe(200);
    expect(simples.receitaExterna).toBe(200);
  });

  it("ignora item nao-receita (ehReceita=false)", () => {
    // 9999 nunca entra em nenhum total
    expect(r.totalReceitaIndividual).toBe(2000); // 1000+500+200+300
    expect(r.regimes.every((x) => x.receitaIndividual !== 9999)).toBe(true);
  });

  it("manda empresa sem de-para para regime_nao_mapeado, com cobertura", () => {
    const nm = r.regimes.find((x) => x.regimeCodigo === REGIME_NAO_MAPEADO)!;
    expect(nm.regimeLabel).toBe("Regime não mapeado");
    expect(nm.receitaIndividual).toBe(300);
    expect(r.receitaNaoMapeada).toBe(300);
    expect(r.coberturaPercentual).toBeCloseTo(0.85, 5); // (2000-300)/2000
  });

  it("RECONCILIA: Sigma individual e Sigma externa batem o universo ehReceita", () => {
    const somaInd = r.regimes.reduce((s, x) => s + x.receitaIndividual, 0);
    const somaExt = r.regimes.reduce((s, x) => s + x.receitaExterna, 0);
    expect(somaInd).toBe(r.totalReceitaIndividual);
    expect(somaExt).toBe(r.totalReceitaExterna);
    expect(r.totalReceitaIndividual).toBe(2000);
    expect(r.totalReceitaExterna).toBe(1500); // 1000+200+300 (so o intra 500 sai)
  });

  it("ordena mapeados por receita externa desc, nao_mapeado por ultimo", () => {
    expect(r.regimes.map((x) => x.regimeCodigo)).toEqual(["3.1", "1", REGIME_NAO_MAPEADO]);
    expect(r.regimeSnapshotAtual).toBe(true);
  });
});
