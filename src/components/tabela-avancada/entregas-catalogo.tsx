"use client";

/**
 * Catálogo do B-09 (Entregas Parciais) para a tabela avançada, no modelo POR
 * PEDIDO: cada linha é um pedido (cabeçalho + agregados) com seus itens aninhados
 * (`itens`). As colunas do cabeçalho vivem em `COLUNAS`; os produtos aparecem no
 * dropdown expansível da lista e na seção "Produtos" da tela de detalhe, ambos
 * reusando `ListaProdutos`. O número do pedido é uma tag que abre o pedido no
 * Odoo. Reusa a cor de etapa e o ícone de status financeiro (Fase 2). É o único
 * acoplamento a domínio da tabela nova.
 */

import { useContext, useState } from "react";
import { CircleCheck, CircleX, Package, MapPin, FileText, ClipboardList, Coins, Tag, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { corEtapaValida, derivarCorTag } from "@/lib/diretoria/etapa-cor";
import { formatarNomeEtapa } from "@/lib/diretoria/etapa-formato";
import { OpcoesTabelaContext } from "./tabela-avancada";
import type { ColunaDef, CampoDef } from "./tipos";

// ===== Shapes (montados em blocos-pedidos.tsx) =====

/** Item (produto) de um pedido. */
export interface ItemEntrega {
  codigo: string;
  produto: string;
  familia: string;
  marca: string;
  qtdTotal: number;   // quantidade cheia do item
  qtdAtendida: number; // quantidade já atendida
  qtd: number;        // qtd a atender
  unitario: number;
  valorCheio: number;      // valor total do item (venda)
  valorCustoTotal: number; // valor total do item (custo)
  vlrVenda: number;   // a atender (venda)
  vlrCusto: number;   // a atender (custo)
  // Rentabilidade do ITEM (prontos do Odoo, por produto). Margem = líquido ÷ subtotal.
  comissaoPct: number;
  comissaoValor: number;
  liquido: number;
  margemPct: number;
  // Desconto do ITEM (prontos do Odoo, por produto).
  descontoValor: number;
  descontoPct: number;
}

/** Pedido (cabeçalho + agregados + itens). */
export interface LinhaEntrega {
  /** id interno do registro `pedido.documento` no Odoo (monta a URL da tag). */
  pedidoId: number;
  numero: string;
  mercos: string;
  orcamento: string;
  prevista: string;
  contrato: string;
  emitente: string;
  cliente: string;
  cnpj: string;
  cep: string;
  uf: string;
  cidade: string;
  operacao: string;
  modalidade: string;
  etapa: string;
  etapaCor: string | false | null;
  status: string;
  forma: string;
  /** Condição de pagamento do Odoo (condicao_pagamento_id, ex.: "Livre", "Boleto; 6 x"). */
  condicao: string;
  vendedor: string;
  observacoes: string;
  obsEntrega: string;
  // Agregados do pedido (somados a partir dos itens em saldo).
  qtdItens: number;      // nº de produtos (linhas) do pedido
  qtdTotal: number;      // soma da quantidade cheia
  qtdAtendida: number;   // soma da quantidade já atendida
  qtd: number;           // soma da qtd a atender
  valorCheio: number;    // soma do valor cheio (= valor total a venda)
  valorTotalCusto: number;    // soma do valor total a custo
  valorAtendidoVenda: number; // valor total venda − a atender venda
  valorAtendidoCusto: number; // valor total custo − a atender custo
  vlrVenda: number;      // soma a atender (venda)
  vlrCusto: number;      // soma a atender (custo)
  // Rentabilidade do pedido (prontos do Odoo; iguais em toda linha do pedido).
  subtotal: number;
  /** Total da coluna "Produto" do Odoo (vr_produtos = "Subtotal" do cabeçalho Odoo). */
  valorProduto: number;
  custoComercial: number;
  icms: number;
  difal: number;
  fcp: number;
  pis: number;
  cofins: number;
  irpj: number;
  csll: number;
  cbs: number;
  ibs: number;
  comissaoPct: number;
  comissaoValor: number;
  liquido: number;
  margemPct: number;
  // Desconto do pedido (prontos do Odoo; iguais em toda linha do pedido).
  descontoValor: number;
  descontoPct: number;
  // Itens + índices de texto para busca/filtro por produto.
  itens: ItemEntrega[];
  produtosTexto: string; // "código nome | código nome ..." (busca rápida)
  familias: string[];    // distintas (filtro por tags)
  marcas: string[];      // distintas (filtro por tags)
  [k: string]: unknown;
}

// ===== Helpers de formatação =====

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export function formatBRL(v: number): string {
  return Number.isFinite(v) ? brl.format(v) : "R$ 0,00";
}

/** Percentual pt-BR com 2 casas (ex.: -12,19%). O Odoo já entrega o número (5, -12.19). */
export function formatPct(v: number): string {
  return `${(Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** URL do pedido no Odoo (Tauga). Só o `id` muda entre pedidos; o resto é fixo
 * para a tela de formulário do modelo `pedido.documento`. */
export function urlPedidoOdoo(pedidoId: number): string {
  return `https://grupojht.tauga.online/web#id=${pedidoId}&cids=1&menu_id=111&action=487&model=pedido.documento&view_type=form`;
}

/** ISO (YYYY-MM-DD…) -> DD/MM/AAAA. Não-ISO (ex.: "—") volta intacto. */
export function formatarDataBR(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

const nomesMes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${nomesMes[Number(m[2]) - 1]}/${m[1]}` : "sem data";
}

/** Categoria ESTÁVEL do prazo de entrega (para filtrar e agrupar; mesma régua da bolinha da
 * coluna Entrega, mas sem a contagem de dias que muda a cada dia). */
export const CATEGORIAS_ENTREGA = ["Atrasada", "Vence em até 7 dias", "No prazo", "Sem data prevista"] as const;
export function categoriaEntrega(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "Sem data prevista";
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0) return "Atrasada";
  if (dias <= 7) return "Vence em até 7 dias";
  return "No prazo";
}

/** Tipo do documento do cliente pela contagem de dígitos: 14 = CNPJ (PJ), 11 = CPF (PF). */
export const TIPOS_DOC = ["CNPJ", "CPF", "Sem documento"] as const;
export function tipoDocumento(cnpjCpf: string): string {
  const d = (cnpjCpf || "").replace(/\D/g, "");
  if (d.length === 14) return "CNPJ";
  if (d.length === 11) return "CPF";
  return "Sem documento";
}

// ===== Totais do rodapé fixo (calculados sobre TODAS as linhas filtradas) =====

const num0 = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const somaDe = (rows: LinhaEntrega[], sel: (l: LinhaEntrega) => number): number =>
  rows.reduce((s, l) => s + (sel(l) || 0), 0);

function celTotMoeda(v: number): React.ReactNode {
  return <span className="whitespace-nowrap tabular-nums">{formatBRL(v)}</span>;
}
function celTotNum(v: number): React.ReactNode {
  return <span className="whitespace-nowrap tabular-nums">{num0(v)}</span>;
}
/** Total em R$ (rodapé). */
const totMoeda = (sel: (l: LinhaEntrega) => number) => (rows: LinhaEntrega[]): React.ReactNode => celTotMoeda(somaDe(rows, sel));
/** Total numérico (quantidades). */
const totNum = (sel: (l: LinhaEntrega) => number) => (rows: LinhaEntrega[]): React.ReactNode => celTotNum(somaDe(rows, sel));

/** Total da coluna Pedido: contagem de pedidos. */
function rodapePedidos(rows: LinhaEntrega[]): React.ReactNode {
  return <span className="whitespace-nowrap tabular-nums text-muted-foreground">{num0(rows.length)} {rows.length === 1 ? "pedido" : "pedidos"}</span>;
}
/** Total da coluna Produtos: tag com o total de linhas de produto. */
function rodapeProdutos(rows: LinhaEntrega[]): React.ReactNode {
  const t = somaDe(rows, (l) => l.qtdItens);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
      <Package className="size-3 shrink-0" aria-hidden />{num0(t)} {t === 1 ? "produto" : "produtos"}
    </span>
  );
}

/** Total de valor com custo/venda: segue o toggle "Mostrar venda" (mesma leitura da célula). */
function TotalValorCV({ custo, venda }: { custo: number; venda: number }) {
  const { mostrarVenda } = useContext(OpcoesTabelaContext);
  if (!mostrarVenda) return <span className="whitespace-nowrap tabular-nums">{formatBRL(custo)}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-amber-500" title="Custo"><Coins className="size-3 shrink-0" aria-hidden />{formatBRL(custo)}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-emerald-500" title="Venda"><Tag className="size-3 shrink-0" aria-hidden />{formatBRL(venda)}</span>
    </span>
  );
}

// ===== Colunas do PEDIDO (cabeçalho da lista + tela de detalhe) =====

// Ordem TEMÁTICA (dono, 2026-07-21): colunas do mesmo assunto juntas, numa
// sequência que faz sentido ao ler da esquerda para a direita. O default visível
// (`padrao: true`) segue essa mesma ordem; o resto fica no seletor de colunas.
export const COLUNAS: ColunaDef<LinhaEntrega>[] = [
  // --- Identificação e status do pedido ---
  { key: "numero", label: "Pedido", tipo: "texto", sortable: true, numeric: false, padrao: true, obrigatoria: true, valor: (l) => l.numero, rodape: rodapePedidos },
  { key: "mercos", label: "Nº Mercos", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.mercos },
  { key: "itens", label: "Produtos", tipo: "numero", sortable: true, numeric: false, padrao: true, valor: (l) => l.qtdItens, rodape: rodapeProdutos },
  { key: "etapa", label: "Etapa", tipo: "tagCor", sortable: true, numeric: false, padrao: true, valor: (l) => formatarNomeEtapa(l.etapa) },
  // Financeiro é um ícone (liberado/bloqueado): centralizado na coluna, acompanha o resize.
  // Total: nº de liberados (verde) | nº de bloqueados (vermelho), como um bloco central.
  { key: "status", label: "Financeiro", tipo: "status", sortable: true, numeric: false, align: "center", padrao: true, valor: (l) => l.status,
    rodape: (rows) => {
      const lib = rows.filter((l) => l.status === "Liberado").length;
      const bloq = rows.filter((l) => l.status === "Bloqueado").length;
      return (
        <span className="inline-flex items-center justify-center gap-1.5 tabular-nums" title={`${lib} liberado(s), ${bloq} bloqueado(s)`}>
          <span className="text-emerald-500">{num0(lib)}</span>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-rose-500">{num0(bloq)}</span>
        </span>
      );
    } },
  // --- Cliente e localização ---
  { key: "cliente", label: "Cliente", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cliente, detalheSpan: 2 },
  { key: "cnpj", label: "CNPJ/CPF", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.cnpj, sortKey: (l) => Number(String(l.cnpj).replace(/\D/g, "")) || 0 },
  { key: "emitente", label: "Emitente", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.emitente, detalheSpan: 2 },
  { key: "uf", label: "UF", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.uf },
  { key: "cidade", label: "Cidade", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cidade },
  { key: "cep", label: "CEP", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.cep, sortKey: (l) => Number(String(l.cep).replace(/\D/g, "")) || 0 },
  // --- Comercial ---
  { key: "vendedor", label: "Vendedor", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.vendedor },
  { key: "operacao", label: "Operação", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.operacao, detalheSpan: 2 },
  { key: "modalidade", label: "Modalidade", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.modalidade },
  { key: "forma", label: "Forma de pagamento", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.forma },
  { key: "condicao", label: "Condição de Pagamento", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.condicao },
  // --- Datas ---
  { key: "orcamento", label: "Orçamento", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.orcamento },
  { key: "prevista", label: "Entrega", tipo: "data", sortable: true, numeric: false, padrao: true, valor: (l) => l.prevista },
  { key: "contrato", label: "Validade", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.contrato },
  // --- Quantidades (unidades): total, atendida, a atender ---
  { key: "qtdTotal", label: "Qtd. Produto", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtdTotal, rodape: totNum((l) => l.qtdTotal) },
  { key: "qtdAtendida", label: "Qtd. Atendida", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtdAtendida, rodape: totNum((l) => l.qtdAtendida) },
  { key: "qtd", label: "Qtd. A Atender", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtd, rodape: totNum((l) => l.qtd) },
  // --- Valores da entrega: custo por padrão; com o toggle "Mostrar venda", a
  // célula mostra custo (ícone moeda) em cima e venda (ícone tag) embaixo.
  // `valor` = custo (usado no sort/agrupamento/CSV). ---
  { key: "valorAtendido", label: "Valor Atendido", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorAtendidoCusto,
    rodape: (rows) => <TotalValorCV custo={somaDe(rows, (l) => l.valorAtendidoCusto)} venda={somaDe(rows, (l) => l.valorAtendidoVenda)} /> },
  { key: "valorAtender", label: "Valor A Atender", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.vlrCusto,
    rodape: (rows) => <TotalValorCV custo={somaDe(rows, (l) => l.vlrCusto)} venda={somaDe(rows, (l) => l.vlrVenda)} /> },
  // Desconto do pedido (R$, do Odoo). Visível por padrão a pedido do dono.
  { key: "desconto", label: "Desconto", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.descontoValor, rodape: totMoeda((l) => l.descontoValor) },
  // Valor Produto = CUSTO total dos produtos = Σ (quantidade × preço de custo unitário) por
  // item (= Valor Atendido + Valor A Atender, a custo). NÃO é o preço de venda.
  { key: "valorProduto", label: "Valor Produto", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.valorTotalCusto,
    rodape: (rows) => <TotalValorCV custo={somaDe(rows, (l) => l.valorTotalCusto)} venda={somaDe(rows, (l) => l.valorCheio)} /> },
  // Subtotal Pedido = "Subtotal" do cabeçalho do Odoo (mesmo vr_produtos). Cor cinza (como Desconto).
  { key: "subtotalPedido", label: "Subtotal Pedido", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.valorProduto, rodape: totMoeda((l) => l.valorProduto) },
  // --- Rentabilidade do pedido (prontos do Odoo). Margem padrão; resto opcional. ---
  // Valor Pedido = "Total geral" do Odoo (vr_operacao_tributacao). Mantém a cor branca.
  { key: "subtotal", label: "Valor Pedido", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.subtotal, rodape: totMoeda((l) => l.subtotal) },
  { key: "custoComercial", label: "Custo", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.custoComercial, rodape: totMoeda((l) => l.custoComercial) },
  // % comissão geral = Σ comissão ÷ Σ subtotal (não é média de %).
  { key: "comissaoPct", label: "% Comissão", tipo: "percent", sortable: true, numeric: true, padrao: false, valor: (l) => l.comissaoPct,
    rodape: (rows) => { const sub = somaDe(rows, (l) => l.subtotal); const com = somaDe(rows, (l) => l.comissaoValor); const p = sub ? (com / sub) * 100 : 0; return <span className="whitespace-nowrap tabular-nums">{formatPct(p)}</span>; } },
  { key: "comissaoValor", label: "Valor Comissão", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.comissaoValor, rodape: totMoeda((l) => l.comissaoValor) },
  { key: "liquido", label: "Lucro Líquido", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.liquido, rodape: totMoeda((l) => l.liquido) },
  // Margem geral = Σ líquido ÷ Σ subtotal (mesma fórmula do Odoo, nunca média de %).
  { key: "margemPct", label: "Margem", tipo: "percent", sortable: true, numeric: true, padrao: true, valor: (l) => l.margemPct,
    rodape: (rows) => { const sub = somaDe(rows, (l) => l.subtotal); const liq = somaDe(rows, (l) => l.liquido); const m = sub ? (liq / sub) * 100 : 0; return <span className={cn("whitespace-nowrap tabular-nums", corMargem(m))}>{formatPct(m)}</span>; } },
  { key: "icms", label: "ICMS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.icms, rodape: totMoeda((l) => l.icms) },
  { key: "difal", label: "DIFAL", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.difal, rodape: totMoeda((l) => l.difal) },
  { key: "fcp", label: "FCP", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.fcp, rodape: totMoeda((l) => l.fcp) },
  { key: "pis", label: "PIS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.pis, rodape: totMoeda((l) => l.pis) },
  { key: "cofins", label: "COFINS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.cofins, rodape: totMoeda((l) => l.cofins) },
  { key: "irpj", label: "IRPJ", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.irpj, rodape: totMoeda((l) => l.irpj) },
  { key: "csll", label: "CSLL", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.csll, rodape: totMoeda((l) => l.csll) },
  { key: "cbs", label: "CBS*", tooltipHeader: "Alíquota Simbólica", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.cbs, rodape: totMoeda((l) => l.cbs) },
  { key: "ibs", label: "IBS*", tooltipHeader: "Alíquota Simbólica", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.ibs, rodape: totMoeda((l) => l.ibs) },
  // --- Observações ---
  { key: "observacoes", label: "Observações Pedido", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.observacoes, detalheSpan: 4 },
  { key: "obsEntrega", label: "Observações Gerais", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.obsEntrega, detalheSpan: 4 },
];

export const COLUNA_BY_KEY: Record<string, ColunaDef<LinhaEntrega>> = Object.fromEntries(
  COLUNAS.map((c) => [c.key, c]),
);

// ===== Campos por domínio (filtro / busca / agrupamento) =====

const STATUS_OPCOES = [
  { valor: "Liberado", label: "Liberado" },
  { valor: "Bloqueado", label: "Bloqueado" },
];

const CAMPOS_DEF: CampoDef<LinhaEntrega>[] = [
  // Pedido
  { key: "numero", label: "Pedido", tipo: "texto", grupo: "Pedido", comum: true, get: (l) => l.numero },
  { key: "mercos", label: "Nº Mercos", tipo: "texto", grupo: "Pedido", comum: false, get: (l) => l.mercos },
  { key: "operacao", label: "Operação", tipo: "opcao", grupo: "Pedido", comum: false, get: (l) => l.operacao },
  { key: "modalidade", label: "Modalidade", tipo: "opcao", grupo: "Pedido", comum: false, get: (l) => l.modalidade },
  // Cliente
  { key: "cliente", label: "Cliente", tipo: "texto", grupo: "Cliente", comum: true, get: (l) => l.cliente },
  { key: "cnpj", label: "CNPJ/CPF", tipo: "texto", grupo: "Cliente", comum: false, get: (l) => l.cnpj },
  { key: "tipoDoc", label: "Tipo de documento", tipo: "opcao", grupo: "Cliente", comum: true, get: (l) => tipoDocumento(l.cnpj), grupoKey: (l) => tipoDocumento(l.cnpj), opcoes: TIPOS_DOC.map((t) => ({ valor: t, label: t })) },
  { key: "emitente", label: "Emitente", tipo: "opcao", grupo: "Cliente", comum: false, get: (l) => l.emitente },
  { key: "uf", label: "UF", tipo: "opcao", grupo: "Cliente", comum: true, get: (l) => l.uf },
  { key: "cidade", label: "Cidade", tipo: "texto", grupo: "Cliente", comum: false, get: (l) => l.cidade },
  { key: "cep", label: "CEP", tipo: "texto", grupo: "Cliente", comum: false, get: (l) => l.cep },
  // Produto (agregado do pedido: casa se QUALQUER item do pedido corresponder)
  { key: "produto", label: "Produto", tipo: "texto", grupo: "Produto", comum: true, get: (l) => l.produtosTexto },
  { key: "familia", label: "Família", tipo: "tags", grupo: "Produto", comum: true, get: (l) => l.familias },
  { key: "marca", label: "Marca", tipo: "tags", grupo: "Produto", comum: true, get: (l) => l.marcas },
  // Comercial
  { key: "etapa", label: "Etapa", tipo: "opcao", grupo: "Comercial", comum: true, get: (l) => formatarNomeEtapa(l.etapa), grupoKey: (l) => formatarNomeEtapa(l.etapa) },
  { key: "vendedor", label: "Vendedor", tipo: "opcao", grupo: "Comercial", comum: true, get: (l) => l.vendedor },
  { key: "forma", label: "Forma de pagamento", tipo: "opcao", grupo: "Comercial", comum: false, get: (l) => l.forma },
  { key: "condicao", label: "Condição de pagamento", tipo: "opcao", grupo: "Comercial", comum: false, get: (l) => l.condicao },
  // Datas
  { key: "orcamento", label: "Data do orçamento", tipo: "data", grupo: "Datas", comum: false, get: (l) => l.orcamento, grupoKey: (l) => mesLabel(l.orcamento) },
  { key: "prevista", label: "Data prevista", tipo: "data", grupo: "Datas", comum: true, get: (l) => l.prevista, grupoKey: (l) => mesLabel(l.prevista) },
  { key: "entregaStatus", label: "Status de entrega", tipo: "opcao", grupo: "Datas", comum: true, get: (l) => categoriaEntrega(l.prevista), grupoKey: (l) => categoriaEntrega(l.prevista), opcoes: CATEGORIAS_ENTREGA.map((c) => ({ valor: c, label: c })) },
  { key: "contrato", label: "Contrato", tipo: "data", grupo: "Datas", comum: false, get: (l) => l.contrato },
  // Financeiro
  { key: "status", label: "Financeiro", tipo: "opcao", grupo: "Financeiro", comum: true, get: (l) => l.status, opcoes: STATUS_OPCOES },
  { key: "desconto", label: "Desconto (R$)", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.descontoValor },
  { key: "vlrVenda", label: "A atender (venda R$)", tipo: "numero", grupo: "Financeiro", comum: true, get: (l) => l.vlrVenda },
  { key: "vlrCusto", label: "A atender (custo R$)", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.vlrCusto },
  { key: "margem", label: "Margem (%)", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.margemPct },
  { key: "qtd", label: "Qtd a atender", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtd },
  { key: "qtdTotal", label: "Qtd produto", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtdTotal },
  { key: "qtdAtendida", label: "Qtd atendida", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtdAtendida },
  { key: "itens", label: "Nº de produtos", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtdItens },
  // Valores e rentabilidade (do Odoo)
  { key: "valorProduto", label: "Valor produto (custo)", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.valorTotalCusto },
  { key: "valorPedido", label: "Valor pedido", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.subtotal },
  { key: "custoComercial", label: "Custo comercial", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.custoComercial },
  { key: "comissaoValor", label: "Comissão (R$)", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.comissaoValor },
  { key: "comissaoPct", label: "Comissão (%)", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.comissaoPct },
  { key: "liquido", label: "Lucro líquido", tipo: "numero", grupo: "Valores", comum: false, get: (l) => l.liquido },
  // Impostos (do Odoo)
  { key: "icms", label: "ICMS", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.icms },
  { key: "difal", label: "DIFAL", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.difal },
  { key: "fcp", label: "FCP", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.fcp },
  { key: "pis", label: "PIS", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.pis },
  { key: "cofins", label: "COFINS", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.cofins },
  { key: "irpj", label: "IRPJ", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.irpj },
  { key: "csll", label: "CSLL", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.csll },
  { key: "cbs", label: "CBS", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.cbs },
  { key: "ibs", label: "IBS", tipo: "numero", grupo: "Impostos", comum: false, get: (l) => l.ibs },
  // Observações
  { key: "observacoes", label: "Observações", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.observacoes },
  { key: "obsEntrega", label: "Obs entrega", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.obsEntrega },
];

// Ordem dos campos no filtro avançado = ORDEM PADRÃO das colunas (não a que o usuário
// reordenou). Campos sem coluna correspondente vão para o fim, preservando a ordem de origem.
const ORDEM_COLUNAS = COLUNAS.map((c) => c.key);
const ALIAS_CAMPO_COLUNA: Record<string, string> = {
  margem: "margemPct",
  valorPedido: "subtotal",
  vlrVenda: "valorAtender",
  vlrCusto: "valorAtender",
};
function posDoCampoNaColuna(key: string): number {
  const colKey = ALIAS_CAMPO_COLUNA[key] ?? key;
  const i = ORDEM_COLUNAS.indexOf(colKey);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}
export const CAMPOS: CampoDef<LinhaEntrega>[] = CAMPOS_DEF
  .map((c, i) => ({ c, i }))
  .sort((a, b) => posDoCampoNaColuna(a.c.key) - posDoCampoNaColuna(b.c.key) || a.i - b.i)
  .map(({ c }) => c);

export const CAMPO_BY_KEY: Record<string, CampoDef<LinhaEntrega>> = Object.fromEntries(
  CAMPOS.map((c) => [c.key, c]),
);

/** Campos oferecidos no "Agrupar por" (dimensões do pedido que fazem sentido). */
export const AGRUPAMENTOS: { campo: string; label: string }[] = [
  { campo: "etapa", label: "Etapa" },
  { campo: "entregaStatus", label: "Status de entrega" },
  { campo: "modalidade", label: "Modalidade de frete" },
  { campo: "cliente", label: "Cliente" },
  { campo: "tipoDoc", label: "Tipo de documento (PJ/PF)" },
  { campo: "uf", label: "UF" },
  { campo: "cidade", label: "Cidade" },
  { campo: "vendedor", label: "Vendedor" },
  { campo: "status", label: "Financeiro" },
  { campo: "operacao", label: "Operação" },
  { campo: "forma", label: "Forma de pagamento" },
  { campo: "condicao", label: "Condição de pagamento" },
  { campo: "emitente", label: "Emitente" },
  { campo: "prevista", label: "Mês previsto" },
  { campo: "orcamento", label: "Mês do orçamento" },
];

// ===== Tag do pedido (abre o pedido no Odoo em nova aba) =====

/** Número do pedido como tag translúcida (foreground/10: preta translúcida no
 * claro, branca translúcida no escuro). Clicável quando há id do Odoo; o clique
 * não propaga para não abrir o detalhe da linha por baixo. */
export function TagPedido({ numero, pedidoId, grande }: { numero: string; pedidoId: number; grande?: boolean }) {
  const base = cn(
    "inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-foreground/10 font-semibold text-foreground ring-1 ring-inset ring-foreground/15 transition-colors",
    grande ? "gap-1.5 px-3 py-1 text-lg" : "px-2 py-0.5 text-xs",
  );
  const podeAbrir = Number.isFinite(pedidoId) && pedidoId > 0 && !!numero && numero !== "-";
  const Doc = <FileText className={cn("shrink-0 text-muted-foreground", grande ? "size-4" : "size-3.5")} aria-hidden />;
  if (!podeAbrir) return <span className={base}>{Doc}<span className="tabular-nums">{numero}</span></span>;
  return (
    <a
      href={urlPedidoOdoo(pedidoId)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Abrir ${numero} no Odoo`}
      aria-label={`Abrir pedido ${numero} no Odoo, nova aba`}
      className={cn(base, "cursor-pointer hover:bg-foreground/20 hover:ring-foreground/25")}
    >
      {Doc}
      <span className="tabular-nums">{numero}</span>
    </a>
  );
}

