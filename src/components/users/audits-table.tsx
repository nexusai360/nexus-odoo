"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageJumpNavigator } from "@/components/agent/consumo/page-jump-navigator";
import { cn } from "@/lib/utils";
import { listAuditLogs, type AuditLogRow } from "@/lib/actions/audit-logs";
import type { AuditAction } from "@/generated/prisma/client";

const ACTION_LABELS: Record<AuditAction, string> = {
  login_succeeded: "Login realizado",
  login_failed: "Login falhou",
  password_reset_requested: "Reset de senha solicitado",
  password_reset_completed: "Senha redefinida",
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_deleted: "Usuário excluído",
  user_role_changed: "Nível de usuário alterado",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  profile_updated: "Perfil atualizado",
  profile_password_changed: "Senha alterada",
  email_change_requested: "Troca de e-mail solicitada",
  email_change_completed: "E-mail alterado",
  setting_updated: "Configuração alterada",
  session_revoked: "Sessão revogada",
  user_domains_changed: "Domínios de acesso alterados",
  // F5
  user_whatsapp_added: "WhatsApp vinculado",
  user_whatsapp_removed: "WhatsApp removido",
  whatsapp_inbound_rejected: "Mensagem WhatsApp rejeitada",
  agent_settings_updated: "Config. do agente atualizada",
  llm_credential_created: "Credencial LLM criada",
  llm_credential_updated: "Credencial LLM atualizada",
  llm_credential_deleted: "Credencial LLM excluída",
  api_key_created: "API key criada",
  api_key_revoked: "API key revogada",
  whatsapp_channel_updated: "Canal WhatsApp atualizado",
  // RBAC v2 — recusa do Agente Nex por permissão de domínio (fast-path sem LLM).
  agent_permission_denied:
    "Pergunta ao Agente Nex negada (sem acesso ao domínio)",
};

function actionLabel(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action;
}

