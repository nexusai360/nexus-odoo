"use client";

// PresetsManageDialog — gerenciamento de presets em modal:
// aplicar, alternar favorito (estrela), excluir com confirmação inline.

import { useState, useTransition } from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { excluirPreset, alternarFavorito } from "@/lib/actions/report-presets";
import type { PresetItem } from "@/lib/actions/report-presets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PresetItem[];
  onApply: (preset: PresetItem) => void;
  onOptimisticDelete: (id: string) => void;
  onOptimisticFavorito: (id: string, favorito: boolean) => void;
}

export function PresetsManageDialog({
  open,
  onOpenChange,
  presets,
  onApply,
  onOptimisticDelete,
  onOptimisticFavorito,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [pendingDelete, startDelete] = useTransition();
  const [pendingFav, startFav] = useTransition();

  const handleDelete = (id: string) => {
    onOptimisticDelete(id);
    setConfirmRemove(null);
    startDelete(async () => {
      const res = await excluirPreset(id);
      if (!res.success) {
        toast.error(res.error);
      }
    });
  };

  const handleFavorito = (preset: PresetItem) => {
    onOptimisticFavorito(preset.id, !preset.favorito);
    startFav(async () => {
      const res = await alternarFavorito(preset.id);
      if (!res.success) {
        toast.error(res.error);
        // reverte otimismo
        onOptimisticFavorito(preset.id, preset.favorito);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogTitle>Presets salvos</DialogTitle>
        <DialogDescription className="sr-only">
          Gerencie seus presets: aplicar, favoritar e excluir.
        </DialogDescription>

        {presets.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum preset salvo. Use &quot;Salvar atual&quot; no menu de Presets
            para começar.
          </div>
        ) : (
          <ul className="max-h-[420px] space-y-2 overflow-y-auto py-1">
            {presets.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                {confirmRemove === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-sm">
                      Excluir <strong>{p.nome}</strong>?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={pendingDelete}
                      onClick={() => handleDelete(p.id)}
                      className="cursor-pointer"
                    >
                      Excluir
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(null)}
                      className="cursor-pointer"
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleFavorito(p)}
                      disabled={pendingFav}
                      aria-label={
                        p.favorito ? "Remover dos favoritos" : "Marcar favorito"
                      }
                      className="cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          p.favorito
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground hover:text-amber-400",
                        )}
                        aria-hidden
                      />
                    </button>
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {p.nome}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onApply(p);
                        onOpenChange(false);
                      }}
                      className="cursor-pointer"
                    >
                      Aplicar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(p.id)}
                      aria-label={`Excluir ${p.nome}`}
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PresetsManageDialog;