/** Etapa como pill colorida (reusa a cor da Fase 2). */
function PillEtapa({ l }: { l: LinhaEntrega }) {
  const estilo = derivarCorTag(corEtapaValida(l.etapaCor));
  const nome = formatarNomeEtapa(l.etapa);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        !estilo && "bg-muted text-muted-foreground",
      )}
      style={estilo ?? undefined}
    >
      {nome}
    </span>
  );
}

/** Status financeiro: ícone + (opcional) rótulo. */
function StatusFinanceiro({ status, comRotulo }: { status: string; comRotulo?: boolean }) {
  const bloqueado = status === "Bloqueado";
  const Icone = bloqueado ? CircleX : CircleCheck;
  return (
    <span className="inline-flex items-center gap-1.5" title={status}>
      <Icone className={cn("size-4", bloqueado ? "text-rose-400" : "text-emerald-400")} strokeWidth={2.25} aria-label={status} />
      {comRotulo && <span className={cn("text-xs font-medium", bloqueado ? "text-rose-500" : "text-emerald-500")}>{status}</span>}
    </span>
  );
}

/** Valor com custo por padrão; com o toggle "Mostrar venda" ligado, exibe custo
 * (ícone moeda, âmbar) em cima e venda (ícone tag, verde) embaixo, na mesma linha. */
