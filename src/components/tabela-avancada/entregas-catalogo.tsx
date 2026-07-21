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

import { CircleCheck, CircleX, ExternalLink, Package, MapPin, FileText, ClipboardList, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { corEtapaValida, derivarCorTag } from "@/lib/diretoria/etapa-cor";
import { formatarNomeEtapa } from "@/lib/diretoria/etapa-formato";
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
  custoComercial: number;
  icms: number;
  difal: number;
  fcp: number;
  pis: number;
  cofins: number;
  comissaoPct: number;
  comissaoValor: number;
  liquido: number;
  margemPct: number;
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

// ===== Colunas do PEDIDO (cabeçalho da lista + tela de detalhe) =====

export const COLUNAS: ColunaDef<LinhaEntrega>[] = [
  { key: "numero", label: "Pedido", tipo: "texto", sortable: true, numeric: false, padrao: true, obrigatoria: true, valor: (l) => l.numero },
  { key: "mercos", label: "Nº Mercos", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.mercos },
  { key: "itens", label: "Produtos", tipo: "numero", sortable: true, numeric: false, padrao: true, valor: (l) => l.qtdItens },
  { key: "cliente", label: "Cliente", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cliente, detalheSpan: 2 },
  { key: "uf", label: "UF", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.uf },
  { key: "cidade", label: "Cidade", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cidade },
  { key: "etapa", label: "Etapa", tipo: "tagCor", sortable: true, numeric: false, padrao: true, valor: (l) => formatarNomeEtapa(l.etapa) },
  { key: "prevista", label: "Prevista", tipo: "data", sortable: true, numeric: false, padrao: true, valor: (l) => l.prevista },
  // Quantidades (unidades): total, atendida, a atender.
  { key: "qtdTotal", label: "Qtd total", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtdTotal },
  { key: "qtdAtendida", label: "Qtd atendida", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtdAtendida },
  { key: "qtd", label: "Qtd a atender", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtd },
  // Valores a CUSTO (padrão): total, atendido, a atender.
  { key: "valorTotalCusto", label: "Valor total (custo)", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorTotalCusto },
  { key: "valorAtendidoCusto", label: "Valor atendido (custo)", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorAtendidoCusto },
  { key: "vlrCusto", label: "Valor a atender (custo)", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.vlrCusto },
  { key: "status", label: "Financeiro", tipo: "status", sortable: true, numeric: false, padrao: true, valor: (l) => l.status },
  // Valores a VENDA (opcionais; o toggle custo/venda com ícones vem na próxima leva).
  { key: "valorCheio", label: "Valor total (venda)", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorCheio },
  { key: "valorAtendidoVenda", label: "Valor atendido (venda)", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorAtendidoVenda },
  { key: "vlrVenda", label: "Valor a atender (venda)", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.vlrVenda },
  // Rentabilidade do pedido (prontos do Odoo). Margem padrão; resto opcional.
  { key: "margemPct", label: "Margem", tipo: "percent", sortable: true, numeric: true, padrao: true, valor: (l) => l.margemPct },
  { key: "subtotal", label: "Subtotal", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.subtotal },
  { key: "comissaoPct", label: "% comissão", tipo: "percent", sortable: true, numeric: true, padrao: false, valor: (l) => l.comissaoPct },
  { key: "comissaoValor", label: "Comissão", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.comissaoValor },
  { key: "custoComercial", label: "Custo comercial", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.custoComercial },
  { key: "icms", label: "ICMS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.icms },
  { key: "difal", label: "DIFAL", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.difal },
  { key: "fcp", label: "FCP", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.fcp },
  { key: "pis", label: "PIS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.pis },
  { key: "cofins", label: "COFINS", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.cofins },
  { key: "liquido", label: "Líquido", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.liquido },
  // Cabeçalho (não-default; disponíveis no seletor de colunas / detalhe).
  { key: "orcamento", label: "Orçamento", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.orcamento },
  { key: "contrato", label: "Validade", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.contrato },
  { key: "emitente", label: "Emitente", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.emitente, detalheSpan: 2 },
  { key: "cnpj", label: "CNPJ", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.cnpj },
  { key: "cep", label: "CEP", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.cep },
  { key: "operacao", label: "Operação", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.operacao, detalheSpan: 2 },
  { key: "modalidade", label: "Modalidade", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.modalidade },
  { key: "forma", label: "Forma de pagamento", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.forma },
  { key: "vendedor", label: "Vendedor", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.vendedor },
  { key: "observacoes", label: "Observações", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.observacoes, detalheSpan: 4 },
  { key: "obsEntrega", label: "Obs entrega", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.obsEntrega, detalheSpan: 4 },
];

export const COLUNA_BY_KEY: Record<string, ColunaDef<LinhaEntrega>> = Object.fromEntries(
  COLUNAS.map((c) => [c.key, c]),
);

// ===== Campos por domínio (filtro / busca / agrupamento) =====

const STATUS_OPCOES = [
  { valor: "Liberado", label: "Liberado" },
  { valor: "Bloqueado", label: "Bloqueado" },
];

export const CAMPOS: CampoDef<LinhaEntrega>[] = [
  // Pedido
  { key: "numero", label: "Pedido", tipo: "texto", grupo: "Pedido", comum: true, get: (l) => l.numero },
  { key: "mercos", label: "Nº Mercos", tipo: "texto", grupo: "Pedido", comum: false, get: (l) => l.mercos },
  { key: "operacao", label: "Operação", tipo: "opcao", grupo: "Pedido", comum: false, get: (l) => l.operacao },
  { key: "modalidade", label: "Modalidade", tipo: "opcao", grupo: "Pedido", comum: false, get: (l) => l.modalidade },
  // Cliente
  { key: "cliente", label: "Cliente", tipo: "texto", grupo: "Cliente", comum: true, get: (l) => l.cliente },
  { key: "cnpj", label: "CNPJ", tipo: "texto", grupo: "Cliente", comum: false, get: (l) => l.cnpj },
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
  // Datas
  { key: "orcamento", label: "Data do orçamento", tipo: "data", grupo: "Datas", comum: false, get: (l) => l.orcamento, grupoKey: (l) => mesLabel(l.orcamento) },
  { key: "prevista", label: "Data prevista", tipo: "data", grupo: "Datas", comum: true, get: (l) => l.prevista, grupoKey: (l) => mesLabel(l.prevista) },
  { key: "contrato", label: "Contrato", tipo: "data", grupo: "Datas", comum: false, get: (l) => l.contrato },
  // Financeiro
  { key: "status", label: "Financeiro", tipo: "opcao", grupo: "Financeiro", comum: true, get: (l) => l.status, opcoes: STATUS_OPCOES },
  { key: "vlrVenda", label: "A atender (venda R$)", tipo: "numero", grupo: "Financeiro", comum: true, get: (l) => l.vlrVenda },
  { key: "vlrCusto", label: "A atender (custo R$)", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.vlrCusto },
  { key: "qtd", label: "Qtd a atender", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtd },
  { key: "itens", label: "Nº de produtos", tipo: "numero", grupo: "Financeiro", comum: false, get: (l) => l.qtdItens },
  // Observações
  { key: "observacoes", label: "Observações", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.observacoes },
  { key: "obsEntrega", label: "Obs entrega", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.obsEntrega },
];

export const CAMPO_BY_KEY: Record<string, CampoDef<LinhaEntrega>> = Object.fromEntries(
  CAMPOS.map((c) => [c.key, c]),
);

/** Campos oferecidos no "Agrupar por" (dimensões do pedido que fazem sentido). */
export const AGRUPAMENTOS: { campo: string; label: string }[] = [
  { campo: "etapa", label: "Etapa" },
  { campo: "cliente", label: "Cliente" },
  { campo: "uf", label: "UF" },
  { campo: "vendedor", label: "Vendedor" },
  { campo: "status", label: "Financeiro" },
  { campo: "operacao", label: "Operação" },
  { campo: "prevista", label: "Mês previsto" },
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
  if (!podeAbrir) return <span className={base}>{numero}</span>;
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
      <span className="tabular-nums">{numero}</span>
      <ExternalLink className={cn("shrink-0 text-muted-foreground", grande ? "size-4" : "size-3")} aria-hidden />
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

// ===== Render de célula por tipo (cabeçalho do pedido) =====

export function celula(l: LinhaEntrega, key: string): React.ReactNode {
  const col = COLUNA_BY_KEY[key];
  if (!col) return null;
  // Pedido: tag translúcida clicável (abre no Odoo).
  if (key === "numero") return <TagPedido numero={l.numero} pedidoId={l.pedidoId} />;
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

const GRID_ITEM = "grid grid-cols-[3.5rem_minmax(0,1fr)_7.5rem_6rem_4rem_4.5rem_5rem_7rem_8rem] gap-3";

/** Produtos de um pedido, um embaixo do outro, colunas alinhadas, divisórias
 * bem leves (sem cara de tabela). Rola no próprio contêiner quando estreito.
 * Quantidades: Total / Atendido / A atender (mesma leitura do Odoo). */
export function ListaProdutos({ itens }: { itens: ItemEntrega[] }) {
  if (!itens.length) return <p className="px-1 text-sm text-muted-foreground">Sem produtos a atender neste pedido.</p>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[58rem]">
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

function Secao({ titulo, icone: Icone, children }: { titulo: string; icone: typeof Package; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/60 pt-5 first:border-0 first:pt-0">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icone className="size-3.5" aria-hidden /> {titulo}
      </h3>
      {children}
    </section>
  );
}

function Campo({ label, valor, span }: { label: string; valor: string; span?: 2 | 4 }) {
  return (
    <div className={cn("min-w-0", span === 4 ? "col-span-2 md:col-span-4" : span === 2 ? "col-span-2" : "")}>
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{valor && valor !== "-" ? valor : "-"}</dd>
    </div>
  );
}

function Stat({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate tabular-nums", destaque ? "text-lg font-bold text-foreground" : "text-base font-semibold text-foreground")}>{valor}</p>
    </div>
  );
}

/** Corpo da tela de detalhe de um pedido (passado como `renderDetalhe`). */
export function DetalheEntrega({ l }: { l: LinhaEntrega }) {
  const temObs = (l.observacoes && l.observacoes !== "-") || (l.obsEntrega && l.obsEntrega !== "-");
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
        {l.cnpj && l.cnpj !== "-" && <p className="text-xs text-muted-foreground">CNPJ {l.cnpj}</p>}
      </header>

      {/* Resumo de valores */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-background/40 p-4 sm:grid-cols-4">
        <Stat label="A atender (custo)" valor={formatBRL(l.vlrCusto)} destaque />
        <Stat label="A atender (venda)" valor={formatBRL(l.vlrVenda)} />
        <Stat label="Valor total (custo)" valor={formatBRL(l.valorTotalCusto)} />
        <Stat label="Qtd total / atend. / a atender" valor={`${l.qtdTotal} / ${l.qtdAtendida} / ${l.qtd}`} />
      </div>

      <dl className="space-y-5">
        <Secao titulo="Identificação" icone={ClipboardList}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo label="Nº Mercos" valor={l.mercos} />
            <Campo label="Orçamento" valor={formatarDataBR(l.orcamento)} />
            <Campo label="Prevista" valor={formatarDataBR(l.prevista)} />
            <Campo label="Validade" valor={formatarDataBR(l.contrato)} />
            <Campo label="Emitente" valor={l.emitente} span={2} />
            <Campo label="Vendedor" valor={l.vendedor} />
            <Campo label="Forma de pagamento" valor={l.forma} />
            <Campo label="Operação" valor={l.operacao} span={2} />
            <Campo label="Modalidade" valor={l.modalidade} />
          </div>
        </Secao>

        <Secao titulo="Cliente e endereço" icone={MapPin}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo label="Cliente" valor={l.cliente} span={2} />
            <Campo label="CNPJ" valor={l.cnpj} />
            <Campo label="CEP" valor={l.cep} />
            <Campo label="UF" valor={l.uf} />
            <Campo label="Cidade" valor={l.cidade} />
          </div>
        </Secao>

        {(l.subtotal !== 0 || l.liquido !== 0 || l.custoComercial !== 0) && (
          <Secao titulo="Rentabilidade do pedido" icone={TrendingUp}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Campo label="Subtotal" valor={formatBRL(l.subtotal)} />
              <Campo label="Custo comercial" valor={formatBRL(l.custoComercial)} />
              <Campo label={`Comissão (${formatPct(l.comissaoPct)})`} valor={formatBRL(l.comissaoValor)} />
              <Campo label="ICMS" valor={formatBRL(l.icms)} />
              <Campo label="DIFAL" valor={formatBRL(l.difal)} />
              <Campo label="FCP" valor={formatBRL(l.fcp)} />
              <Campo label="PIS" valor={formatBRL(l.pis)} />
              <Campo label="COFINS" valor={formatBRL(l.cofins)} />
              <Campo label="Líquido" valor={formatBRL(l.liquido)} />
              <div className="min-w-0">
                <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Margem</dt>
                <dd className={cn("mt-0.5 text-sm font-semibold tabular-nums", l.margemPct < 0 ? "text-rose-400" : l.margemPct > 0 ? "text-emerald-400" : "text-muted-foreground")}>{formatPct(l.margemPct)}</dd>
              </div>
            </div>
            <p className="mt-3 text-[0.7rem] text-muted-foreground">Valores prontos do Odoo (aba Rentabilidade). Margem = Líquido ÷ Subtotal; o líquido já abate os créditos tributários (Lucro Real).</p>
          </Secao>
        )}

        <Secao titulo={`Produtos (${l.itens.length})`} icone={Package}>
          <ListaProdutos itens={l.itens} />
        </Secao>

        {temObs && (
          <Secao titulo="Observações" icone={FileText}>
            <div className="space-y-3">
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Observações do pedido</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{l.observacoes && l.observacoes !== "-" ? l.observacoes : "-"}</p>
              </div>
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Obs de entrega</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{l.obsEntrega && l.obsEntrega !== "-" ? l.obsEntrega : "-"}</p>
              </div>
            </div>
          </Secao>
        )}
      </dl>
    </div>
  );
}
