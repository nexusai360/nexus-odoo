// R1 router de catalogo: vocabulario canonico dos dominios MCP.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §7.
// Descriptions sao em prosa em pt-br do usuario final, nao do desenvolvedor.
// Mudancas neste arquivo invalidam o cache via VOCABULARY_VERSION e exigem
// rebuild do container `app` em producao (decisao §7.3 H da spec).

import { createHash } from "node:crypto";

export type DomainEntry = {
  /** Chave canonica do dominio (ex: "financeiro"). */
  domain: string;
  /** Prosa em pt-br do usuario. E' o texto que vira embedding. */
  description: string;
  /** 3 a 5 perguntas reais. Servem para calibragem e teste de regressao. */
  examples: string[];
  /** Regex (com \b para evitar falso positivo) que forcam inclusao do dominio
   *  no catalogo mesmo quando o score esta abaixo do threshold. */
  forceIncludeOn?: RegExp[];
  /** Quando true, o dominio NUNCA sai do catalogo entregue ao LLM
   *  (escape hatch). Aplica-se a `caminho3` (BI livre) e `dominios-vazios`. */
  excludeFromFiltering?: boolean;
};

/** Saudacoes e mensagens triviais que disparam fallback (regra 1 do §8).
 *  Comparacao e' case-insensitive depois do normalize. */
export const SAUDACOES_STOP_LIST: ReadonlyArray<string> = [
  "oi",
  "ola",
  "ola!",
  "bom dia",
  "boa tarde",
  "boa noite",
  "obrigado",
  "obrigada",
  "valeu",
  "ok",
  "okay",
  "sim",
  "nao",
  "talvez",
  "tudo bem",
  "tudo certo",
  "blz",
  "beleza",
];