function CelulaValorCV({ custo, venda }: { custo: number; venda: number }) {
  const { mostrarVenda } = useContext(OpcoesTabelaContext);
  if (!mostrarVenda) return <span className="whitespace-nowrap tabular-nums">{formatBRL(custo)}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-amber-500" title="Custo">
        <Coins className="size-3 shrink-0" aria-hidden />{formatBRL(custo)}
      </span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-emerald-500" title="Venda">
        <Tag className="size-3 shrink-0" aria-hidden />{formatBRL(venda)}
      </span>
    </span>
  );
}

// ===== Render de célula por tipo (cabeçalho do pedido) =====

/** Status da data de ENTREGA (prevista) em relação a hoje. O Odoo não expõe os limiares
 * de cor no dado (é lógica de tela do ERP), então usamos limiares de negócio: vencida =
 * vermelho, faltando ≤7 dias = âmbar, com folga = neutro. Vira um ÍCONE (bolinha), não
 * texto colorido, para não poluir. */
function statusEntrega(iso: string): { cor: string; label: string; texto: string | null } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  const plural = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;
  // `texto`: complemento curto exibido entre parênteses na ficha (só a bolinha
  // é colorida; o texto fica neutro). Com folga, não há complemento.
  if (dias < 0) return { cor: "bg-rose-500", texto: `há ${plural(-dias)}`, label: `Entrega atrasada (${plural(-dias)})` };
  if (dias <= 7) return { cor: "bg-amber-500", texto: dias === 0 ? "hoje" : `em ${plural(dias)}`, label: dias === 0 ? "Entrega hoje" : `Faltam ${plural(dias)}` };
  return { cor: "bg-foreground/30", texto: null, label: "No prazo" };
}

