"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { createUser, updateUser, type UserListItem } from "@/lib/actions/users";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/constants/roles";
import { canCreateRole } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth-helpers";
import type { PlatformRole } from "@/generated/prisma/client";

interface UserFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem;
  currentUser: AuthUser;
  onSuccess: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UserFormDialog({
  mode,
  open,
  onOpenChange,
  user,
  currentUser,
  onSuccess,
}: UserFormDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platformRole, setPlatformRole] = useState<PlatformRole>("viewer");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      setName(user.name);
      setEmail(user.email);
      setPlatformRole(user.platformRole);
    } else {
      setName("");
      setEmail("");
      setPlatformRole("viewer");
    }
    setTempPassword(null);
    setCopied(false);
  }, [open, mode, user]);

  const availableRoles = PLATFORM_ROLE_OPTIONS.filter((o) =>
    canCreateRole(currentUser, o.value),
  );

  function handleSubmit() {
    if (name.trim().length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    if (mode === "create" && !EMAIL_REGEX.test(email.trim())) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    startTransition(async () => {
      if (mode === "create") {
        const result = await createUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          platformRole,
        });
        if (result.success) {
          setTempPassword(result.data!.tempPassword);
        } else {
          toast.error(result.error);
        }
      } else {
        if (!user) return;
        const result = await updateUser({
          id: user.id,
          name: name.trim(),
          platformRole,
        });
        if (result.success) {
          toast.success("Usuário atualizado.");
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error(result.error);
        }
      }
    });
  }

  async function handleCopy() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  function handleFinish() {
    onSuccess();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Novo usuário" : "Editar usuário"}
          </DialogTitle>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Usuário criado. Anote a senha temporária — ela{" "}
              <strong className="text-foreground">
                não será exibida novamente
              </strong>
              . O usuário deverá trocá-la no primeiro acesso.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
              <code className="flex-1 font-mono text-sm">{tempPassword}</code>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleFinish}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Nome</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">E-mail</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending || mode === "edit"}
                readOnly={mode === "edit"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Papel</Label>
              <Select
                value={platformRole}
                onValueChange={(v) => setPlatformRole(v as PlatformRole)}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue placeholder="Selecione o papel" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {mode === "create" ? "Criar" : "Salvar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
