"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  deleteWebhook,
  listWebhooks,
  toggleWebhook,
  type WebhookListItem,
} from "@/lib/actions/webhooks";
import {
  alternarConexaoWhatsapp,
  apagarConexaoWhatsapp,
  listConnections,
  type ConexaoWhatsappListItem,
} from "@/lib/actions/whatsapp-connection";
import { formatE164ForDisplay } from "@/lib/whatsapp/countries";
import { CopyTag } from "@/components/integracoes/copy-tag";
import {
  webhookKindBadgeClass,
  webhookKindLabel,
  type WebhookKind,
} from "@/lib/integrations/webhook-kind";
import { cn } from "@/lib/utils";

/** Ícone e cores do card por tipo de webhook (mesma identidade da criação). */
const KIND_META: Record<WebhookKind, { icon: typeof ArrowDownToLine; iconColor: string; iconBg: string }> = {
  whatsapp: { icon: MessageCircle, iconColor: "text-green-500", iconBg: "bg-green-500/10" },
  inbound_generic: { icon: ArrowDownToLine, iconColor: "text-sky-500", iconBg: "bg-sky-500/10" },
  outbound: { icon: ArrowUpFromLine, iconColor: "text-violet-500", iconBg: "bg-violet-500/10" },
};

function webhookKindOf(webhook: WebhookListItem): WebhookKind {
  if (webhook.direction !== "inbound") return "outbound";
  return webhook.isWhatsappReceiver ? "whatsapp" : "inbound_generic";
}

interface Props {
  initial: WebhookListItem[];
  /** Conexões com WhatsApp (uma entrada por conexão; só super_admin as vê). */
  initialConexoes?: ConexaoWhatsappListItem[];
  /** Perfil pode ver/gerir Conexões (super_admin). Decide qual refresh usar. */
  podeVerConexoes?: boolean;
  /** URL base dos webhooks de entrada (`.../api/hooks/`). */
  inboundBaseUrl: string;
}

// Timezone fixo (Brasil) para o texto bater entre servidor (UTC) e cliente e não
// quebrar a hidratação.
const TZ = "America/Sao_Paulo";

function formatDateTime(date: Date) {
  const dt = new Date(date);
  const d = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(dt);
  const t = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TZ,
  }).format(dt);
  return `${d} às ${t}`;
}

/** Tipos disponíveis no filtro (ordem da criação). */
const KIND_OPTIONS: WebhookKind[] = ["whatsapp", "inbound_generic", "outbound"];

