"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { forcarSyncDiretoria } from "@/lib/actions/diretoria-sync";

const COOLDOWN_MS = 30_000;

/**
 * Botão "Atualizar agora" da Diretoria. Dispara um sync sob demanda escopado à
 * área (isolado do cron). Só deve ser renderizado quando o usuário tem a
 * capability `diretoria.sync.force` (decidido no server). Cooldown de 30s e
 * feedback inline; não bloqueia o sync automático.
 */
export function SyncNowButton({ area }: { area: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);

  function onClick() {
    if (pending || cooldown) return;
    start(async () => {
      const r = await forcarSyncDiretoria(area);
      if (r.ok) {
        setMsg(
          r.jaEmAndamento
            ? "Sincronização já em andamento"
            : "Atualização disparada, os dados chegam em instantes",
        );
        setCooldown(true);
        setTimeout(() => setCooldown(false), COOLDOWN_MS);
        // Recarrega os dados da tela após um curto intervalo.
        setTimeout(() => router.refresh(), 4000);
      } else {
        setMsg(r.erro ?? "Não foi possível atualizar agora");
      }
      setTimeout(() => setMsg(null), 5000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || cooldown}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-sm transition-colors hover:bg-muted/60 disabled:opacity-50",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        Atualizar agora
      </button>
      {msg ? (
        <span className="text-xs text-muted-foreground" role="status">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