export function celula(l: LinhaEntrega, key: string): React.ReactNode {
  const col = COLUNA_BY_KEY[key];
  if (!col) return null;
  // Pedido: tag translúcida clicável (abre no Odoo).
  if (key === "numero") return <TagPedido numero={l.numero} pedidoId={l.pedidoId} />;
  // Colunas de valor: custo por padrão, custo+venda com o toggle.
  if (key === "valorAtendido") return <CelulaValorCV custo={l.valorAtendidoCusto} venda={l.valorAtendidoVenda} />;
  if (key === "valorAtender") return <CelulaValorCV custo={l.vlrCusto} venda={l.vlrVenda} />;
  // Desconto: a chave da coluna ("desconto") difere do campo da linha
  // (`descontoValor`), então precisa de caso próprio (senão renderiza R$ 0,00).
  if (key === "desconto") return <span className="whitespace-nowrap tabular-nums text-muted-foreground" title={`Desconto ${formatPct(l.descontoPct)}`}>{formatBRL(l.descontoValor)}</span>;
  // Valor Produto: CUSTO total (custo por padrão; com "Mostrar venda", custo+venda como
  // Valor Atendido/A Atender). venda = valorCheio (Σ preço de venda × quantidade).
  if (key === "valorProduto") return <CelulaValorCV custo={l.valorTotalCusto} venda={l.valorCheio} />;
  // Subtotal Pedido: mesmo valor bruto dos produtos, na cor cinza (como Desconto).
  if (key === "subtotalPedido") return <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBRL(l.valorProduto)}</span>;
  // CBS/IBS (reforma, alíquotas simbólicas): cor cinza, como Desconto/Subtotal Pedido.
  if (key === "cbs") return <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBRL(l.cbs)}</span>;
  if (key === "ibs") return <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBRL(l.ibs)}</span>;
  // Entrega (prevista): data em branco + ícone (bolinha) de status por prazo.
  if (key === "prevista") {
    const iso = String(l.prevista ?? "");
    const st = statusEntrega(iso);
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground">
        {st && <span className={cn("size-2 shrink-0 rounded-full", st.cor)} title={st.label} aria-label={st.label} />}
        {formatarDataBR(iso)}
      </span>
    );
  }
  // Produtos: contagem de itens do pedido.
  if (key === "itens") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Package className="size-3 shrink-0" aria-hidden />
        {l.qtdItens} {l.qtdItens === 1 ? "produto" : "produtos"}
      </span>
    );
  }
  switch (col.tipo) {
    case "moeda":
      return <span className="whitespace-nowrap tabular-nums">{formatBRL(Number(l[key] ?? 0))}</span>;
    case "numero":
      return <span className="whitespace-nowrap tabular-nums">{String(l[key] ?? "")}</span>;
    case "percent": {
      const v = Number(l[key] ?? 0);
      const cor = key === "margemPct" ? (v < 0 ? "text-rose-400" : v > 0 ? "text-emerald-400" : "text-muted-foreground") : "text-foreground";
      return <span className={cn("whitespace-nowrap tabular-nums", cor)}>{formatPct(v)}</span>;
    }
    case "data":
      return <span className="whitespace-nowrap text-muted-foreground">{formatarDataBR(String(l[key] ?? ""))}</span>;
    case "status":
      return <StatusFinanceiro status={l.status} />;
    case "tagCor":
      return <PillEtapa l={l} />;
    default:
      return <span className="truncate text-foreground">{String(l[key] ?? "")}</span>;
  }
}

