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
    ],
  },
  {
    domain: "comercial",
    description:
      "Pedidos de venda, propostas, cotacoes, vendas fechadas, faturamento por pedido, devolucoes, produtos vendidos por familia, top pedidos por valor, tempo medio de fechamento, ticket medio, vendedor responsavel pelo pedido. Perguntas tipicas: quais os pedidos abertos, top 10 pedidos do mes, qual o ticket medio, tempo medio para fechar pedido.",
    examples: [
      "quais os pedidos abertos?",
      "top 10 pedidos do mes",
      "qual o ticket medio?",
      "tempo medio para fechar pedido",
    ],
  },
  {
    domain: "contabil",
    description:
      "Plano de contas, lancamentos contabeis, balancete, demonstracao de resultado (DRE), contas referenciais, centros de custo contabeis, conta gerencial. Perguntas tipicas: qual conta contabil X, lancamentos do mes em conta Y, como foi o resultado contabil, plano de contas ativo.",
    examples: [
      "qual conta contabil 1.01.01?",
      "lancamentos do mes em conta receita",
      "como foi o resultado contabil?",
      "plano de contas ativo",
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
      "Saldo de estoque, posicao por local, movimentacao, extrato de entrada e saida, locais (depositos, armazens), lote, serie, rastreabilidade, produto parado (sem giro), tempo em estoque, duracao em dias, divergencia de inventario. Perguntas tipicas: qual o saldo do produto X, movimentacao de estoque ontem, produtos parados ha mais de 30 dias, posicao por deposito.",
    examples: [
      "qual o saldo do produto mola espiral?",
      "movimentacao de estoque ontem",
      "produtos parados ha mais de 30 dias",
      "posicao por deposito",
    ],
  },
  {
    domain: "financeiro",
    description:
      "Contas a pagar, contas a receber, saldo bancario, fluxo de caixa, titulos vencidos, pagamentos efetuados, recebimentos, liquidez, posicao de caixa, carteiras, bancos cadastrados, baixa de titulo, formas de pagamento, centros de resultado financeiro. Perguntas tipicas: quanto temos a receber, fluxo de caixa do mes, titulos vencidos, saldo no banco X.",
    examples: [
      "quanto temos a receber?",
      "fluxo de caixa do mes",
      "titulos vencidos",
      "saldo no banco Itau",
    ],
  },
  {
    domain: "fiscal",
    description:
      "Notas fiscais emitidas pela empresa, notas recebidas dos fornecedores (DF-e), NCM, CFOP, CEST, CST, aliquotas de ICMS, IPI, PIS, COFINS, ISS, NFe, MDF-e (manifesto de transporte), carta de correcao, devolucao, cancelamento, faturamento por marca, por produto, por cliente, situacao da nota (autorizada, cancelada, denegada). Perguntas tipicas: quais notas fiscais saimos hoje, faturamento por marca, notas recebidas do fornecedor X, ICMS da operacao Y.",
    examples: [
      "quais notas fiscais saimos hoje?",
      "faturamento por marca em maio",
      "notas recebidas do fornecedor X",
      "ICMS da operacao de venda",
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
