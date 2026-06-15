// src/worker/limpa/alvos.ts , T4c do plan Limpa 2026+.
//
// Monta a lista de alvos do purge a partir do MODEL_CATALOG e a ordena por
// dependencia: neto -> filho -> raiz. O WHERE do filho resolve o pai via
// subquery `IN (SELECT odoo_id FROM pai WHERE pre-2026)`, entao o pai precisa
// estar VIVO quando o filho deleta; deletar a raiz primeiro orfanaria o filho.

import type { CatalogEntry } from "../catalog/model-catalog";
import { rawTableFor } from "../catalog/model-catalog";
import {
  wherePre2026Raw,
  wherePre2026Filho,
  wherePre2026Neto,
  whereTituloQuitadoPre2026Raw,
} from "./predicados";

export interface AlvoPurge {
  tabela: string;
  criterio: string;
  where: string;
  /** chave de data para o FILTER de NULLs preservados no dry-run. */
  chaveNulos?: string;
  /** 2 = neto (pai intermediario), 1 = filho direto, 0 = raiz/especial. */
  profundidade: number;
}

export function montaAlvosPurge(catalog: readonly CatalogEntry[]): AlvoPurge[] {
  const alvos: AlvoPurge[] = [];
  for (const e of catalog) {
    const tabela = rawTableFor(e.odooModel);
    if (e.corte) {
      alvos.push({
        tabela,
        criterio: `data ${e.corte.raw} < 2026`,
        where: wherePre2026Raw(e.corte.raw),
        chaveNulos: e.corte.raw,
        profundidade: 0,
      });
    } else if (e.cortePai) {
      const pai = catalog.find((p) => rawTableFor(p.odooModel) === e.cortePai!.tabelaRawPai);
      if (pai?.corte) {
        alvos.push({
          tabela,
          criterio: `filho de ${e.cortePai.tabelaRawPai}`,
          where: wherePre2026Filho(e.cortePai.tabelaRawPai, e.cortePai.fkRaw, pai.corte.raw),
          profundidade: 1,
        });
      } else {
        // pai intermediario (ex.: item): encadeia ao avo documento
        alvos.push({
          tabela,
          criterio: `filho de ${e.cortePai.tabelaRawPai}`,
          where: wherePre2026Neto(
            e.cortePai.tabelaRawPai,
            e.cortePai.fkRaw,
            "raw_sped_documento",
            "documento_id",
            "data_emissao",
          ),
          profundidade: 2,
        });
      }
    } else if (e.corteEspecial === "titulo_por_situacao") {
      alvos.push({
        tabela,
        criterio: "quitado/baixado pago<2026 (vivos FICAM)",
        where: whereTituloQuitadoPre2026Raw(),
        profundidade: 0,
      });
    }
  }
  // estavel: profundidade desc; dentro do nivel preserva a ordem do catalogo
  return alvos
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.profundidade - x.a.profundidade || x.i - y.i)
    .map((x) => x.a);
}
