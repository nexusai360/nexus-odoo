import { filtrarPermitidos } from "./gating";
import type { BlocoLayout } from "./layout";

const blocos: BlocoLayout[] = [
  { componenteId: "A-01", ordem: 0, largura: 2, altura: 1 }, // diretoria.estoque.view
  { componenteId: "C-01", ordem: 1, largura: 2, altura: 1 }, // diretoria.vendas.view (não está no catálogo da onda)
  { componenteId: "ZZ-99", ordem: 2, largura: 2, altura: 1 }, // inexistente
];

describe("filtrarPermitidos", () => {
  it("mantém só blocos cujo componente existe e cuja capability o usuário tem", () => {
    const pode = (cap: string) => cap === "diretoria.estoque.view";
    const r = filtrarPermitidos(blocos, pode);
    expect(r.map((b) => b.componenteId)).toEqual(["A-01"]);
  });

  it("descarta componente inexistente mesmo se o predicado liberar tudo", () => {
    const r = filtrarPermitidos(blocos, () => true);
    expect(r.map((b) => b.componenteId)).not.toContain("ZZ-99");
  });

  it("nega tudo quando o predicado nega", () => {
    expect(filtrarPermitidos(blocos, () => false)).toEqual([]);
  });
});