// ===== Lista de produtos (dropdown da lista + seção do detalhe) =====

const GRID_ITEM = "grid grid-cols-[3.5rem_minmax(0,1fr)_7.5rem_6rem_4rem_4.5rem_5rem_7rem_8rem_6rem_7rem_5.5rem] gap-3";

/** Classe de cor da margem por sinal (mesma leitura do cabeçalho): negativa em
 * rose, positiva em emerald, zero em muted. */
function corMargem(v: number): string {
  return v < 0 ? "text-rose-400" : v > 0 ? "text-emerald-400" : "text-muted-foreground";
}

/** O Odoo nem sempre materializa a rentabilidade POR ITEM: em ~metade dos itens de
 * pedidos abertos `al_margem` e `vr_liquido` vêm zerados mesmo com valor e custo reais
 * (só o cabeçalho fica calculado). Nesses casos a margem do item é "não calculada",
 * não um genuíno 0% , e como a regra é NUNCA recalcular margem (Lucro Real), a célula
 * mostra "-" honesto em vez de fabricar um zero. */
function itemTemMargem(it: ItemEntrega): boolean {
  return it.margemPct !== 0 || it.liquido !== 0;
}

/** Produtos de um pedido, um embaixo do outro, colunas alinhadas, divisórias
 * bem leves (sem cara de tabela). Rola no próprio contêiner quando estreito.
 * Quantidades: Total / Atendido / A atender (mesma leitura do Odoo). Comissão e
 * Margem por produto vêm prontas do Odoo (aba Rentabilidade do item). */
