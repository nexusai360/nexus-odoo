// Testes puros da busca inteligente por facets (Fase 4).
import { montarSugestoes, adicionarFacetAoGrupo } from "./data-table-busca";
import {
  grupoVazio,
  compilarFiltro,
  type Grupo,
} from "@/lib/reports/filtro-avancado";
import type { ColumnDef } from "@/components/charts/data-table";

type ColMeta = { key: string; header: string; tipo: string };
const colunas: ColMeta[] = [
  { key: "uf", header: "UF", tipo: "texto" },
  { key: "etapa", header: "Etapa", tipo: "tag" },
  { key: "valor", header: "Valor", tipo: "moeda" },
];
const vpc: Record<string, string[]> = {
  uf: ["SP", "RJ", "ES", "SC"],
  etapa: ["Em produção", "Faturado"],
  valor: ["100", "200"],
};

describe("montarSugestoes", () => {
  it("casa colunas texto/tag pelo termo, ignora moeda", () => {
    expect(montarSugestoes("sp", colunas, vpc)).toEqual([
      { campo: "uf", label: "UF", valor: "SP" },
    ]);
    expect(montarSugestoes("prod", colunas, vpc)).toEqual([
      { campo: "etapa", label: "Etapa", valor: "Em produção" },
    ]);
    expect(montarSugestoes("100", colunas, vpc)).toEqual([]); // moeda fora
  });

  it("termo vazio não sugere nada", () => {
    expect(montarSugestoes("", colunas, vpc)).toEqual([]);
    expect(montarSugestoes("   ", colunas, vpc)).toEqual([]);
  });

  it("respeita o limite", () => {
    // termo "s" casa SP, ES, SC (uf) -> limitar a 2
    expect(montarSugestoes("s", colunas, vpc, 2)).toHaveLength(2);
  });
});

describe("adicionarFacetAoGrupo", () => {
  it("acumula valores do mesmo campo em uma condição esta_em_lista (OU)", () => {
    let g: Grupo = grupoVazio();
    g = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "SP" });
    g = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "RJ" });
    expect(g.itens).toHaveLength(1);
    const cond = g.itens[0];
    expect("operador" in cond && cond.operador).toBe("esta_em_lista");

    const cols = colunas as unknown as ColumnDef<Record<string, unknown>>[];
    const pred = compilarFiltro(g, cols);
    expect(pred({ uf: "SP" })).toBe(true);
    expect(pred({ uf: "RJ" })).toBe(true);
    expect(pred({ uf: "ES" })).toBe(false); // NÃO zera: SP OU RJ
  });

  it("não duplica o mesmo valor", () => {
    let g: Grupo = grupoVazio();
    g = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "SP" });
    const g2 = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "SP" });
    expect(g2).toBe(g); // no-op retorna o mesmo grupo
  });

  it("campos diferentes viram condições separadas (E entre campos)", () => {
    let g: Grupo = grupoVazio();
    g = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "SP" });
    g = adicionarFacetAoGrupo(g, {
      campo: "etapa",
      label: "Etapa",
      valor: "Faturado",
    });
    expect(g.itens).toHaveLength(2);
    const cols = colunas as unknown as ColumnDef<Record<string, unknown>>[];
    const pred = compilarFiltro(g, cols);
    expect(pred({ uf: "SP", etapa: "Faturado" })).toBe(true);
    expect(pred({ uf: "SP", etapa: "Em produção" })).toBe(false);
  });
});
