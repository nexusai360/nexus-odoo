"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Imagens aceitas: PNG, JPG/JPEG e WebP (formato moderno do Google, lossy/
// lossless, estático). GIF foi removido — animado não agrega no chat e a
// extração de texto não enxerga conteúdo de quadros.
const ACCEPT_IMAGE = "image/png,image/jpeg,image/webp";
const ACCEPT_FILE = ".pdf,.txt,.md,.csv,.docx,.xlsx";

export interface AttachMenuProps {
  onPick: (file: File, kind: "image" | "file") => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Botão "+" de anexo da input bar do Agente Nex (F5-G4).
 * Abre menu com Imagem e Arquivo; cada opção abre o file picker nativo.
 */
export function AttachMenu({ onPick, disabled, className }: AttachMenuProps) {
  const [open, setOpen] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "image" | "file",
  ) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    onPick(f, kind);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                disabled={disabled}
                aria-label="Anexar arquivo"
                className={cn(
                  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40",
                  className,
                )}
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </PopoverTrigger>
            }
          />
          <TooltipContent>Anexar imagem ou arquivo</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="top"
          align="start"
          className="w-60 rounded-lg p-1.5"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              imageInputRef.current?.click();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <ImageIcon className="h-4 w-4 text-violet-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Imagem</div>
              <div className="text-[11px] text-muted-foreground">
                PNG, JPG, JPEG, WebP
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              fileInputRef.current?.click();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-4 w-4 text-violet-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Arquivo</div>
              <div className="text-[11px] text-muted-foreground">
                PDF, TXT, MD, CSV, DOCX, XLSX
              </div>
            </div>
          </button>
        </PopoverContent>
      </Popover>

      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        hidden
        onChange={(e) => handleChange(e, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_FILE}
        hidden
        onChange={(e) => handleChange(e, "file")}
      />
    </>
  );
}

/**
 * Handler default — exibe toast informando que o suporte completo está em
 * andamento. Os componentes consumidores podem fornecer um handler próprio
 * que envia para a base de conhecimento ou para o agente.
 */
export function defaultAttachHandler(file: File, kind: "image" | "file") {
  toast.info(`${kind === "image" ? "Imagem" : "Arquivo"} "${file.name}" pronta para enviar — suporte completo em breve.`);
}
