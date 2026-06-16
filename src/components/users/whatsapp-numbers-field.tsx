"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/country-flag";
import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import {
  type Country,
  DEFAULT_COUNTRY,
  areEquivalentNumbers,
  composeE164,
  findCountryByE164,
  formatE164ForDisplay,
  splitE164,
} from "@/lib/whatsapp/countries";
import {
  addWhatsappNumber,
  listWhatsappNumbers,
  removeWhatsappNumber,
  updateWhatsappNumber,
  type WhatsappNumberItem,
} from "@/lib/actions/user-whatsapp";

interface WhatsappNumbersFieldProps {
  /**
   * Usuário-alvo (modo edição). Quando ausente, o campo opera em modo
   * rascunho: os números ficam só no estado local e são reportados via
   * `onDraftChange` , quem cria o usuário os persiste depois.
   */
  userId?: string;
  /** Modo rascunho: callback com a lista atual de números (E.164 cru). */
  onDraftChange?: (numbers: string[]) => void;
}

/** Valida o número nacional para o país escolhido. Retorna a mensagem ou null. */
function validatePhone(country: Country, national: string): string | null {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "Informe o número.";
  if (country.iso === "BR" && digits.length !== 10 && digits.length !== 11) {
    return "Para o Brasil, informe DDD + número (10 ou 11 dígitos).";
  }
  if (digits.length < 8) return "Número muito curto.";
  return null;
}

/** Item normalizado para a lista (modo rascunho ou modo edição). */
type ListItem =
  | { key: string; e164: string; mode: "draft"; index: number }
  | { key: string; e164: string; mode: "edit"; id: string };

type Editing =
  | { mode: "draft"; index: number }
  | { mode: "edit"; id: string };

/**
 * Campo de números de WhatsApp do perfil e do formulário de usuário.
 *
 * Layout: o campo de adicionar fica fixo no topo (seletor de país com bandeira
 * + número nacional, Brasil padrão) e a lista de números cadastrados aparece
 * embaixo, uma linha por número, com editar (inline) e remover. Não renderiza
 * título nem descrição , isso fica a cargo de quem usa (card do perfil ou
 * formulário de usuário), para evitar texto repetido.
 *
 * Modo edição (`userId`): add/edit/remove via Server Actions imediatas.
 * Modo rascunho (sem `userId`): tudo no estado local, reportado por `onDraftChange`.
 */
