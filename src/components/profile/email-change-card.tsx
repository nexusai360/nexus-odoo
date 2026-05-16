"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";
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
import { requestEmailChange } from "@/lib/actions/profile";

interface EmailChangeCardProps {
  currentEmail: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailChangeCard({ currentEmail }: EmailChangeCardProps) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, start] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      toast.error("Digite um e-mail válido");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      toast.error("O novo e-mail é igual ao atual");
      return;
    }
    if (password.length < 1) {
      toast.error("Informe sua senha atual");
      return;
    }

    start(async () => {
      const result = await requestEmailChange({
        newEmail: trimmed,
        password,
      });
      if (result.success) {
        setSentTo(trimmed);
        setNewEmail("");
        setPassword("");
        toast.success("E-mail de verificação enviado");
      } else {
        toast.error(result.error || "Erro ao solicitar alteração");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <Mail
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          E-mail
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current-email">E-mail atual</Label>
          <Input
            id="current-email"
            type="email"
            value={currentEmail}
            disabled
            readOnly
            aria-readonly="true"
            className="bg-muted text-muted-foreground"
          />
        </div>

        {sentTo ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-400"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">
                E-mail enviado, verifique sua caixa de entrada.
              </p>
              <p className="text-xs text-emerald-500/80">
                Enviamos um link de confirmação para <strong>{sentTo}</strong>.
                Clique nele para concluir a alteração.
              </p>
              <button
                type="button"
                onClick={() => setSentTo(null)}
                className="cursor-pointer text-xs font-medium text-emerald-400 underline-offset-4 hover:underline"
              >
                Solicitar novamente
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Novo e-mail</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="novo@email.com"
                disabled={isPending}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-password">Senha atual (confirmação)</Label>
              <div className="relative">
                <Input
                  id="email-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  disabled={isPending}
                  autoComplete="current-password"
                  className="pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={isPending || !newEmail || !password}
                className="h-10 cursor-pointer px-4"
              >
                {isPending ? (
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                Alterar e-mail
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