export function ListaProdutos({ itens }: { itens: ItemEntrega[] }) {
  if (!itens.length) return <p className="px-1 text-sm text-muted-foreground">Sem produtos a atender neste pedido.</p>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[76rem]">
        <div className={cn(GRID_ITEM, "px-1 pb-2 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground")}>
          <span>Cód.</span>
          <span>Produto</span>
          <span>Família</span>
          <span>Marca</span>
          <span className="text-right">Total</span>
          <span className="text-right">Atend.</span>
          <span className="text-right">A atender</span>
          <span className="text-right">Unitário</span>
          <span className="text-right">Valor a atender</span>
          <span className="text-right">Desconto</span>
          <span className="text-right">Comissão</span>
          <span className="text-right">Margem</span>
        </div>
        <div className="divide-y divide-border/40">
          {itens.map((it, i) => (
            <div key={i} className={cn(GRID_ITEM, "items-baseline px-1 py-2 text-sm")}>
              <span className="truncate tabular-nums text-muted-foreground">{it.codigo}</span>
              <span className="min-w-0 break-words font-medium text-foreground">{it.produto}</span>
              <span className="truncate text-muted-foreground">{it.familia}</span>
              <span className="truncate text-muted-foreground">{it.marca}</span>
              <span className="text-right tabular-nums text-muted-foreground">{it.qtdTotal}</span>
              <span className="text-right tabular-nums text-muted-foreground">{it.qtdAtendida}</span>
              <span className="text-right font-medium tabular-nums text-foreground">{it.qtd}</span>
              <span className="text-right tabular-nums text-muted-foreground">{formatBRL(it.unitario)}</span>
              <span className="text-right font-semibold tabular-nums text-foreground">{formatBRL(it.vlrVenda)}</span>
              <span className="text-right tabular-nums text-muted-foreground" title={`Desconto ${formatPct(it.descontoPct)}`}>{formatBRL(it.descontoValor)}</span>
              <span className="text-right tabular-nums text-muted-foreground" title={`Comissão ${formatPct(it.comissaoPct)}`}>{formatBRL(it.comissaoValor)}</span>
              {itemTemMargem(it) ? (
                <span className={cn("text-right font-medium tabular-nums", corMargem(it.margemPct))} title={`Líquido ${formatBRL(it.liquido)}`}>{formatPct(it.margemPct)}</span>
              ) : (
                <span className="text-right tabular-nums text-muted-foreground" title="Margem não calculada por item no Odoo (só o cabeçalho do pedido tem)">-</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dropdown expansível de uma linha da lista (produtos do pedido, recuados). */
export function dropdownProdutos(l: LinhaEntrega): React.ReactNode {
  return (
    <div className="border-l-2 border-foreground/15 bg-background/30 px-4 py-3 pl-8 sm:pl-11">
      <ListaProdutos itens={l.itens} />
    </div>
  );
}

// ===== Tela de detalhe do pedido (redesenhada) =====

function Secao({ titulo, icone: Icone, sufixo, children }: { titulo: string; icone: typeof Package; sufixo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/60 pt-6 first:border-0 first:pt-0">
      <h3 className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
          <Icone className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">{titulo}</span>
        {sufixo}
      </h3>
      {children}
    </section>
  );
}

/** Subtítulo de um agrupamento interno de uma seção (ex.: blocos do Financeiro).
 * Um pouco maior que os labels dos campos, para separar os blocos. */
function SubGrupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-muted-foreground/80">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ label, valor, span, mono, muted }: { label: string; valor: string; span?: 2 | 4; mono?: boolean; muted?: boolean }) {
  return (
    <div className={cn("min-w-0", span === 4 ? "col-span-2 md:col-span-4" : span === 2 ? "col-span-2" : "")}>
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm", muted ? "text-muted-foreground" : "text-foreground", mono && "tabular-nums")}>{valor && valor !== "-" ? valor : "-"}</dd>
    </div>
  );
}

/** Campo de ENTREGA: data com a mesma bolinha de prazo do modo lista (só a
 * bolinha é colorida) e um complemento neutro entre parênteses quando atrasado
 * ("há X dias") ou próximo ("em X dias"). Com folga, apenas a bolinha cinza. */
function CampoEntrega({ iso }: { iso: string }) {
  const st = statusEntrega(iso);
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Entrega</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
        {st && <span className={cn("size-2 shrink-0 rounded-full", st.cor)} title={st.label} aria-label={st.label} />}
        <span className="tabular-nums">{formatarDataBR(iso)}</span>
        {st?.texto && <span className="text-muted-foreground">({st.texto})</span>}
      </dd>
    </div>
  );
}

/** Botão de copiar um valor curto (ex.: CNPJ) para a área de transferência,
 * no padrão do projeto (ícone Copy vira Check por ~1.5s). */
function BotaoCopiar({ texto, ariaLabel }: { texto: string; ariaLabel: string }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }
  return (
    <button type="button" onClick={copiar} aria-label={copiado ? "Copiado" : ariaLabel} title={copiado ? "Copiado" : ariaLabel}
      className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {copiado ? <Check className="size-3 text-emerald-500" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

/** Coluna do resumo do pedido: legenda em cima e o número (custo) centralizado
 * embaixo; opcionalmente o valor de venda equivalente em menor, logo abaixo. As
 * colunas ficam lado a lado separadas por um divisor fino (o "pipe"). */
function ColResumo({ titulo, valor, venda, destaque }: { titulo: string; valor: string; venda?: string; destaque?: boolean }) {
  return (
    <div className="min-w-0 px-3 text-center first:pl-0 last:pr-0">
      <p className="truncate text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={cn("mt-1 truncate tabular-nums", destaque ? "text-lg font-bold text-foreground" : "text-base font-semibold text-foreground")}>{valor}</p>
      {venda !== undefined && <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{venda}</p>}
    </div>
  );
}

/** Corpo da tela de detalhe de um pedido (passado como `renderDetalhe`). */
export function DetalheEntrega({ l }: { l: LinhaEntrega }) {
  const temObs = (l.observacoes && l.observacoes !== "-") || (l.obsEntrega && l.obsEntrega !== "-");
  // Toggle local (não persiste; some ao recarregar): revela o valor de venda
  // equivalente, pequeno, embaixo de cada valor de custo do resumo.
  const [mostrarVenda, setMostrarVenda] = useState(false);
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Cabeçalho: número em evidência + etapa + financeiro, cliente abaixo */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <TagPedido numero={l.numero} pedidoId={l.pedidoId} grande />
          <PillEtapa l={l} />
          <StatusFinanceiro status={l.status} comRotulo />
        </div>
        <p className="text-base font-medium text-foreground">{l.cliente}</p>
        {l.cnpj && l.cnpj !== "-" && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">{l.cnpj}</span>
            <BotaoCopiar texto={l.cnpj} ariaLabel="Copiar CNPJ" />
          </div>
        )}
      </header>

      {/* Resumo: quantidades e, abaixo, os valores em CUSTO (com venda opcional).
          O botão "Mostrar venda" espelha o da lista, mas em estado local. */}
      <div className="rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/80">Resumo do pedido</p>
          <button type="button" onClick={() => setMostrarVenda((v) => !v)} aria-pressed={mostrarVenda}
            className={cn("cursor-pointer rounded-md border px-2 py-1 text-[0.7rem] font-medium transition-colors", mostrarVenda ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
            {mostrarVenda ? "Ocultar venda" : "Mostrar venda"}
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/50">
          <ColResumo titulo="QTD. Pedido" valor={String(l.qtdTotal)} />
          <ColResumo titulo="QTD. Atendida" valor={String(l.qtdAtendida)} />
          <ColResumo titulo="QTD. A Atender" valor={String(l.qtd)} destaque />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border/50 border-t border-border/50 pt-4">
          <ColResumo titulo="Valor Produto" valor={formatBRL(l.valorTotalCusto)} venda={mostrarVenda ? formatBRL(l.valorCheio) : undefined} />
          <ColResumo titulo="Valor Atendido" valor={formatBRL(l.valorAtendidoCusto)} venda={mostrarVenda ? formatBRL(l.valorAtendidoVenda) : undefined} />
          <ColResumo titulo="Valor A Atender" valor={formatBRL(l.vlrCusto)} venda={mostrarVenda ? formatBRL(l.vlrVenda) : undefined} destaque />
        </div>
      </div>

      <dl className="space-y-5">
        <Secao titulo="Dados do Pedido" icone={ClipboardList}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo label="Nº Mercos" valor={l.mercos} />
            <Campo label="Orçamento" valor={formatarDataBR(l.orcamento)} />
            <Campo label="Validade" valor={formatarDataBR(l.contrato)} />
            <CampoEntrega iso={String(l.prevista ?? "")} />
            <Campo label="Operação" valor={l.operacao} span={2} />
            <Campo label="Emitente" valor={l.emitente} />
            <Campo label="Modalidade" valor={l.modalidade} />
          </div>
        </Secao>

        <Secao titulo="Venda" icone={Tag}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo label="Vendedor" valor={l.vendedor} />
            <Campo label="Forma de pagamento" valor={l.forma} />
            <Campo label="Condição de pagamento" valor={l.condicao} />
            <Campo mono label={`Comissão (${formatPct(l.comissaoPct)})`} valor={formatBRL(l.comissaoValor)} />
          </div>
        </Secao>

        <Secao titulo="Cliente e Endereço" icone={MapPin}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo label="Cliente" valor={l.cliente} span={4} />
            <Campo label="CNPJ" valor={l.cnpj} />
            <Campo label="CEP" valor={l.cep} />
            <Campo label="UF" valor={l.uf} />
            <Campo label="Cidade" valor={l.cidade} />
          </div>
        </Secao>

        {(l.subtotal !== 0 || l.liquido !== 0 || l.custoComercial !== 0 || l.descontoValor !== 0) && (
          <Secao titulo="Financeiro do Pedido" icone={Coins}>
            <div className="space-y-6">
              <SubGrupo titulo="Valores">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                  <Campo mono label="Subtotal Pedido" valor={formatBRL(l.valorProduto)} />
                  <Campo mono label={`Desconto (${formatPct(l.descontoPct)})`} valor={formatBRL(l.descontoValor)} />
                  <Campo mono label="Valor Pedido" valor={formatBRL(l.subtotal)} />
                  <Campo mono label="Custo" valor={formatBRL(l.custoComercial)} />
                  <Campo mono label={`Comissão (${formatPct(l.comissaoPct)})`} valor={formatBRL(l.comissaoValor)} />
                </div>
              </SubGrupo>

              <SubGrupo titulo="Tributos">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-5">
                  <Campo mono label="ICMS" valor={formatBRL(l.icms)} />
                  <Campo mono label="DIFAL" valor={formatBRL(l.difal)} />
                  <Campo mono label="FCP" valor={formatBRL(l.fcp)} />
                  <Campo mono label="PIS" valor={formatBRL(l.pis)} />
                  <Campo mono label="COFINS" valor={formatBRL(l.cofins)} />
                  <Campo mono label="IRPJ" valor={formatBRL(l.irpj)} />
                  <Campo mono label="CSLL" valor={formatBRL(l.csll)} />
                  <Campo mono muted label="CBS*" valor={formatBRL(l.cbs)} />
                  <Campo mono muted label="IBS*" valor={formatBRL(l.ibs)} />
                </div>
              </SubGrupo>

              <SubGrupo titulo="Resultado">
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-4">
                    <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Lucro Líquido</p>
                    <p className="mt-1 truncate text-lg font-bold tabular-nums text-foreground">{formatBRL(l.liquido)}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-4">
                    <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Margem</p>
                    <p className={cn("mt-1 truncate text-lg font-bold tabular-nums", l.margemPct < 0 ? "text-rose-400" : l.margemPct > 0 ? "text-emerald-400" : "text-muted-foreground")}>{formatPct(l.margemPct)}</p>
                  </div>
                </div>
              </SubGrupo>
            </div>
            <p className="mt-4 text-[0.7rem] text-muted-foreground">Valores prontos do Odoo (aba Rentabilidade). Margem = Lucro Líquido ÷ Valor Pedido; o líquido já abate os créditos tributários (Lucro Real). CBS e IBS (*) entram com a reforma tributária, ainda em transição.</p>
          </Secao>
        )}

        {temObs && (
          <Secao titulo="Observações" icone={FileText}>
            <div className="space-y-3">
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Observações Pedido</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{l.observacoes && l.observacoes !== "-" ? l.observacoes : "-"}</p>
              </div>
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Observações Gerais</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{l.obsEntrega && l.obsEntrega !== "-" ? l.obsEntrega : "-"}</p>
              </div>
            </div>
          </Secao>
        )}

        <Secao titulo="Produtos" icone={Package} sufixo={
          <span className="inline-flex items-center rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-300">{l.itens.length}</span>
        }>
          <ListaProdutos itens={l.itens} />
        </Secao>
      </dl>
    </div>
  );
}
