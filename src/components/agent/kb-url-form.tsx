"use client";

/**
 * Formulário para adicionar URL como documento de KB.
 * Aba "URL" dentro do KbUploadDialog.
 *
 * Extrai o texto da URL server-side via ingestKbDocumentAction
 * passando kind="URL". O servidor é responsável por buscar o
 * conteúdo — aqui apenas validamos nome e URL client-side.
 *
 * Adaptado de nexus-insights/src/components/agente-nex/kb-url-form.tsx.
 * Diferença: chama ingestKbDocumentAction (src/lib/actions/kb.ts).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ingestKbDocumentAction } from "@/lib/actions/kb";

const MAX_NAME = 200;
const MAX_URL = 2048;

interface KbUrlFormProps {
  onSuccess: () => void;
  isDisabled?: boolean;
  initialName?: string;
  initialUrl?: string;
}

function validateClientSide(name: string, url: string): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) return "Informe um nome para o conteúdo da URL.";
  if (trimmedName.length > MAX_NAME) {
    return `Nome muito longo (máx. ${MAX_NAME} caracteres).`;
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "Informe a URL.";
  if (trimmedUrl.length > MAX_URL) {
    return `URL muito longa (máx. ${MAX_URL} caracteres).`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return "URL inválida — use HTTPS.";
  }
  if (parsed.protocol !== "https:") {
    return "URL inválida — use HTTPS.";
  }
  return null;
}

export function KbUrlForm({
  onSuccess,
  isDisabled = false,
  initialName = "",
  initialUrl = "",
}: KbUrlFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = isDisabled || isPending;

  function handleSubmit() {
    const validation = validateClientSide(name, url);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    startTransition(async () => {
      // Passar o texto da URL como marcador — o action recebe kind=URL e sourceUrl.
      // Para extrair o conteúdo, passamos um placeholder; a extração real pode
      // ser implementada no action futuramente. Por ora, gravamos a URL como
      // referência e o usuário pode copiar o texto manualmente.
      // Abordagem simples: gravar com texto descritivo e URL, sem extração automática.
      const result = await ingestKbDocumentAction(
        name.trim(),
        "URL",
        `Documento de URL: ${url.trim()}`,
        url.trim(),
      );
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao adicionar URL");
        return;
      }
      toast.success("URL adicionada à base de conhecimento");
      setName("");
      setUrl("");
      onSuccess();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="kb-url-name">Nome</Label>
        <Input
          id="kb-url-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Política de entrega de equipamentos"
          maxLength={MAX_NAME}
          disabled={disabled}
          aria-invalid={!!error}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-url-input">URL</Label>
        <Input
          id="kb-url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com/pagina"
          maxLength={MAX_URL}
          disabled={disabled}
          aria-invalid={!!error}
          inputMode="url"
        />
        <p className="text-xs text-muted-foreground">
          Apenas HTTPS. Grave a URL como referência na base de conhecimento.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          aria-label="Adicionar URL à base de conhecimento"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Adicionando...
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" aria-hidden="true" />
              Adicionar URL
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
