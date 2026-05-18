"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Eye,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  UserX,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BadgeSelect,
  type BadgeOption,
  type BadgeStyle,
} from "@/components/ui/badge-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  deleteUser,
  listUsers,
  setUserActive,
  updateUser,
  type UserListItem,
} from "@/lib/actions/users";
import { getMyDomains, getUserDomains } from "@/lib/actions/domain-access";
import type { ReportDomainId } from "@/lib/reports/domains";
import {
  canChangeRole,
  canDeactivateUser,
  canDeleteUser,
  canEditUser,
} from "@/lib/permissions";
import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";

import { UserFormDialog } from "./user-form-dialog";

type RoleValue = PlatformRole;
type StatusValue = "active" | "inactive";

const ROLE_BG: Record<RoleValue, string> = {
  super_admin:
    "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  admin: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  manager:
    "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  viewer:
    "bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400",
};

const ROLE_ICON = {
  super_admin: Crown,
  admin: ShieldCheck,
  manager: Shield,
  viewer: Eye,
} as const;

const ROLE_LABEL: Record<RoleValue, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
};

const ROLE_DESCRIPTION: Record<RoleValue, string> = {
  super_admin: "Acesso total a toda a plataforma",
  admin: "Gerencia contas e usuários",
  manager: "Gerencia departamentos atribuídos",
  viewer: "Apenas visualização",
};

function getRoleStyle(value: RoleValue): BadgeStyle {
  return { bg: ROLE_BG[value], icon: ROLE_ICON[value] };
}

function getStatusStyle(value: StatusValue): BadgeStyle {
  return value === "active"
    ? {
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        icon: UserCheck,
      }
    : {
        bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
        icon: UserX,
      };
}

const STATUS_OPTIONS: BadgeOption<StatusValue>[] = [
  {
    value: "active",
    label: "Ativo",
    bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    icon: UserCheck,
  },
  {
    value: "inactive",
    label: "Inativo",
    bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    icon: UserX,
  },
];

const ACTION_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:pointer-events-none disabled:opacity-50";

// Variante destrutiva: feedback vermelho no hover (botão de excluir).
const ACTION_BTN_DANGER =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:pointer-events-none disabled:opacity-50";

interface UsersContentProps {
  currentUser: AuthUser;
}