export function WebhooksContent({
  initial,
  initialConexoes = [],
  podeVerConexoes = false,
  inboundBaseUrl,
}: Props) {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initial);
  const [conexoes, setConexoes] = useState<ConexaoWhatsappListItem[]>(initialConexoes);
  const [isPending, startTransition] = useTransition();
  // Filtros (client-side): busca global + tipos selecionados.
  const [search, setSearch] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<WebhookKind[]>([]);

  const term = search.trim().toLowerCase();
  const filtered = webhooks.filter((w) => {
    if (selectedKinds.length > 0 && !selectedKinds.includes(webhookKindOf(w))) return false;
    if (!term) return true;
    // Endereço exibido (com a barra do slug) + tudo que aparece no card, para a
    // busca casar com nome, slug ("/teste"), tipo, método e número do WhatsApp.
    const endpoint =
      w.direction === "inbound" ? (w.path ? `/${w.path}` : "") : (w.targetUrl ?? "");
    const haystack = [
      w.name ?? "",
      w.path ?? "",
      endpoint,
      w.targetUrl ?? "",
      w.businessId ?? "",
      w.businessId ? formatE164ForDisplay(w.businessId) : "",
      w.description ?? "",
      webhookKindLabel(webhookKindOf(w)),
      w.methods.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  // Conexões passam pelos MESMOS filtros (tipo "whatsapp" + busca).
  const conexoesFiltradas = conexoes.filter((c) => {
    if (selectedKinds.length > 0 && !selectedKinds.includes("whatsapp")) return false;
    if (!term) return true;
    const haystack = [
      c.name ?? "",
      c.path ?? "",
      c.path ? `/${c.path}` : "",
      c.targetUrl ?? "",
      c.businessId ?? "",
      c.businessId ? formatE164ForDisplay(c.businessId) : "",
      c.description ?? "",
      webhookKindLabel("whatsapp"),
      "post",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  const totalItens = webhooks.length + conexoes.length;
  const totalFiltrados = filtered.length + conexoesFiltradas.length;

  function toggleKind(k: WebhookKind) {
    setSelectedKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function clearFilters() {
    setSearch("");
    setSelectedKinds([]);
  }

  async function refresh() {
    if (podeVerConexoes) {
      const result = await listConnections();
      if (result.success) {
        setConexoes(result.data.conexoes);
        setWebhooks(result.data.avulsos);
      }
      return;
    }
    const result = await listWebhooks();
    if (result.success) setWebhooks(result.data);
  }

  function handleToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await toggleWebhook(id, enabled);
      if (result.success) {
        await refresh();
      } else {
        toast.error(result.error ?? "Erro ao atualizar webhook");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteWebhook(id);
      if (result.success) {
        await refresh();
        toast.success("Webhook removido");
      } else {
        toast.error(result.error ?? "Erro ao remover webhook");
      }
    });
  }

  function handleToggleConexao(connectionId: string, enabled: boolean) {
    startTransition(async () => {
      const result = await alternarConexaoWhatsapp(connectionId, enabled);
      if (result.success) {
        await refresh();
      } else {
        toast.error(result.error ?? "Erro ao atualizar a conexão");
      }
    });
  }

  function handleDeleteConexao(connectionId: string) {
    startTransition(async () => {
      const result = await apagarConexaoWhatsapp(connectionId);
      if (result.success) {
        await refresh();
        toast.success("Conexão removida");
      } else {
        toast.error(result.error ?? "Erro ao remover a conexão");
      }
    });
  }

  return (
    <div className="space-y-6 ">
      {/* Cabeçalho com botão de criação (navega para a tela cheia) */}
      <div data-tour="webhooks-novo" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalItens === 0
            ? "Nenhum webhook configurado"
            : `${totalFiltrados} de ${totalItens} ${totalItens !== 1 ? "itens" : "item"}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() => router.push("/integracoes/webhooks/novo")}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Novo webhook
        </Button>
      </div>

      {/* Busca global + filtro por tipo (client-side), no padrão do router. */}
      {totalItens > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 sm:max-w-md">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="Busca avançada…"
                aria-label="Busca avançada nos webhooks"
                className="pl-8"
              />
            </div>
            {/* Limpar: logo após o input, só quando há tipo selecionado. */}
            {selectedKinds.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                aria-label="Limpar filtros"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <TypeMultiSelect selected={selectedKinds} onToggle={toggleKind} onClear={() => setSelectedKinds([])} />
          </div>
        </div>
      )}

      {/* Lista: Conexões com WhatsApp (uma entrada por conexão) + webhooks. */}
      <div data-tour="webhooks-lista" className="space-y-3">
        {totalItens === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
            <ArrowDownToLine className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum webhook configurado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Crie um webhook para receber ou enviar eventos de outros sistemas.
            </p>
          </div>
        ) : totalFiltrados === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-10 text-center">
            <Search className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum webhook encontrado para o filtro.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 cursor-pointer text-xs text-violet-600 hover:underline dark:text-violet-400"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            {conexoesFiltradas.map((c) => (
              <ConexaoRow
                key={c.connectionId}
                conexao={c}
                inboundBaseUrl={inboundBaseUrl}
                isPending={isPending}
                onToggle={handleToggleConexao}
                onDelete={handleDeleteConexao}
              />
            ))}
            {filtered.map((wh) => (
              <WebhookRow
                key={wh.id}
                webhook={wh}
                inboundBaseUrl={inboundBaseUrl}
                isPending={isPending}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Multi-select de tipo de webhook (tags coloridas que acendem ao marcar). */
function TypeMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: WebhookKind[];
  onToggle: (k: WebhookKind) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    selected.length === 0
      ? "Todos os tipos de webhook"
      : selected.length === 1
        ? webhookKindLabel(selected[0])
        : `${selected.length} tipos`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por tipo"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-8 min-w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={4} className="w-[260px] overflow-hidden p-1">
        <ul role="listbox" aria-label="Tipo de webhook" className="flex flex-col">
          {KIND_OPTIONS.map((k) => {
            const isOn = selected.includes(k);
            return (
              <li key={k} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isOn}
                  onClick={() => onToggle(k)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors",
                      isOn && "border-violet-500 bg-violet-500 text-white",
                    )}
                    aria-hidden
                  >
                    {isOn ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                      // Apagado (neutro) quando não selecionado; acende na cor do
                      // tipo ao marcar a checkbox.
                      isOn ? webhookKindBadgeClass(k) : "bg-muted text-muted-foreground",
                    )}
                  >
                    {webhookKindLabel(k)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={onClear}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ConexaoRow , UMA entrada por Conexão com WhatsApp (as duas linhas agrupadas)
// ──────────────────────────────────────────────────────────────────────────────

function ConexaoRow({
  conexao,
  inboundBaseUrl,
  isPending,
  onToggle,
  onDelete,
}: {
  conexao: ConexaoWhatsappListItem;
  inboundBaseUrl: string;
  isPending: boolean;
  onToggle: (connectionId: string, enabled: boolean) => void;
  onDelete: (connectionId: string) => void;
}) {
  const router = useRouter();
  const km = KIND_META.whatsapp;
  const semEnvio = conexao.outboundId === null || !conexao.targetUrl;
  const urlEntrada = conexao.path ? `${inboundBaseUrl}${conexao.path}` : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20",
        !conexao.enabled && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              conexao.enabled ? km.iconBg : "bg-muted",
            )}
          >
            <MessageCircle
              className={cn("h-4 w-4", conexao.enabled ? km.iconColor : "text-muted-foreground")}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{conexao.name ?? "Conexão"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  webhookKindBadgeClass("whatsapp"),
                )}
              >
                {webhookKindLabel("whatsapp")}
              </span>
              {semEnvio && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  Envio pendente
                </span>
              )}
            </div>

            <Descricao texto={conexao.description} />

            {/* Uma linha por ponta: recebimento em cima, envio embaixo. */}
            <div className="space-y-1">
              {urlEntrada && (
                <EnderecoLinha
                  icone={ArrowDownToLine}
                  url={urlEntrada}
                  rotulo="Copiar endereço de recebimento"
                />
              )}
              {conexao.targetUrl && (
                <EnderecoLinha
                  icone={ArrowUpFromLine}
                  url={conexao.targetUrl}
                  rotulo="Copiar endereço de envio"
                />
              )}
            </div>

            {conexao.businessId && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                WhatsApp:
                <CopyTag
                  value={conexao.businessId}
                  label="Copiar número (somente dígitos)"
                  className="tabular-nums"
                >
                  {formatE164ForDisplay(conexao.businessId)}
                </CopyTag>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Criada em {formatDateTime(conexao.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Switch
                  checked={conexao.enabled}
                  onCheckedChange={(v) => onToggle(conexao.connectionId, v)}
                  disabled={isPending}
                  aria-label={conexao.enabled ? "Desabilitar conexão" : "Habilitar conexão"}
                />
              }
            />
            <TooltipContent>{conexao.enabled ? "Desabilitar" : "Habilitar"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Editar conexão"
                  onClick={() =>
                    router.push(`/integracoes/webhooks/conexao/${conexao.connectionId}/editar`)
                  }
                />
              }
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Editar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => onDelete(conexao.connectionId)}
                  aria-label="Remover conexão"
                />
              }
            >
              <Trash2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Remover (apaga as duas pontas)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

/** Descrição do webhook. */
function Descricao({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="text-[11px] text-muted-foreground">{texto}</p>;
}

/**
 * Uma ponta do webhook: seta (entrada/saída) + URL COMPLETA copiável + método.
 * A URL só ganha reticências quando falta espaço de verdade (`min-w-0` +
 * `truncate`), nunca por uma largura fixa , em tela larga ela aparece inteira.
 */
function EnderecoLinha({
  icone: Icone,
  url,
  rotulo,
  metodo = "POST",
}: {
  icone: typeof ArrowDownToLine;
  url: string;
  rotulo: string;
  metodo?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <CopyTag value={url} label={rotulo}>
        {url}
      </CopyTag>
      <span className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
        {metodo}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// WebhookRow
// ──────────────────────────────────────────────────────────────────────────────

interface WebhookRowProps {
  webhook: WebhookListItem;
  inboundBaseUrl: string;
  isPending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

function WebhookRow({ webhook, inboundBaseUrl, isPending, onToggle, onDelete }: WebhookRowProps) {
  const router = useRouter();
  const isInbound = webhook.direction === "inbound";
  const kind = webhookKindOf(webhook);
  const km = KIND_META[kind];
  const KindIcon = km.icon;
  const isWhatsapp = kind === "whatsapp";
  // URL COMPLETA nas duas direções (entrada = base + slug; saída = destino).
  const endpoint = isInbound
    ? webhook.path
      ? `${inboundBaseUrl}${webhook.path}`
      : null
    : webhook.targetUrl;
  const enderecoLabel = isInbound ? "Copiar endereço de entrada" : "Copiar endereço de destino";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20",
        !webhook.enabled && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Desativado: card fica ofuscado e o ícone vira cinza. */}
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              webhook.enabled ? km.iconBg : "bg-muted",
            )}
          >
            <KindIcon className={cn("h-4 w-4", webhook.enabled ? km.iconColor : "text-muted-foreground")} />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{webhook.name ?? "Webhook"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  webhookKindBadgeClass(kind),
                )}
              >
                {webhookKindLabel(kind)}
              </span>
            </div>
            <Descricao texto={webhook.description} />
            <div className="flex min-w-0 items-center gap-1.5">
              {endpoint && (
                <CopyTag value={endpoint} label={enderecoLabel}>
                  {endpoint}
                </CopyTag>
              )}
              {webhook.methods.map((m) => (
                <span
                  key={m}
                  className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"
                >
                  {m}
                </span>
              ))}
            </div>
            {isWhatsapp && webhook.businessId && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                WhatsApp:
                <CopyTag
                  value={webhook.businessId}
                  label="Copiar número (somente dígitos)"
                  className="tabular-nums"
                >
                  {formatE164ForDisplay(webhook.businessId)}
                </CopyTag>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Criado em {formatDateTime(webhook.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Switch
                  checked={webhook.enabled}
                  onCheckedChange={(v) => onToggle(webhook.id, v)}
                  disabled={isPending}
                  aria-label={webhook.enabled ? "Desabilitar webhook" : "Habilitar webhook"}
                />
              }
            />
            <TooltipContent>{webhook.enabled ? "Desabilitar" : "Habilitar"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Editar webhook"
                  onClick={() => router.push(`/integracoes/webhooks/${webhook.id}/editar`)}
                />
              }
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Editar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => onDelete(webhook.id)}
                  aria-label="Remover webhook"
                />
              }
            >
              <Trash2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Remover</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
