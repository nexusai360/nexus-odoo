"use client";

/**
 * Catálogo do B-09 (Entregas Parciais) para a tabela avançada: shape da linha,
 * colunas (exibição/sort), campos por domínio (filtro/agrupamento), agrupamentos
 * e o render de célula por tipo. Reusa a cor de etapa (Fase 2) e o ícone de
 * status financeiro (Fase 2). É o único acoplamento a domínio da tabela nova.
 */

import { CircleCheck, CircleX, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { corEtapaValida, derivarCorTag } from "@/lib/diretoria/etapa-cor";
import { formatarNomeEtapa } from "@/lib/diretoria/etapa-formato";
import type { ColunaDef, CampoDef } from "./tipos";

// ===== Shape da linha (montado em blocos-pedidos.tsx) =====

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
  codigo: string;
  produto: string;
  familia: string;
  marca: string;
  operacao: string;
  modalidade: string;
  etapa: string;
  etapaCor: string | false | null;
  qtd: number;
  unitario: number;
  valorCheio: number;
  vlrVenda: number;
  vlrCusto: number;
  status: string;
  forma: string;
  vendedor: string;
  observacoes: string;
  obsEntrega: string;
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

// ===== Colunas =====

export const COLUNAS: ColunaDef<LinhaEntrega>[] = [
  { key: "numero", label: "Pedido", tipo: "texto", sortable: true, numeric: false, padrao: true, obrigatoria: true, valor: (l) => l.numero },
  { key: "mercos", label: "Nº Mercos", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.mercos },
  { key: "orcamento", label: "Orçamento", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.orcamento },
  { key: "prevista", label: "Prevista", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.prevista },
  { key: "contrato", label: "Contrato", tipo: "data", sortable: true, numeric: false, padrao: false, valor: (l) => l.contrato },
  { key: "emitente", label: "Emitente", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.emitente, detalheSpan: 2 },
  { key: "cliente", label: "Cliente", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cliente, detalheSpan: 2 },
  { key: "cnpj", label: "CNPJ", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.cnpj },
  { key: "cep", label: "CEP", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.cep },
  { key: "uf", label: "UF", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.uf },
  { key: "cidade", label: "Cidade", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.cidade },
  { key: "codigo", label: "Código", tipo: "texto", sortable: false, numeric: false, padrao: false, valor: (l) => l.codigo },
  { key: "produto", label: "Produto", tipo: "texto", sortable: true, numeric: false, padrao: true, valor: (l) => l.produto, detalheSpan: 2 },
  { key: "familia", label: "Família", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.familia },
  { key: "marca", label: "Marca", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.marca },
  { key: "operacao", label: "Operação", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.operacao, detalheSpan: 2 },
  { key: "modalidade", label: "Modalidade", tipo: "texto", sortable: true, numeric: false, padrao: false, valor: (l) => l.modalidade },
  { key: "etapa", label: "Etapa", tipo: "tagCor", sortable: true, numeric: false, padrao: true, valor: (l) => formatarNomeEtapa(l.etapa) },
  { key: "qtd", label: "Qtd a atender", tipo: "numero", sortable: true, numeric: true, padrao: true, valor: (l) => l.qtd },
  { key: "unitario", label: "Unitário", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.unitario },
  { key: "valorCheio", label: "Valor cheio", tipo: "moeda", sortable: true, numeric: true, padrao: false, valor: (l) => l.valorCheio },
  { key: "vlrVenda", label: "A atender (venda)", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.vlrVenda },
  { key: "vlrCusto", label: "A atender (custo)", tipo: "moeda", sortable: true, numeric: true, padrao: true, valor: (l) => l.vlrCusto },
  { key: "status", label: "Financeiro", tipo: "status", sortable: true, numeric: false, padrao: true, valor: (l) => l.status },
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
  // Produto
  { key: "produto", label: "Produto", tipo: "texto", grupo: "Produto", comum: true, get: (l) => l.produto },
  { key: "codigo", label: "Código", tipo: "texto", grupo: "Produto", comum: false, get: (l) => l.codigo },
  { key: "familia", label: "Família", tipo: "opcao", grupo: "Produto", comum: true, get: (l) => l.familia },
  { key: "marca", label: "Marca", tipo: "opcao", grupo: "Produto", comum: true, get: (l) => l.marca },
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
  // Observações
  { key: "observacoes", label: "Observações", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.observacoes },
  { key: "obsEntrega", label: "Obs entrega", tipo: "texto", grupo: "Observações", comum: false, get: (l) => l.obsEntrega },
];

export const CAMPO_BY_KEY: Record<string, CampoDef<LinhaEntrega>> = Object.fromEntries(
  CAMPOS.map((c) => [c.key, c]),
);

/** Campos oferecidos no "Agrupar por" (dimensões que fazem sentido agrupar). */
export const AGRUPAMENTOS: { campo: string; label: string }[] = [
  { campo: "etapa", label: "Etapa" },
  { campo: "cliente", label: "Cliente" },
  { campo: "uf", label: "UF" },
  { campo: "vendedor", label: "Vendedor" },
  { campo: "status", label: "Financeiro" },
  { campo: "operacao", label: "Operação" },
  { campo: "marca", label: "Marca" },
  { campo: "familia", label: "Família" },
  { campo: "prevista", label: "Mês previsto" },
];

// ===== Tag do pedido (abre o pedido no Odoo em nova aba) =====

/** Número do pedido como tag translúcida (foreground/10: preta translúcida no
 * claro, branca translúcida no escuro). Clicável quando há id do Odoo; o clique
 * não propaga para não abrir o detalhe da linha por baixo. */
export function TagPedido({ numero, pedidoId }: { numero: string; pedidoId: number }) {
  const base =
    "inline-flex max-w-full items-center gap-1 truncate rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-semibold text-foreground ring-1 ring-inset ring-foreground/15 transition-colors";
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
      <span className="truncate tabular-nums">{numero}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

// ===== Render de célula por tipo =====

export function celula(l: LinhaEntrega, key: string): React.ReactNode {
  const col = COLUNA_BY_KEY[key];
  if (!col) return null;
  // Pedido: tag translúcida clicável (abre no Odoo).
  if (key === "numero") return <TagPedido numero={l.numero} pedidoId={l.pedidoId} />;
  switch (col.tipo) {
    case "moeda":
      return <span className="whitespace-nowrap tabular-nums">{formatBRL(Number(l[key] ?? 0))}</span>;
    case "numero":
      return <span className="whitespace-nowrap tabular-nums">{String(l[key] ?? "")}</span>;
    case "data":
      return <span className="whitespace-nowrap text-muted-foreground">{formatarDataBR(String(l[key] ?? ""))}</span>;
    case "status": {
      const bloqueado = l.status === "Bloqueado";
      const Icone = bloqueado ? CircleX : CircleCheck;
      return (
        <span className="inline-flex items-center" title={l.status}>
          <Icone
            className={cn("size-4", bloqueado ? "text-rose-400" : "text-emerald-400")}
            strokeWidth={2.25}
            aria-label={l.status}
          />
        </span>
      );
    }
    case "tagCor": {
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
    default:
      return <span className="truncate text-foreground">{String(l[key] ?? "")}</span>;
  }
}
