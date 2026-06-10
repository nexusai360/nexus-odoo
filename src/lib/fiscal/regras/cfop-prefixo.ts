// src/lib/fiscal/regras/cfop-prefixo.ts
import type { RegraOperacao } from "./tipos";

/**
 * Fallback por grupo de CFOP para codigos nao curados no MAPA_CFOP. A ORDEM e
 * critica (primeira que casar vence): entrada > servico > transferencia > ativo >
 * devolucao > simples faturamento > remessa/retorno > venda. Assim 6152
 * (transferencia) nunca cai em venda, e x922 (simples faturamento) nunca vira
 * remessa generica. Recebe o CFOP ja em 4 digitos. Retorna null quando nenhum
 * grupo casa (o classificador aplica entao o fallback conservador "outras").
 */
export function regraPorPrefixo(cfop: string): RegraOperacao | null {
  // 1. Entrada (1xxx/2xxx) aparecendo como saida = anomalia.
  if (/^[12]\d{3}$/.test(cfop)) {
    return { categoria: "entrada_anomala", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
  }
  // 2. Servico (ISSQN 933 + transporte 932) ou faixa 35x. 93[23] cobre 6932 (transporte).
  if (/^[567](93[23]|35\d)$/.test(cfop)) {
    return { categoria: "servico", ehReceita: true, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: true };
  }
  // 3. Transferencia: 15x / 552 / 557 / 601 / 409.
  if (/^[567](15\d|552|557|601|409)$/.test(cfop)) {
    return { categoria: "transferencia", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 4. Venda de ativo: 551.
  if (/^[567]551$/.test(cfop)) {
    return { categoria: "venda_ativo", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 5. Devolucao de compra (saida): 20x / 41x / 21x.
  if (/^[567](20\d|41\d|21\d)$/.test(cfop)) {
    return { categoria: "devolucao_compra", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 6. Simples faturamento (entrega futura): 922.
  if (/^[567]922$/.test(cfop)) {
    return { categoria: "simples_faturamento", ehReceita: false, deduzReceita: false, afetaEstoque: false, ehIntercompanySeGrupo: false };
  }
  // 7. Remessa/retorno: 90x..94x (exceto 922/932/933 ja tratados acima).
  if (/^[567]9[0-4]\d$/.test(cfop)) {
    return { categoria: "remessa", ehReceita: false, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: false };
  }
  // 8. Venda (POR ULTIMO): 10x / 40x / 117 / 119 / 120.
  if (/^[567](10\d|40\d|117|119|120)$/.test(cfop)) {
    return { categoria: "venda", ehReceita: true, deduzReceita: false, afetaEstoque: true, ehIntercompanySeGrupo: true };
  }
  return null;
}
