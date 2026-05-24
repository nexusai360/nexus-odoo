"use client";

/**
 * KbDocumentViewer , modal de visualização do conteúdo extraído de um
 * documento da base de conhecimento.
 *
 * - CSV: renderizado como tabela.
 * - Markdown / TXT / XML / PDF: texto extraído em bloco monoespaçado, com
 *   quebras preservadas.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getKbDocumentAction } from "@/lib/actions/kb";

interface KbDocumentViewerProps {
  /** id do documento a exibir; null fecha o modal. */
  docId: string | null;
  onClose: () => void;
}

interface DocContent {
  name: string;
  kind: string;
  text: string;
}

/** Faz parse simples de CSV (sem suporte a aspas com vírgula interna). */
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(","));
}

export function KbDocumentViewer({ docId, onClose }: KbDocumentViewerProps) {
  const [doc, setDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) {
      setDoc(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getKbDocumentAction(docId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Erro ao carregar documento.");
        return;
      }
      setDoc(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const isCsv = doc?.kind === "CSV";

  return (
    <Dialog
      open={docId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {doc?.name ?? "Documento"}
          </DialogTitle>
          <DialogDescription>
            Conteúdo extraído incorporado ao contexto do Agente Nex.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando documento…
          </div>
        ) : error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : doc ? (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted/30 p-3">
            {isCsv ? (
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {parseCsv(doc.text).map((row, ri) => (
                    <tr key={ri} className="border-b border-border/60 last:border-0">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={
                            ri === 0
                              ? "px-2 py-1 font-semibold text-foreground"
                              : "px-2 py-1 text-muted-foreground"
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {doc.text}
              </pre>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