export function UsersContent({ currentUser }: UsersContentProps) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [granterDomains, setGranterDomains] = useState<ReportDomainId[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editingUserDomains, setEditingUserDomains] = useState<ReportDomainId[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<UserListItem | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setLoadError(null);
    const [result, myDomains] = await Promise.all([
      listUsers(),
      getMyDomains().catch(() => [] as ReportDomainId[]),
    ]);
    if (result.success) {
      setUsers(result.data ?? []);
    } else {
      setLoadError(result.error);
      toast.error(result.error);
    }
    setGranterDomains(myDomains);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function handleInlineRoleChange(userId: string, role: RoleValue) {
    setActionPending(true);
    startTransition(async () => {
      const result = await updateUser({ id: userId, platformRole: role });
      setActionPending(false);
      if (result.success) {
        toast.success("Nível atualizado.");
        await load();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleInlineStatusChange(userId: string, status: StatusValue) {
    setActionPending(true);
    startTransition(async () => {
      const result = await setUserActive(userId, status === "active");
      setActionPending(false);
      if (result.success) {
        toast.success(
          status === "active" ? "Usuário ativado." : "Usuário desativado.",
        );
        await load();
      } else {
        toast.error(result.error);
      }
    });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletePending(true);
    const result = await deleteUser(confirmDelete.id);
    setDeletePending(false);
    if (result.success) {
      toast.success(`Usuário "${confirmDelete.name}" excluído.`);
      setConfirmDelete(null);
      await load();
    } else {
      toast.error(result.error);
    }
  }

  // Opções de papel ofertadas no badge inline — restritas ao que o ator
  // logado pode atribuir.
  const ALL_ROLES: RoleValue[] = ["super_admin", "admin", "manager", "viewer"];

  function roleOptionsFor(target: UserListItem): BadgeOption<RoleValue>[] {
    return ALL_ROLES.filter(
      (r) =>
        r === target.platformRole ||
        canChangeRole(currentUser, target, r).allowed,
    ).map((value) => ({
      value,
      label: ROLE_LABEL[value],
      description: ROLE_DESCRIPTION[value],
      bg: ROLE_BG[value],
      icon: ROLE_ICON[value],
    }));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Novo usuário
        </Button>
      </div>

      <div className="overflow-hidden overflow-x-auto rounded-xl border border-border bg-card/50">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
        ) : users.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            role="status"
          >
            <UsersIcon
              className="mb-3 h-12 w-12 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">E-mail</TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Nível
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Criado em
                </TableHead>
                <TableHead className="text-center text-muted-foreground">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const canEdit = canEditUser(currentUser, u).allowed;
                const canToggle = canDeactivateUser(currentUser, u).allowed;
                const canDel = canDeleteUser(currentUser, u).allowed;

                // Badge de nível: editável só se o ator pode editar o alvo e
                // o alvo não é o owner nem o próprio usuário.
                const lockRole = !canEdit;
                const lockStatus = !canToggle;

                const roleStyle = getRoleStyle(u.platformRole);
                const RoleIcon = roleStyle.icon;
                const statusStyle = getStatusStyle(
                  u.isActive ? "active" : "inactive",
                );
                const StatusIcon = statusStyle.icon;

                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {u.name}
                        {isSelf ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            (você)
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>

                    {/* Nível */}
                    <TableCell className="text-center">
                      <div className="inline-flex justify-center">
                        {lockRole ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleStyle.bg}`}
                          >
                            <RoleIcon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {ROLE_LABEL[u.platformRole]}
                          </span>
                        ) : (
                          <BadgeSelect<RoleValue>
                            useFixed
                            menuClassName="min-w-[360px]"
                            value={u.platformRole}
                            onChange={(val) =>
                              handleInlineRoleChange(u.id, val)
                            }
                            options={roleOptionsFor(u)}
                            getBadgeStyle={getRoleStyle}
                            ariaLabel={`Alterar nível de ${u.name}`}
                            disabled={actionPending}
                          />
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      <div className="inline-flex justify-center">
                        {lockStatus ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg}`}
                          >
                            <StatusIcon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {u.isActive ? "Ativo" : "Inativo"}
                          </span>
                        ) : (
                          <BadgeSelect<StatusValue>
                            useFixed
                            minWidth={150}
                            value={u.isActive ? "active" : "inactive"}
                            onChange={(val) =>
                              handleInlineStatusChange(u.id, val)
                            }
                            options={STATUS_OPTIONS}
                            getBadgeStyle={getStatusStyle}
                            ariaLabel={`Alterar status de ${u.name}`}
                            disabled={actionPending}
                          />
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center text-sm text-muted-foreground">
                      {format(new Date(u.createdAt), "dd MMM yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEdit ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser(u);
                                    void getUserDomains(u.id).then(setEditingUserDomains).catch(() => setEditingUserDomains([]));
                                  }}
                                  aria-label={`Editar ${u.name}`}
                                  className={ACTION_BTN}
                                />
                              }
                            >
                              <Pencil
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </TooltipTrigger>
                            <TooltipContent>Editar usuário</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {canDel ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(u)}
                                  aria-label={`Excluir ${u.name}`}
                                  className={ACTION_BTN_DANGER}
                                />
                              }
                            >
                              <Trash2
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </TooltipTrigger>
                            <TooltipContent>Excluir usuário</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <UserFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentUser={currentUser}
        onSuccess={load}
        granterDomains={granterDomains}
      />
      <UserFormDialog
        mode="edit"
        open={editingUser !== null}
        onOpenChange={(o) => {
          if (!o) setEditingUser(null);
        }}
        user={editingUser ?? undefined}
        currentUser={currentUser}
        onSuccess={() => {
          setEditingUser(null);
          void load();
        }}
        granterDomains={granterDomains}
        userDomains={editingUserDomains}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o && !deletePending) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong>{confirmDelete?.name}</strong>? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deletePending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

export default UsersContent;
