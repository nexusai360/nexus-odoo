"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePassword } from "@/lib/actions/profile";

const MIN_LENGTH = 8;

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoComplete?: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
  describedBy,
  invalid,
  placeholder = "********",
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          placeholder={placeholder}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export function PasswordChangeCard({
  redirectOnSuccess,
}: {
  /** Quando definido (ex.: tela de troca obrigatória), navega para cá após
   *  trocar a senha, em vez de só exibir o toast. */
  redirectOnSuccess?: string;
} = {}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, start] = useTransition();

  const newTooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const sameAsCurrent =
    newPassword.length > 0 &&
    currentPassword.length > 0 &&
    newPassword === currentPassword;
  const mismatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword;

  const canSubmit =
    !isPending &&
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    confirmPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    start(async () => {
      const result = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (result.success) {
        toast.success("Senha alterada com sucesso");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        if (redirectOnSuccess) {
          // Navegação completa: o token já foi renovado na action; o middleware
          // libera o acesso sem precisar de logout.
          window.location.assign(redirectOnSuccess);
        }
      } else {
        toast.error(result.error || "Erro ao alterar senha");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <KeyRound
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          Alterar Senha
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            id="current-password"
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={isPending}
            autoComplete="current-password"
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <PasswordField
                id="new-password"
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                disabled={isPending}
                autoComplete="new-password"
                describedBy="new-password-help"
                invalid={newTooShort || sameAsCurrent}
              />
            </div>
            <div className="space-y-1.5">
              <PasswordField
                id="confirm-password"
                label="Confirmar nova senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                disabled={isPending}
                autoComplete="new-password"
                describedBy={mismatch ? "confirm-error" : undefined}
                invalid={mismatch}
              />
            </div>
          </div>

          {newTooShort ? (
            <p
              id="new-password-help"
              role="alert"
              className="flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              A nova senha precisa ter pelo menos {MIN_LENGTH} caracteres.
            </p>
          ) : sameAsCurrent ? (
            <p
              id="new-password-help"
              role="alert"
              className="flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              A nova senha deve ser diferente da atual.
            </p>
          ) : mismatch ? (
            <p
              id="confirm-error"
              role="alert"
              className="flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              As senhas não coincidem.
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="outline"
              disabled={!canSubmit}
              className="h-10 cursor-pointer px-4"
            >
              {isPending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Alterar senha
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
