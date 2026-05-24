"use client";

import { useEffect, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
};

function getActionBadgeClasses(action: AuditAction): string {
  if (action.startsWith("login_")) {
    return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
  if (action.startsWith("password_") || action === "profile_password_changed") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
  if (action.startsWith("setting_")) {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
  if (
    action.startsWith("user_") ||
    action.startsWith("profile_") ||
    action.startsWith("email_") ||
    action === "session_revoked"
  ) {
    return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
}

function truncate(value: string | null, max = 12): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function AuditsTable() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="overflow-hidden overflow-x-auto rounded-xl border border-border bg-card/50">
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
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
      ) : rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-muted-foreground"
          role="status"
        >
          <p className="text-sm">Nenhum evento de auditoria encontrado.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Ação</TableHead>
              <TableHead className="text-xs">Usuário</TableHead>
              <TableHead className="text-xs">Alvo</TableHead>
              <TableHead className="text-xs">IP</TableHead>
              <TableHead className="text-xs">Quando</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="border-border hover:bg-muted/30">
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${getActionBadgeClasses(r.action)}`}
                  >
                    {ACTION_LABELS[r.action] ?? r.action}
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
                    <span className="text-xs text-muted-foreground">,</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.targetType ? (
                    <span>
                      <span className="font-medium text-foreground">
                        {r.targetType}
                      </span>
                      {r.targetId ? (
                        <span className="ml-1 text-muted-foreground">
                          {truncate(r.targetId)}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    ","
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {r.ipAddress ?? ","}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default AuditsTable;
