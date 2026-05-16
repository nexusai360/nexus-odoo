"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  listUsers,
  deleteUser,
  setUserActive,
  type UserListItem,
} from "@/lib/actions/users";
import {
  canEditUser,
  canDeleteUser,
  canDeactivateUser,
} from "@/lib/permissions";
import {
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_STYLES,
} from "@/lib/constants/roles";
import type { AuthUser } from "@/lib/auth-helpers";
import { UserFormDialog } from "./user-form-dialog";

interface UsersContentProps {
  currentUser: AuthUser;
}

const STATUS_BADGE = {
  active:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive:
    "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700",
} as const;

const ACTION_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:pointer-events-none disabled:opacity-50";

export function UsersContent({ currentUser }: UsersContentProps) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserListItem | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    const result = await listUsers();
    if (result.success) {
      setUsers(result.data ?? []);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function handleToggleActive(u: UserListItem) {
    startTransition(async () => {
      const result = await setUserActive(u.id, !u.isActive);
      if (result.success) {
        toast.success(u.isActive ? "Usuário desativado." : "Usuário ativado.");
        void load();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    startTransition(async () => {
      const result = await deleteUser(target.id);
      if (result.success) {
        toast.success("Usuário excluído.");
        void load();
      } else {
        toast.error(result.error);
      }
      setConfirmDelete(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
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
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const canEdit = canEditUser(currentUser, u).allowed;
                const canToggle = canDeactivateUser(currentUser, u).allowed;
                const canDel = canDeleteUser(currentUser, u).allowed;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={PLATFORM_ROLE_STYLES[u.platformRole].className}
                      >
                        {PLATFORM_ROLE_LABELS[u.platformRole]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          u.isActive
                            ? STATUS_BADGE.active
                            : STATUS_BADGE.inactive
                        }
                      >
                        {u.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(u.createdAt), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => setEditingUser(u)}
                            title="Editar usuário"
                            aria-label={`Editar ${u.name}`}
                            className={ACTION_BTN}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canToggle ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            disabled={isPending}
                            title={u.isActive ? "Desativar" : "Ativar"}
                            aria-label={`${u.isActive ? "Desativar" : "Ativar"} ${u.name}`}
                            className={ACTION_BTN}
                          >
                            {u.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                        {canDel ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u)}
                            title="Excluir usuário"
                            aria-label={`Excluir ${u.name}`}
                            className={ACTION_BTN}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
      />
      <UserFormDialog
        mode="edit"
        open={editingUser !== null}
        onOpenChange={(o) => {
          if (!o) setEditingUser(null);
        }}
        user={editingUser ?? undefined}
        currentUser={currentUser}
        onSuccess={load}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
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
            <AlertDialogCancel disabled={isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