function getActionBadgeClasses(action: AuditAction): string {
  // Falhas / recusas , único vermelho (erro de verdade).
  if (
    action === "login_failed" ||
    action === "agent_permission_denied" ||
    action === "whatsapp_inbound_rejected"
  ) {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }
  // Remoções/desativações/revogações , vinho (rose).
  if (
    action === "session_revoked" ||
    action === "user_deactivated" ||
    action === "user_deleted" ||
    action === "user_whatsapp_removed" ||
    action === "api_key_revoked" ||
    action === "llm_credential_deleted"
  ) {
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  }
  if (action.startsWith("login_")) {
    return "bg-sky-500/10 text-sky-400 border-sky-500/20";
  }
  if (action.startsWith("password_") || action === "profile_password_changed") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
  if (action.startsWith("setting_") || action === "agent_settings_updated") {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
  if (action.startsWith("llm_credential_")) {
    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  }
  if (action.startsWith("api_key_")) {
    return "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20";
  }
  if (action.startsWith("user_whatsapp_") || action === "whatsapp_channel_updated") {
    return "bg-teal-500/10 text-teal-400 border-teal-500/20";
  }
  if (action === "user_domains_changed") {
    return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
  }
  if (action.startsWith("email_")) {
    return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
  }
  if (action.startsWith("user_") || action.startsWith("profile_")) {
    return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  }
  // Default colorido (nunca cinza).
  return "bg-pink-500/10 text-pink-400 border-pink-500/20";
}

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatDateTime(date: Date): string {
  return dateTimeFmt.format(new Date(date)).replace(",", "");
}

const PAGE_SIZES = [50, 100, 500] as const;

/** Texto unificado da linha para a busca (todas as colunas/valores). */
function rowSearchText(r: AuditLogRow): string {
  return [
    actionLabel(r.action),
    r.action,
    r.userName,
    r.userEmail,
    r.targetType,
    r.targetId,
    r.ipAddress,
    formatDateTime(r.createdAt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function AuditsTable() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0); // 0-indexed
  const [pageSize, setPageSize] = useState<number>(50);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedActions, setSelectedActions] = useState<AuditAction[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const result = await listAuditLogs();
    if (result.success) {
      setRows(result.data ?? []);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  // Usuários que JÁ têm registro de auditoria (tiveram relação com a
  // plataforma) , só esses aparecem no filtro. Distinto por userId.
  const auditUsers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; email: string | null }
    >();
    for (const r of rows) {
      if (!r.userId || map.has(r.userId)) continue;
      map.set(r.userId, {
        id: r.userId,
        name: r.userName ?? r.userEmail ?? r.userId,
        email: r.userEmail,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [rows]);

  // Ações presentes nos registros , só essas aparecem no filtro de ação.
  const auditActions = useMemo(() => {
    const set = new Set<AuditAction>();
    for (const r of rows) set.add(r.action);
    return Array.from(set).sort((a, b) =>
      actionLabel(a).localeCompare(actionLabel(b), "pt-BR"),
    );
  }, [rows]);

  // Busca (todas as colunas) + filtro por ação(ões) + por usuário(s).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const userSet =
      selectedUserIds.length > 0 ? new Set(selectedUserIds) : null;
    const actionSet =
      selectedActions.length > 0 ? new Set(selectedActions) : null;
    return rows.filter((r) => {
      if (actionSet && !actionSet.has(r.action)) return false;
      if (userSet && (!r.userId || !userSet.has(r.userId))) return false;
      if (q && !rowSearchText(r).includes(q)) return false;
      return true;
    });
  }, [rows, search, selectedUserIds, selectedActions]);

  // Volta para a 1ª página quando busca/filtro mudam (resultado novo).
  useEffect(() => {
    setPage(0);
  }, [search, selectedUserIds, selectedActions]);

  const anyFilter =
    search.trim().length > 0 ||
    selectedUserIds.length > 0 ||
    selectedActions.length > 0;
  const clearAll = () => {
    setSearch("");
    setSelectedUserIds([]);
    setSelectedActions([]);
  };

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = total === 0 ? 0 : safePage * pageSize + 1;
  const endIdx = Math.min((safePage + 1) * pageSize, total);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const goToPage = (next: number) =>
    setPage(Math.min(Math.max(0, next), totalPages - 1));

  const changePageSize = (next: number) => {
    // Ancora na 1ª linha visível atual (não salta para a página 1).
    const firstRow = safePage * pageSize;
    setPageSize(next);
    setPage(Math.floor(firstRow / next));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auditoria</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tudo o que cada usuário faz na plataforma: autenticação, gestão de
          usuários, configurações, credenciais e acessos do Agente Nex.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar em toda a tabela…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                aria-label="Buscar na auditoria"
              />
            </div>
            {/* Limpar logo após a busca (padrão do Router): só quando há filtro. */}
            {anyFilter ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                aria-label="Limpar busca e filtros"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Limpar
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <ActionMultiSelect
              actions={auditActions}
              selected={selectedActions}
              onChange={setSelectedActions}
            />
            <UserMultiSelect
              users={auditUsers}
              selected={selectedUserIds}
              onChange={setSelectedUserIds}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground"
            role="alert"
          >
            <p className="text-sm">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </div>
        ) : total === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            role="status"
          >
            <p className="text-sm">
              {search
                ? "Nenhum evento corresponde à busca."
                : "Nenhum evento de auditoria encontrado."}
            </p>
          </div>
        ) : (
          <>
            {/* Container com rolagem vertical: o cabeçalho (thead sticky)
                fica fixo no topo enquanto as linhas rolam. */}
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-border [&_th]:bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Ação</TableHead>
                    <TableHead className="text-xs">Usuário</TableHead>
                    <TableHead className="text-xs">Alvo</TableHead>
                    <TableHead className="text-xs">IP</TableHead>
                    <TableHead className="text-xs">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="border-border hover:bg-muted/30"
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", getActionBadgeClasses(r.action))}
                        >
                          {actionLabel(r.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.userName ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {r.userName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.userEmail}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.targetType ? (
                          <span>
                            <span className="font-medium text-foreground">
                              {r.targetType}
                            </span>
                            {r.targetId ? (
                              <span
                                className="ml-1 break-all text-muted-foreground"
                                title={r.targetId}
                              >
                                {r.targetId}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.ipAddress ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>

            {/* Paginação , mesmo padrão da tabela do Router. */}
            <div className="grid grid-cols-1 items-center gap-3 border-t border-border px-4 py-3 sm:grid-cols-3">
              <p className="justify-self-start text-xs tabular-nums text-muted-foreground">
                Mostrando {startIdx}
                {"-"}
                {endIdx} de {total}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <PageJumpNavigator
                  page={safePage}
                  totalPages={totalPages}
                  onJump={goToPage}
                />
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages - 1}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="justify-self-end">
                <CustomSelect
                  value={String(pageSize)}
                  onChange={(v) => changePageSize(Number(v))}
                  options={PAGE_SIZES.map((n) => ({
                    value: String(n),
                    label: `${n} por página`,
                  }))}
                  triggerClassName="h-8 min-h-[34px] w-[140px] text-xs"
                  aria-label="Itens por página"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Multi-select de usuário para filtrar a auditoria (mesmo padrão visual dos
 * filtros da tabela do Router: popover + checkboxes + "Limpar seleção"), com
 * uma busca interna para achar o usuário pelo nome/e-mail. A lista recebe
 * apenas usuários que já têm registro de auditoria.
 */
function UserMultiSelect({
  users,
  selected,
  onChange,
}: {
  users: { id: string; name: string; email: string | null }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trigger =
    selected.length === 0
      ? "Todos os usuários"
      : selected.length === 1
        ? (users.find((u) => u.id === selected[0])?.name ?? "1 selecionado")
        : `${selected.length} selecionados`;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por usuário"
            aria-expanded={open}
            disabled={users.length === 0}
            className="flex h-9 min-w-[190px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate">{trigger}</span>
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
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-[260px] overflow-hidden p-0"
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              autoFocus
              placeholder="Buscar usuário…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
              aria-label="Buscar usuário"
            />
          </div>
        </div>
        <ul
          role="listbox"
          aria-label="Usuários"
          className="max-h-64 overflow-auto p-1"
        >
          {visible.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhum usuário encontrado.
            </li>
          ) : (
            visible.map((u) => {
              const isOn = selected.includes(u.id);
              return (
                <li key={u.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => toggle(u.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
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
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">
                        {u.name}
                      </span>
                      {u.email ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {selected.length > 0 ? (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Multi-select de AÇÃO para filtrar a auditoria (mesmo padrão do filtro de
 * usuário): popover + busca + checkboxes. As tags ficam neutras (apagadas)
 * quando não selecionadas e acendem na cor da ação ao marcar.
 */
function ActionMultiSelect({
  actions,
  selected,
  onChange,
}: {
  actions: AuditAction[];
  selected: AuditAction[];
  onChange: (next: AuditAction[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trigger =
    selected.length === 0
      ? "Todas as ações"
      : selected.length === 1
        ? actionLabel(selected[0])
        : `${selected.length} selecionadas`;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => actionLabel(a).toLowerCase().includes(q) || a.toLowerCase().includes(q),
    );
  }, [actions, query]);

  const toggle = (a: AuditAction) =>
    onChange(selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por ação"
            aria-expanded={open}
            disabled={actions.length === 0}
            className="flex h-9 min-w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate">{trigger}</span>
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
      <PopoverContent align="end" sideOffset={4} className="w-[280px] overflow-hidden p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              autoFocus
              placeholder="Buscar ação…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
              aria-label="Buscar ação"
            />
          </div>
        </div>
        <ul role="listbox" aria-label="Ações" className="max-h-64 overflow-auto p-1">
          {visible.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma ação encontrada.
            </li>
          ) : (
            visible.map((a) => {
              const isOn = selected.includes(a);
              return (
                <li key={a} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => toggle(a)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
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
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs transition-colors",
                        isOn ? getActionBadgeClasses(a) : "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {actionLabel(a)}
                    </Badge>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {selected.length > 0 ? (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default AuditsTable;
