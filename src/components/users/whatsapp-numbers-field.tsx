"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { Loader2, Phone, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addWhatsappNumber,
  listWhatsappNumbers,
  removeWhatsappNumber,
  type WhatsappNumberItem,
} from "@/lib/actions/user-whatsapp";

interface WhatsappNumbersFieldProps {
  /** Usuário-alvo. Obrigatório — a seção só existe no modo edição. */
  userId: string;
}

/**
 * Seção "Números de WhatsApp" do formulário de usuário (modo edição).
 *
 * Lista de chips com adicionar/remover. Cada operação é uma Server Action
 * imediata — o campo gerencia o próprio estado, fora do `FormState` do
 * formulário multi-etapas (não há "salvar" pendente para números).
 */
export function WhatsappNumbersField({ userId }: WhatsappNumbersFieldProps) {
  const [numbers, setNumbers] = useState<WhatsappNumberItem[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const reload = useCallback(async () => {
    const res = await listWhatsappNumbers(userId);
    if (res.success) {
      setNumbers(res.data ?? []);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  function handleAdd() {
    const raw = draft.trim();
    if (!raw) {
      setError("Informe um número.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await addWhatsappNumber({ userId, raw });
      if (res.success) {
        setDraft("");
        await reload();
        toast.success("Número adicionado.");
      } else {
        setError(res.error);
      }
    });
  }

  function handleRemove(id: string) {
    setRemovingId(id);
    start(async () => {
      const res = await removeWhatsappNumber(id);
      if (res.success) {
        await reload();
        toast.success("Número removido.");
      } else {
        toast.error(res.error);
      }
      setRemovingId(null);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground/80">
          Números de WhatsApp
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Mensagens recebidas destes números são reconhecidas como deste usuário.
      </p>

      {/* Lista de chips */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Carregando…
        </div>
      ) : numbers.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Números cadastrados">
          {numbers.map((n) => (
            <li
              key={n.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1.5 text-xs"
            >
              <span className="font-mono text-foreground">{n.phoneE164}</span>
              <button
                type="button"
                onClick={() => handleRemove(n.id)}
                disabled={pending}
                aria-label={`Remover ${n.phoneE164}`}
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                  "hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              >
                {removingId === n.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhum número cadastrado.
        </p>
      )}

      {/* Adicionar */}
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="+55 11 99123-4567"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="tel"
          maxLength={40}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={pending}
          aria-label="Adicionar número"
        >
          {pending && !removingId ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default WhatsappNumbersField;