export const DOMAINS: ReadonlyArray<DomainEntry> = [
  {
    domain: "cadastros",
    description:
      "Cadastro de clientes, fornecedores, parceiros comerciais, transportadoras, vendedores, filiais da empresa, cidades, estados (UF), empresas do grupo, ramo de atividade, segmento, perfil tributario, e cadastro basico de produtos. Inclui CNPJ, CPF, inscricao estadual, endereco, contato. Perguntas tipicas: quantos clientes ativos temos, lista os fornecedores de Sao Paulo, quais filiais existem, transportadoras cadastradas.",
    examples: [
      "quantos clientes ativos temos?",
      "lista os fornecedores de Sao Paulo",
      "quais filiais existem?",
      "transportadoras cadastradas",
    ],
    forceIncludeOn: [
      /\bcnpj\b/i,
      /\bcpf\b/i,
      /\binscri[cç][aã]o estadual\b/i,
      /\btransportadora/i,
      /buscar (cliente|fornecedor|vendedor|parceiro|transportadora|filial)/i,
    ],
  },
  {
    domain: "comercial",
    description:
      "Pedidos de venda, propostas, cotacoes, vendas fechadas, faturamento por pedido, devolucoes, produtos vendidos por familia, top pedidos por valor, parcelas do pedido, tempo medio de fechamento, ticket medio, vendedor responsavel pelo pedido, historico de etapas do pedido, tempo gasto em cada etapa, pedidos parados/travados no fluxo de etapas (processo, nao financeiro). Perguntas tipicas: quais os pedidos abertos, top 10 pedidos do mes, qual o ticket medio, parcelas que vencem, tempo medio para fechar pedido, quanto tempo o pedido X ficou em cada etapa, quais pedidos estao travados ha mais de N dias numa etapa.",
    examples: [
      "quais os pedidos abertos?",
      "top 10 pedidos do mes",
      "quanto tempo o pedido 821 ficou em cada etapa?",
      "quais pedidos estao travados numa etapa?",
    ],
    forceIncludeOn: [
      /\bpedido(s)? de venda/i,
      /\bparcela(s)?\b/i,
      /tempo.{0,40}\betapa/i,
      /hist[oó]rico.{0,20}\betapas?/i,
      /pedido(s)?.{0,20}(parado|travado)/i,
      /(parado|travado)(s)?.{0,15}(no|na)?.{0,5}(fluxo|etapa)/i,
    ],
  },
  {
    domain: "contabil",
    description:
      "Plano de contas, lancamentos contabeis, balancete, demonstracao de resultado (DRE), contas referenciais, centros de custo contabeis, conta gerencial, conta de receita, conta de despesa, buscar conta pelo nome (ex: conta com 'aluguel' ou 'imposto' no nome). Perguntas tipicas: qual conta contabil X, buscar conta com aluguel no nome, conta de receita de vendas, lancamentos do mes em conta Y, como foi o resultado contabil, plano de contas ativo.",
    examples: [
      "qual conta contabil 1.01.01?",
      "buscar conta com 'aluguel' no nome",
      "conta de receita de vendas",
      "plano de contas ativo",
    ],
    forceIncludeOn: [
      /plano de contas/i,
      /conta cont[aá]bil/i,
      /conta(s)? de (receita|despesa)/i,
      /conta gerencial/i,
      /\bbalancete\b/i,
      /\bdre\b/i,
      /buscar conta/i,
      /conta com .+ no nome/i,
    ],
  },
  {
    domain: "crm",
    description:
      "Funil de vendas, pipeline, oportunidades em aberto, leads, etapas do funil, atividades de vendedor, conversao de oportunidade em pedido, taxa de fechamento, perdas. Perguntas tipicas: quantas oportunidades estao paradas, qual vendedor converte mais, leads novos esse mes, funil de vendas.",
    examples: [
      "quantas oportunidades estao paradas?",
      "qual vendedor converte mais?",
      "leads novos esse mes",
      "funil de vendas",
    ],
  },
  {
    domain: "dominios-vazios",
    description:
      "Indicador interno de cobertura, lista o que o agente Nex ainda nao sabe responder. Nao orientado a usuario final, raramente perguntavel diretamente.",
    examples: ["o que voce nao sabe responder?"],
    excludeFromFiltering: true,
  },
  {
    domain: "estoque",
    description:
      "Saldo de estoque, quanto temos ou quanto sobrou de um material, peca ou produto (cabos, discos, molas, pecas, equipamentos de academia), posicao por local, movimentacao, extrato de entrada e saida, locais (depositos, armazens), lote, serie, rastreabilidade, produto parado (sem giro), tempo em estoque, duracao em dias, busca de item por codigo de produto, divergencia de inventario. Perguntas tipicas: qual o saldo do produto X, tem quanto de cabo de aco, quanto sobrou de disco, o que temos do codigo 1000093102, produtos parados ha mais de 30 dias, posicao por deposito.",
    examples: [
      "qual o saldo do produto mola espiral?",
      "tem quanto de cabo de aco?",
      "o que temos do codigo 1000093102",
      "produtos parados ha mais de 30 dias",
    ],
    forceIncludeOn: [
      /\bem estoque\b/i,
      /quanto (de |tem|temos|sobrou|resta|restam|ainda tem|ainda temos)/i,
      /\bsobrou\b/i,
      /\bparado(s)?\b/i,
      /sem giro/i,
      /\bc[oó]digo\s*\d/i,
      /\bdep[oó]sito\b/i,
    ],
  },
  {
    domain: "financeiro",
    description:
      "Contas a pagar, contas a receber, quanto devemos a fornecedores, quanto vai sair ou entrar no caixa na semana, saldo bancario, fluxo de caixa, titulos vencidos ou a vencer, pagamentos efetuados, recebimentos, liquidez, posicao de caixa, carteiras, bancos cadastrados, baixa de titulo, formas de pagamento, centros de resultado financeiro. Perguntas tipicas: quanto temos a receber, quanto vai sair essa semana, fornecedor que mais devemos, fluxo de caixa do mes, titulos vencidos, saldo no banco X.",
    examples: [
      "quanto temos a receber?",
      "quanto vai sair essa semana?",
      "fornecedor que mais devemos",
      "titulos vencidos",
    ],
    forceIncludeOn: [
      /a (pagar|receber)/i,
      /\bdevemos\b/i,
      /\bvencid/i,
      /\bvencem\b/i,
      /\ba vencer\b/i,
      /fluxo de caixa/i,
      /\bvai (sair|entrar)\b/i,
      /resultado por conta/i,
      /por conta gerencial/i,
      /(despesas?|receitas?) por conta/i,
    ],
  },
  {
    domain: "fiscal",
    description:
      "Notas fiscais emitidas pela empresa, notas recebidas dos fornecedores (DF-e), DF-e importados via manifestacao do destinatario (notas de fornecedores capturadas eletronicamente, distintas dos documentos proprios), DF-e pendentes de manifestacao (a manifestar), compras eletronicas por fornecedor, NCM, CFOP, CEST, CST, aliquotas de ICMS, IPI, PIS, COFINS, ISS, NFe, MDF-e (manifesto de transporte), carta de correcao, devolucao, cancelamento, faturamento por marca, por produto, por cliente, produtos mais vendidos, itens mais vendidos em valor ou quantidade, clientes que mais compraram (ranking de vendas via notas fiscais), situacao da nota (autorizada, cancelada, denegada). Perguntas tipicas: quais notas fiscais saimos hoje, quais DF-e/notas de fornecedores chegaram no mes, DF-e pendentes de manifestacao, de quais fornecedores chegaram DF-e, faturamento por marca, produtos mais vendidos no mes, top 5 clientes que mais compraram, nota fiscal de entrada do fornecedor com CNPJ X, ICMS da operacao Y.",
    examples: [
      "quais notas fiscais saimos hoje?",
      "produtos mais vendidos nos ultimos 30 dias",
      "top 5 clientes que mais compraram este ano",
      "faturamento por marca em maio",
    ],
    forceIncludeOn: [
      /\bnotas? fiscai?s?\b/i,
      /\bnf-?e\b/i,
      /\bcfop\b/i,
      /\bncm\b/i,
      /mais vendid/i,
      /mais compr/i,
      /produto(s)? mais/i,
      /\bfaturamento\b/i,
      /\bdf-?e\b/i,
      /manifesta[cç][aã]o/i,
      /notas? de fornecedor/i,
      /notas? importadas?/i,
      /compras? eletr[oô]nicas?/i,
    ],
  },
  {
    domain: "caminho3",
    description:
      "Consulta BI livre e SQL avancado. Resposta a qualquer pergunta que nao se encaixa nos dominios padrao acima. Sempre disponivel como escape hatch para o agente. Usado quando o usuario faz pergunta exotica, cruzamento incomum entre dominios, ou consulta ad hoc de exploracao de dado.",
    examples: [
      "junta vendas com estoque por familia",
      "consulta avancada cruzando 3 tabelas",
    ],
    excludeFromFiltering: true,
  },
];

/** Hash SHA256 truncado em 8 chars das descricoes concatenadas (ordem
 *  estavel: pela chave `domain`). Usado em VOCABULARY_VERSION para
 *  invalidar cache em memoria quando o vocabulario muda. */
export function computeVocabularyHash(): string {
  const sorted = [...DOMAINS].sort((a, b) => a.domain.localeCompare(b.domain));
  const concat = sorted.map((d) => `${d.domain}::${d.description}`).join("|");
  return createHash("sha256").update(concat).digest("hex").slice(0, 8);
}

/** Versao do vocabulario. Lazy: chama `computeVocabularyHash()` na primeira
 *  leitura e cacheia. */
let _vocabularyVersion: string | null = null;
export function getVocabularyVersion(): string {
  if (_vocabularyVersion === null) {
    _vocabularyVersion = computeVocabularyHash();
  }
  return _vocabularyVersion;
}

/** Conjunto dos nomes de dominio (para validacao rapida em tool-to-domain). */
export const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  DOMAINS.map((d) => d.domain),
);
