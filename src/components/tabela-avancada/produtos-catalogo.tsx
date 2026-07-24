"use client";

/**
 * Catálogo da tabela de PRODUTOS (itens de um pedido) para a TabelaAvancada,
 * reusando o mesmo componente genérico da tela de Pedidos. Mesma estrutura de
 * COLUNAS / CAMPOS / AGRUPAMENTOS / celula, porém sobre `ItemEntrega`.
 *
 * Vive num arquivo separado (não no catálogo de pedidos) para isolar mudanças.
 * Só importa `ItemEntrega` por tipo (sem ciclo de runtime com entregas-catalogo);
 * os formatadores são locais de propósito.
 */

import { useContext } from "react";
import { Coins, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { OpcoesTabelaContext } from "./tabela-avancada";
import type { ItemEntrega } from "./entregas-catalogo";
import type { ColunaDef, CampoDef } from "./tipos";

// ===== Formatação (locais para evitar ciclo de import com entregas-catalogo) =====
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatBRL(v: number): string { return Number.isFinite(v) ? brl.format(v) : "R$ 0,00"; }
function formatPct(v: number): string {
  return `${(Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function corMargem(v: number): string {
  return v < 0 ? "text-rose-400" : v > 0 ? "text-emerald-400" : "text-muted-foreground";
}
/** Odoo nem sempre materializa margem por item (só o cabeçalho do pedido tem). */
function itemTemMargem(it: ItemEntrega): boolean {
  return it.margemPct !== 0 || it.liquido !== 0;
}

const somaDe = (rows: ItemEntrega[], sel: (i: ItemEntrega) => number): number =>
  rows.reduce((s, i) => s + (sel(i) || 0), 0);
const num0 = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function celTotMoeda(v: number): React.ReactNode { return <span className="whitespace-nowrap tabular-nums">{formatBRL(v)}</span>; }
function celTotNum(v: number): React.ReactNode { return <span className="whitespace-nowrap tabular-nums">{num0(v)}</span>; }
const totMoeda = (sel: (i: ItemEntrega) => number) => (rows: ItemEntrega[]): React.ReactNode => celTotMoeda(somaDe(rows, sel));
const totNum = (sel: (i: ItemEntrega) => number) => (rows: ItemEntrega[]): React.ReactNode => celTotNum(somaDe(rows, sel));

/** Valor custo/venda: segue o toggle "Mostrar venda" (mesma leitura da tela de pedidos). */
function ValorCV({ custo, venda }: { custo: number; venda: number }) {
  const { mostrarCusto } = useContext(OpcoesTabelaContext);
  if (!mostrarCusto) return <span className="whitespace-nowrap tabular-nums">{formatBRL(venda)}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-amber-500" title="Custo"><Coins className="size-3 shrink-0" aria-hidden />{formatBRL(custo)}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-emerald-500" title="Venda"><Tag className="size-3 shrink-0" aria-hidden />{formatBRL(venda)}</span>
    </span>
  );
}

/** Tag do código do produto, no mesmo visual translúcido da tag de pedido.
 * Sem link: o Odoo não expõe uma URL própria da tela do produto a partir do
 * que o cache traz (o ItemEntrega não carrega o id do produto). Fica só a tag. */
function TagCodigo({ codigo }: { codigo: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground ring-1 ring-inset ring-foreground/15">
      {codigo}
    </span>
  );
}

// ===== Colunas =====
export const COLUNAS: ColunaDef<ItemEntrega>[] = [
  { key: "codigo", label: "Código", tipo: "texto", sortable: true, numeric: false, padrao: true, obrigatoria: true, valor: (i) => i.codigo, sortKey: (i) => Number(String(i.codigo).replace(/\D/g, "")) || i.codigo },
  { key: "produto", label: "Produto", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (i) => i.produto },
  { key: "familia", label: "Família", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (i) => i.familia },
  { key: "marca", label: "Marca", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (i) => i.marca },
  { key: "qtdTotal", label: "Total", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (i) => i.qtdTotal, rodape: totNum((i) => i.qtdTotal) },
  { key: "qtdAtendida", label: "Atend.", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (i) => i.qtdAtendida, rodape: totNum((i) => i.qtdAtendida) },
  { key: "qtd", label: "A Atender", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (i) => i.qtd, rodape: totNum((i) => i.qtd) },
  { key: "unitario", label: "Unitário", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (i) => i.unitario },
  { key: "valorProduto", label: "Valor Produto", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (i) => i.valorCustoTotal, rodape: (rows) => <ValorCV custo={somaDe(rows, (i) => i.valorCustoTotal)} venda={somaDe(rows, (i) => i.valorCheio)} /> },
  { key: "valorAtender", label: "Valor A Atender", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (i) => i.vlrCusto, rodape: (rows) => <ValorCV custo={somaDe(rows, (i) => i.vlrCusto)} venda={somaDe(rows, (i) => i.vlrVenda)} /> },
  { key: "desconto", label: "Desconto", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (i) => i.descontoValor, rodape: totMoeda((i) => i.descontoValor) },
  { key: "comissao", label: "Comissão", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (i) => i.comissaoValor, rodape: totMoeda((i) => i.comissaoValor) },
  { key: "liquido", label: "Líquido", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (i) => i.liquido, rodape: totMoeda((i) => i.liquido) },
  { key: "margemPct", label: "Margem", tipo: "percent", sortable: true, numeric: true, padrao: true, valor: (i) => i.margemPct },
];

export const COLUNA_BY_KEY: Record<string, ColunaDef<ItemEntrega>> = Object.fromEntries(
  COLUNAS.map((c) => [c.key, c]),
);

// ===== Célula (branch por key, com fallback por tipo) =====
export function celula(it: ItemEntrega, key: string): React.ReactNode {
  const col = COLUNA_BY_KEY[key];
  if (!col) return null;
  // Código como tag (padrão da tabela de pedidos) e nunca truncado: sempre visível.
  if (key === "codigo") return <TagCodigo codigo={it.codigo} />;
  if (key === "valorProduto") return <ValorCV custo={it.valorCustoTotal} venda={it.valorCheio} />;
  if (key === "valorAtender") return <ValorCV custo={it.vlrCusto} venda={it.vlrVenda} />;
  if (key === "desconto") return <span className="whitespace-nowrap tabular-nums text-muted-foreground" title={`Desconto ${formatPct(it.descontoPct)}`}>{formatBRL(it.descontoValor)}</span>;
  if (key === "comissao") return <span className="whitespace-nowrap tabular-nums text-muted-foreground" title={`Comissão ${formatPct(it.comissaoPct)}`}>{formatBRL(it.comissaoValor)}</span>;
  if (key === "margemPct") {
    if (!itemTemMargem(it)) return <span className="whitespace-nowrap tabular-nums text-muted-foreground" title="Margem não calculada por item no Odoo (só o cabeçalho do pedido tem)">-</span>;
    return <span className={cn("whitespace-nowrap tabular-nums", corMargem(it.margemPct))} title={`Líquido ${formatBRL(it.liquido)}`}>{formatPct(it.margemPct)}</span>;
  }
  switch (col.tipo) {
    case "moeda":
      return <span className="whitespace-nowrap tabular-nums">{formatBRL(Number(it[key] ?? 0))}</span>;
    case "numero":
      return <span className="whitespace-nowrap tabular-nums">{String(it[key] ?? "")}</span>;
    case "percent":
      return <span className="whitespace-nowrap tabular-nums">{formatPct(Number(it[key] ?? 0))}</span>;
    default:
      return <span className="whitespace-nowrap text-foreground">{String(it[key] ?? "")}</span>;
  }
}

// ===== Campos (busca / filtro / agrupamento) =====
export const CAMPOS: CampoDef<ItemEntrega>[] = [
  { key: "codigo", label: "Código", tipo: "texto", grupo: "Produto", comum: true, get: (i) => i.codigo },
  { key: "produto", label: "Produto", tipo: "texto", grupo: "Produto", comum: true, get: (i) => i.produto },
  { key: "familia", label: "Família", tipo: "texto", grupo: "Produto", comum: true, get: (i) => i.familia, grupoKey: (i) => i.familia || "Sem família" },
  { key: "marca", label: "Marca", tipo: "texto", grupo: "Produto", comum: true, get: (i) => i.marca, grupoKey: (i) => i.marca || "Sem marca" },
  { key: "qtd", label: "A Atender", tipo: "numero", grupo: "Quantidade", comum: true, get: (i) => i.qtd },
  { key: "qtdTotal", label: "Total", tipo: "numero", grupo: "Quantidade", comum: false, get: (i) => i.qtdTotal },
  { key: "qtdAtendida", label: "Atendida", tipo: "numero", grupo: "Quantidade", comum: false, get: (i) => i.qtdAtendida },
  { key: "unitario", label: "Unitário", tipo: "numero", grupo: "Valores", comum: false, get: (i) => i.unitario },
  { key: "vlrCusto", label: "Valor a Atender (custo)", tipo: "numero", grupo: "Valores", comum: true, get: (i) => i.vlrCusto },
  { key: "descontoValor", label: "Desconto", tipo: "numero", grupo: "Valores", comum: false, get: (i) => i.descontoValor },
  { key: "comissaoValor", label: "Comissão", tipo: "numero", grupo: "Valores", comum: false, get: (i) => i.comissaoValor },
  { key: "margemPct", label: "Margem", tipo: "numero", grupo: "Valores", comum: false, get: (i) => i.margemPct },
];

export const CAMPO_BY_KEY: Record<string, CampoDef<ItemEntrega>> = Object.fromEntries(
  CAMPOS.map((c) => [c.key, c]),
);

export const AGRUPAMENTOS: { campo: string; label: string }[] = [
  { campo: "familia", label: "Família" },
  { campo: "marca", label: "Marca" },
];
