// Limpa 2026+ (T1d do plan 2026-06-11) , gate do corte temporal no catalogo.
//
// Protege contra as duas regressoes fatais: (1) marcar um MESTRE com corte
// (deletaria dimensao viva); (2) transacional novo entrar sem corte nem
// classificacao (backfill reimportaria pre-2026). O conjunto e NOMINAL: mudou,
// o teste forca a contabilidade consciente.

import { describe, it, expect } from "@jest/globals";
import { MODEL_CATALOG } from "./model-catalog";

const COM_CORTE_DATA = [
  "estoque.extrato",
  "finan.banco.extrato",
  "finan.fluxo.caixa",
  "pedido.documento",
  "pedido.parcela",
  "sped.apuracao",
  "sped.consulta.dfe.item",
  "sped.documento",
].sort();

const COM_CORTE_PAI = [
  "sped.documento.duplicata",
  "sped.documento.item",
  "sped.documento.item.rastreabilidade",
  "sped.documento.pagamento",
  "sped.documento.referenciado",
  // FK documento_id verificada no banco real 2026-06-11: 18.742 array + 549
  // false (preservados pelo guard jsonb_typeof do predicado de filho).
  "sped.documento.volume",
].sort();

const CORTE_ESPECIAL = ["finan.lancamento"].sort();

/** Mestres/foto-atual que JAMAIS podem ganhar corte (amostra de guarda). */
const NUNCA_CORTAM = [
  "res.partner",
  "res.company",
  "sped.produto",
  "sped.empresa",
  "sped.ncm",
  "sped.cfop",
  "estoque.saldo",
  "estoque.saldo.hoje",
  "finan.banco.saldo",
  "finan.conta",
  "contabil.conta",
  "sped.produto.lote.serie",
  "sped.tabela.preco.regra",
];

describe("corte 2026 , conjunto exato no catalogo", () => {
  it("modelos com corte por data sao exatamente os verificados", () => {
    const atual = MODEL_CATALOG.filter((e) => e.corte).map((e) => e.odooModel).sort();
    expect(atual).toEqual(COM_CORTE_DATA);
  });

  it("modelos com cortePai sao exatamente os filhos verificados", () => {
    const atual = MODEL_CATALOG.filter((e) => e.cortePai).map((e) => e.odooModel).sort();
    expect(atual).toEqual(COM_CORTE_PAI);
  });

  it("corteEspecial = titulo apenas", () => {
    const atual = MODEL_CATALOG.filter((e) => e.corteEspecial).map((e) => e.odooModel).sort();
    expect(atual).toEqual(CORTE_ESPECIAL);
  });

  it("nenhum modelo acumula mais de um tipo de corte", () => {
    const duplo = MODEL_CATALOG.filter(
      (e) => [e.corte, e.cortePai, e.corteEspecial].filter(Boolean).length > 1,
    ).map((e) => e.odooModel);
    expect(duplo).toEqual([]);
  });

  it("todo corte tem nomes nao vazios", () => {
    for (const e of MODEL_CATALOG) {
      if (e.corte) {
        expect(e.corte.odoo.length).toBeGreaterThan(0);
        expect(e.corte.raw.length).toBeGreaterThan(0);
      }
      if (e.cortePai) {
        expect(e.cortePai.tabelaRawPai.length).toBeGreaterThan(0);
        expect(e.cortePai.fkRaw.length).toBeGreaterThan(0);
      }
    }
  });

  it("estoque.extrato e snapshot+corte (T2d REVISTO , incremental e inviavel)", () => {
    // Decisao 2026-06-11, confirmada no Odoo VIVO: 17.508 linhas, so 207 com
    // write_date (99% false) e create_date false em 100% , modelo computado
    // sem timestamps ORM. Incremental por write_date>since perderia quase toda
    // linha nova; snapshot diario (17k linhas 2026+) e o unico modo que pega
    // recalculo retroativo. Risco do 1o full-refresh purgar pre-2026 e coberto
    // pela ordem do T9 (pg_dump ANTES do deploy). NAO reclassificar sem rever
    // essa evidencia.
    const e = MODEL_CATALOG.find((m) => m.odooModel === "estoque.extrato")!;
    expect(e.mode).toBe("snapshot");
    expect(e.corte).toEqual({ odoo: "data", raw: "data" });
  });

  it("mestres/foto-atual NUNCA tem corte (lista negativa)", () => {
    const violando = MODEL_CATALOG.filter(
      (e) =>
        NUNCA_CORTAM.includes(e.odooModel) &&
        (e.corte || e.cortePai || e.corteEspecial),
    ).map((e) => e.odooModel);
    expect(violando).toEqual([]);
  });
});
