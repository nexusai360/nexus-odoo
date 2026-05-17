"use client";

// PresetsPopover — botão "Presets" no toolbar do relatório.
//
// Fluxo:
//  - Lista presets do usuário para o relatório (carregados no mount)
//  - Click em um preset aplica seus searchParams via router.push
//  - "Salvar atual" expande um input inline para nomear e persiste via SA
//  - "Gerenciar" abre <PresetsManageDialog> (renomear / favoritar / excluir)
//  - Estado otimista: presets aparecem/somem imediatamente, erros reversem via toast

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Settings, Star } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PresetsManageDialog } from "./presets-manage-dialog";
import {
  listarPresets,
  criarPreset,
} from "@/lib/actions/report-presets";
import type { PresetItem } from "@/lib/actions/report-presets";

interface Props {
  /** Id do relatório no catálogo (ex.: "saldo-produto"). */
  reportId: string;
}

type OptimisticAction =
  | { type: "add"; preset: PresetItem }
  | { type: "remove"; id: string }
  | { type: "favorito"; id: string; favorito: boolean };

function applyOptimistic(state: PresetItem[], action: OptimisticAction): PresetItem[] {
  switch (action.type) {
    case "add":
      return [action.preset, ...state];
    case "remove":
      return state.filter((p) => p.id !== action.id);
    case "favorito":
      return state.map((p) =>
        p.id === action.id ? { ...p, favorito: action.favorito } : p,
      );
  }
}

export function PresetsPopover({ reportId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [optimistic, dispatch] = useOptimistic(presets, applyOptimistic);
  const [pendingSave, startSave] = useTransition();

  // Carrega presets no mount e sempre que o popover abre.
  const loadPresets = useCallback(async () => {
    const res = await listarPresets(reportId);
    if (res.success && res.data) {
      setPresets(res.data);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) loadPresets();
  }, [open, loadPresets]);

  const resetCreating = () => {
    setCreating(false);
    setName("");
    setNameErr(null);
  };

  const handleApply = (preset: PresetItem) => {
    router.push(`${pathname}?${preset.searchParams}`);
    setOpen(false);
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameErr("Nome obrigatório");
      return;
    }
    if (trimmed.length > 80) {
      setNameErr("Máximo 80 caracteres");
      return;
    }

    const currentParams = searchParams.toString();

    // Otimismo: gera id temporário
    const optimisticPreset: PresetItem = {
      id: `tmp-${Date.now()}`,
      reportId,
      nome: trimmed,
      searchParams: currentParams,
      favorito: false,
      criadoEm: new Date(),
    };

    dispatch({ type: "add", preset: optimisticPreset });
    resetCreating();
    setOpen(false);

    startSave(async () => {
      const res = await criarPreset(reportId, trimmed, currentParams);
      if (res.success && res.data) {
        // substitui o item temporário pelo real
        setPresets((prev) =>
          prev
            .filter((p) => p.id !== optimisticPreset.id)
            .concat(res.data!)
            .sort((a, b) => Number(b.favorito) - Number(a.favorito) || b.criadoEm.getTime() - a.criadoEm.getTime()),
        );
        toast.success("Preset salvo");
      } else if (!res.success) {
        setPresets((prev) => prev.filter((p) => p.id !== optimisticPreset.id));
        toast.error(res.error);
      }
    });
  };

  // Callbacks repassados ao dialog de gerenciamento
  const handleOptimisticDelete = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const handleOptimisticFavorito = (id: string, favorito: boolean) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, favorito } : p)),
    );
  };

  const isAtCap = optimistic.length >= 50;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetCreating();
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Presets${optimistic.length > 0 ? ` (${optimistic.length})` : ""}`}
              className="relative h-8 cursor-pointer gap-1.5 text-xs"
            >
              <Star className="size-3.5" aria-hidden />
              Presets
              {optimistic.length > 0 ? (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground">
                  {optimistic.length}
                </span>
              ) : null}
            </Button>
          }
        />

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-72 p-0"
        >
          {/* Cabeçalho */}
          <div className="border-b border-border/60 px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Meus presets
            </span>
          </div>

          {/* Lista */}
          <ul role="menu" className="max-h-64 overflow-y-auto py-1">
            {optimistic.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-foreground">
                Nenhum preset salvo ainda.
              </li>
            ) : (
              optimistic.map((p) => (
                <li key={p.id} role="menuitem">
                  <button
                    type="button"
                    onClick={() => handleApply(p)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-colors",
                        p.favorito
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-xs text-foreground">
                      {p.nome}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Rodapé */}
          <div className="space-y-1 border-t border-border/60 p-2">
            {creating ? (
              <div className="space-y-1.5">
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.currentTarget.value);
                    setNameErr(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") resetCreating();
                  }}
                  placeholder="Nome do preset"
                  aria-label="Nome do preset"
                  className="h-8 text-xs"
                />
                {nameErr ? (
                  <p role="alert" className="text-[11px] text-destructive">
                    {nameErr}
                  </p>
                ) : null}
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={pendingSave}
                    className="h-7 cursor-pointer text-xs disabled:opacity-50"
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetCreating}
                    className="h-7 cursor-pointer text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isAtCap}
                onClick={() => setCreating(true)}
                title={isAtCap ? "Limite de 50 presets atingido" : undefined}
                className="h-8 w-full cursor-pointer justify-start gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Salvar atual
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={optimistic.length === 0}
              onClick={() => {
                setManagerOpen(true);
                setOpen(false);
              }}
              className="h-8 w-full cursor-pointer justify-start gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden />
              Gerenciar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <PresetsManageDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        presets={optimistic}
        onApply={handleApply}
        onOptimisticDelete={handleOptimisticDelete}
        onOptimisticFavorito={(id, fav) => handleOptimisticFavorito(id, fav)}
      />
    </>
  );
}

export default PresetsPopover;