export function WhatsappNumbersField({
  userId,
  onDraftChange,
}: WhatsappNumbersFieldProps) {
  const isDraft = !userId;

  const [numbers, setNumbers] = useState<WhatsappNumberItem[]>([]);
  const [draftNumbers, setDraftNumbers] = useState<string[]>([]);

  // Campo de adicionar (topo).
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edição inline de uma linha.
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editCountry, setEditCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [editNational, setEditNational] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [loading, setLoading] = useState(!isDraft);
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const addInputId = useId();
  const errorId = useId();

  const reload = useCallback(async () => {
    if (!userId) return;
    const res = await listWhatsappNumbers(userId);
    if (res.success) {
      setNumbers(res.data ?? []);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (isDraft) return;
    setLoading(true);
    void reload();
  }, [reload, isDraft]);

  const items: ListItem[] = isDraft
    ? draftNumbers.map((e164, index) => ({
        key: `draft:${index}:${e164}`,
        e164,
        mode: "draft",
        index,
      }))
    : numbers.map((n) => ({
        key: n.id,
        e164: n.phoneE164,
        mode: "edit",
        id: n.id,
      }));

  function handleAdd() {
    const validationError = validatePhone(country, national);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const e164 = composeE164(country.dial, national);

    if (isDraft) {
      if (draftNumbers.some((n) => areEquivalentNumbers(n, e164))) {
        setError("Este número já está cadastrado.");
        return;
      }
      const next = [...draftNumbers, e164];
      setDraftNumbers(next);
      setNational("");
      onDraftChange?.(next);
      return;
    }

    // Feedback imediato (o backend também valida com a mesma equivalência).
    if (numbers.some((n) => areEquivalentNumbers(n.phoneE164, e164))) {
      setError("Este número já está cadastrado.");
      return;
    }

    start(async () => {
      const res = await addWhatsappNumber({ userId, raw: e164 });
      if (res.success) {
        setNational("");
        await reload();
        toast.success("Número adicionado.");
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(item: ListItem) {
    const { country: c, nationalDigits } = splitE164(item.e164);
    setEditCountry(c ?? DEFAULT_COUNTRY);
    setEditNational(nationalDigits);
    setEditError(null);
    setEditing(
      item.mode === "draft"
        ? { mode: "draft", index: item.index }
        : { mode: "edit", id: item.id },
    );
  }

  function cancelEdit() {
    setEditing(null);
    setEditError(null);
  }

  function saveEdit() {
    if (!editing) return;
    const validationError = validatePhone(editCountry, editNational);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    const e164 = composeE164(editCountry.dial, editNational);

    if (editing.mode === "draft") {
      if (
        draftNumbers.some(
          (n, i) => i !== editing.index && areEquivalentNumbers(n, e164),
        )
      ) {
        setEditError("Este número já está cadastrado.");
        return;
      }
      const next = draftNumbers.map((n, i) =>
        i === editing.index ? e164 : n,
      );
      setDraftNumbers(next);
      onDraftChange?.(next);
      setEditing(null);
      return;
    }

    const targetId = editing.id;
    // Feedback imediato (o backend também valida com a mesma equivalência).
    if (
      numbers.some(
        (n) => n.id !== targetId && areEquivalentNumbers(n.phoneE164, e164),
      )
    ) {
      setEditError("Este número já está cadastrado.");
      return;
    }

    setEditError(null);
    setBusyKey(targetId);
    start(async () => {
      const res = await updateWhatsappNumber({ id: targetId, raw: e164 });
      if (res.success) {
        setEditing(null);
        await reload();
        toast.success("Número atualizado.");
      } else {
        setEditError(res.error);
      }
      setBusyKey(null);
    });
  }

  function handleRemove(item: ListItem) {
    if (item.mode === "draft") {
      const next = draftNumbers.filter((_, i) => i !== item.index);
      setDraftNumbers(next);
      onDraftChange?.(next);
      return;
    }
    setBusyKey(item.id);
    start(async () => {
      const res = await removeWhatsappNumber(item.id);
      if (res.success) {
        await reload();
        toast.success("Número removido.");
      } else {
        toast.error(res.error);
      }
      setBusyKey(null);
    });
  }

  function isEditing(item: ListItem): boolean {
    if (!editing) return false;
    return editing.mode === item.mode &&
      (editing.mode === "draft"
        ? editing.index === (item as { index: number }).index
        : editing.id === (item as { id: string }).id);
  }

  return (
    <div className="space-y-5">
      {/* Adicionar , rótulo e campo na mesma linha */}
      <div className="space-y-1.5">
        <div className="flex flex-col gap-x-3 gap-y-1.5 sm:flex-row sm:items-center">
          <span className="shrink-0 text-sm font-medium text-foreground/80">
            Adicionar número
          </span>
          <div className="flex flex-1 gap-2">
          <PhoneInput
            className="flex-1"
            country={country}
            onCountryChange={setCountry}
            national={national}
            onNationalChange={(v) => {
              setNational(v);
              if (error) setError(null);
            }}
            onSubmit={handleAdd}
            invalid={!!error}
            inputId={addInputId}
            ariaDescribedBy={error ? errorId : undefined}
          />
          <Button
            type="button"
            size="icon"
            onClick={handleAdd}
            disabled={pending && !busyKey}
            aria-label="Adicionar número"
          >
            {pending && !busyKey ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          </div>
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/* Números cadastrados , embaixo */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground/80">
          Números cadastrados
        </p>
        {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Carregando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum número cadastrado ainda.
        </p>
      ) : (
        <ul
          className="max-h-44 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60 bg-muted/20"
          aria-label="Números cadastrados"
        >
          {items.map((item) => {
            const country = findCountryByE164(item.e164);
            // No modo edição a key da linha é o próprio id (o que busyKey guarda).
            const busy = busyKey === item.key;
            if (isEditing(item)) {
              return (
                <li key={item.key} className="space-y-1.5 px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <PhoneInput
                      className="flex-1"
                      autoFocus
                      country={editCountry}
                      onCountryChange={setEditCountry}
                      national={editNational}
                      onNationalChange={(v) => {
                        setEditNational(v);
                        if (editError) setEditError(null);
                      }}
                      onSubmit={saveEdit}
                      invalid={!!editError}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={saveEdit}
                      disabled={busy}
                      aria-label="Salvar número"
                    >
                      {busy ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={cancelEdit}
                      disabled={busy}
                      aria-label="Cancelar edição"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                  {editError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {editError}
                    </p>
                  ) : null}
                </li>
              );
            }
            return (
              <li
                key={item.key}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <CountryFlag
                    iso={country?.iso ?? ""}
                    title={country?.name}
                    className="h-3 w-[18px]"
                  />
                  <span className="truncate text-sm tabular-nums text-foreground">
                    {formatE164ForDisplay(item.e164)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    disabled={busy || (!!editing && !isEditing(item))}
                    aria-label={`Editar ${formatE164ForDisplay(item.e164)}`}
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
                      "hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    disabled={busy || (!!editing && !isEditing(item))}
                    aria-label={`Remover ${formatE164ForDisplay(item.e164)}`}
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
                      "hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    {busy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}

export default WhatsappNumbersField;
