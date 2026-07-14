// src/lib/fiscal/regras/classificacao-receita.ts
//
// MODO SOMBRA da classificação de receita.
//
// Decisão do dono (2026-07-13), depois do laudo (docs/pericia-classificacao-receita-2026-07-13.md):
//
//   "Faz sempre pelos dois lados: pela natureza (o modelo novo) e pesquisando se a operação
//    tem 'venda' no nome, igual já faz hoje. Se os valores baterem, ok. Se não baterem, você
//    utiliza SEMPRE o valor do que está filtrado com a venda. Ainda mais se o novo der zero ou
//    muito abaixo. É uma trava de segurança momentânea. E aí a gente vai monitorando, e eu
//    quero saber quantos acertos está tendo."
//
// Como isso se traduz aqui:
//   - `porNome`     : a regra ANTIGA (nome da operação contém "venda"). É a AUTORIDADE.
//   - `porNatureza` : a regra NOVA (natureza da operação). Roda, mas só observa.
//   - `decisao`     : o que a plataforma inteira vai enxergar. É SEMPRE `porNome`.
//   - `divergente`  : as duas discordaram nesta nota. Vai para o painel, para calibrar.
//   - `naturezaDesconhecida`: operação que ninguém mapeou ainda. Vira ALERTA, nunca silêncio.
//
// A trava é ESTRUTURAL, não é uma escolha em tempo de execução: `decisao = porNome`, ponto.
// Não existe caminho no código em que a regra nova mude um número exibido. Por isso não há
// como esta entrega "quebrar o que já existe": o pior caso da regra nova é ela estar errada e
// aparecer no painel como divergência, sem tocar em nenhum total.
//
// A coluna que a plataforma lê (`fato_nota_fiscal.is_venda_externa`) recebe `decisao`. Todos os
// consumidores (diretoria, relatórios 1.0 e 2.0, KPIs, métricas do Nex, tools do MCP) leem essa
// coluna pronta e NENHUM recalcula a regra , por isso o modo sombra se implanta num ponto só.

import { naturezaEhReceita, naturezaConhecida } from "./natureza-catalogo";
import { notaEhVendaExterna, type NotaParaVendaExterna } from "./nota-venda-externa";

export interface NotaParaClassificacao extends NotaParaVendaExterna {
  /** `sped.documento.natureza_operacao_id` , o que o Odoo declara que o documento É. */
  naturezaOperacaoId: number | null;
}

export interface ClassificacaoReceita {
  /** Regra ANTIGA (nome da operação). A autoridade, enquanto o dono não virar a chave. */
  porNome: boolean;
  /** Regra NOVA (natureza da operação). Observação, não decide nada ainda. */
  porNatureza: boolean;
  /** O que vale. Igual a `porNome`, SEMPRE. É a trava. */
  decisao: boolean;
  /** As duas regras discordaram nesta nota. */
  divergente: boolean;
  /** Nota candidata a receita cuja natureza não está no catálogo. Vira alerta. */
  naturezaDesconhecida: boolean;
}

/**
 * Uma nota é "candidata a receita" quando é saída, autorizada, NF-e/NFC-e e não é devolução.
 * Só nesse universo faz sentido perguntar se a natureza é conhecida , senão o painel de
 * alertas viraria um mar de ruído com nota de compra, CT-e e nota em digitação.
 */
function ehCandidataAReceita(n: NotaParaClassificacao): boolean {
  return (
    n.entradaSaida === "1" &&
    n.situacaoNfe === "autorizada" &&
    (n.modelo === "55" || n.modelo === "65") &&
    n.finalidadeNfe !== "4"
  );
}

/** A regra NOVA: mesma moldura da antiga (saída, autorizada, 55/65, não devolução, fora do
 *  grupo), trocando o teste de "venda" no nome pelo catálogo de naturezas. */
function ehReceitaPelaNatureza(n: NotaParaClassificacao): boolean {
  return ehCandidataAReceita(n) && !n.intragrupo && naturezaEhReceita(n.naturezaOperacaoId);
}

export function classificaReceita(n: NotaParaClassificacao): ClassificacaoReceita {
  const porNome = notaEhVendaExterna(n);
  const porNatureza = ehReceitaPelaNatureza(n);
  return {
    porNome,
    porNatureza,
    // A TRAVA. Enquanto o dono não mandar virar, quem manda no número é a regra antiga.
    decisao: porNome,
    divergente: porNome !== porNatureza,
    // O alerta só faz sentido em nota que PODERIA virar receita: saída autorizada, NF-e/NFC-e,
    // não devolução e destinatário FORA do grupo. Sem o filtro de intragrupo, o painel abriria
    // com 10 transferências internas sem natureza (R$ 2,9 mi que nunca seriam receita), e um
    // alerta que nasce com ruído é um alerta que ninguém olha. Conferido em produção.
    naturezaDesconhecida:
      ehCandidataAReceita(n) && !n.intragrupo && !naturezaConhecida(n.naturezaOperacaoId),
  };
}
