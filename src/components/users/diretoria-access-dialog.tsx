"use client";

import { useEffect, useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiretoriaAccessStep } from "./diretoria-access-step";
import {
  getUserDiretoriaAccess,
  updateUserDiretoriaAccess,
} from "@/lib/actions/diretoria-access";

/**
 * Dialog para configurar o acesso de um usuário ao menu Diretoria (capabilities +
 * UFs). Acessível pela lista de usuários. super_admin não precisa (vê tudo).
 */
export function DiretoriaAccessDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  userName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      setErro(null);
      getUserDiretoriaAccess(userId)
        .then((r) => {
          setCapabilities(r.capabilities);
          setUfs(r.ufs);
        })
        .catch(() => setErro("Não foi possível carregar o acesso"))
        .finally(() => setLoading(false));
    }
  }, [open, userId]);

  function salvar() {
    if (!userId) return;
    setErro(null);
    start(async () => {
      const r = await updateUserDiretoriaAccess(userId, capabilities, ufs);
      if (r.ok) onOpenChange(false);
      else setErro(r.erro ?? "Falha ao salvar");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Acesso à Diretoria{userName ? ` , ${userName}` : ""}</DialogTitle>
          <DialogDescription>
            Configure o que este usuário vê e faz no menu Diretoria.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <DiretoriaAccessStep
            capabilities={capabilities}
            ufs={ufs}
            onCapabilitiesChange={setCapabilities}
            onUfsChange={setUfs}
          />
        )}

        {erro ? <p className="text-sm text-rose-400">{erro}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || loading}>
            {pending ? "Salvando…" : "Salvar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
