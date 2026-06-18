"use client";

/**
 * Ajuda na tela do webhook receptor de WhatsApp (F5.1): mostra os campos que
 * devem ser enviados e o JSON padrão (texto e mídia) com botão de copiar.
 * Derivado do contrato real (`inbound-payload.ts`). Sem mencionar ferramenta
 * específica , vale para qualquer forma de envio.
 */

import * as React from "react";
import { Check, Copy, Minus, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type Req = "sim" | "nao" | "cond" | "midia";

interface FieldRow {
  field: string;
  req: Req;
  note: string;
}

const FIELDS: FieldRow[] = [
  { field: "wa_id", req: "sim", note: "Número do WhatsApp do usuário" },
  { field: "user_id", req: "sim", note: "Identificador do usuário (ex.: BR.0000...)" },
  { field: "type", req: "sim", note: "text, audio, image, document, video ou sticker" },
  { field: "text", req: "cond", note: "Obrigatório em texto e áudio; legenda em mídia" },
  { field: "message_id", req: "sim", note: "Identificador único da mensagem (evita duplicar)" },
  { field: "timestamp", req: "sim", note: "Data/hora em milissegundos" },
  { field: "contact_name", req: "nao", note: "Nome do contato" },
  { field: "media.url", req: "midia", note: "Link do arquivo (imagem, PDF, etc.)" },
  { field: "media.mime_type", req: "midia", note: "Tipo do arquivo (ex.: image/jpeg, application/pdf)" },
  { field: "media.filename", req: "nao", note: "Nome do arquivo (para documentos)" },
  { field: "media.id", req: "nao", note: "Identificador do arquivo na origem" },
  { field: "media.sha256", req: "nao", note: "Verificação de integridade do arquivo" },
];

function ReqBadge({ req }: { req: Req }) {
  if (req === "sim")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden /> Sim
      </span>
    );
  if (req === "nao")
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/70">
        <Minus className="h-3.5 w-3.5" aria-hidden /> Não
      </span>
    );
  if (req === "cond")
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <Circle className="h-2.5 w-2.5 fill-current" aria-hidden /> Depende
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
      Só em mídia
    </span>
  );
}

const JSON_TEXT = `{
  "wa_id": "5500000000000",
  "user_id": "BR.0000000000000000",
  "type": "text",
  "text": "qual o estoque da esteira X?",
  "message_id": "wamid.HBgM...",
  "timestamp": 1781727884000,
  "contact_name": "Nome do Contato"
}`;

const JSON_MEDIA = `{
  "wa_id": "5500000000000",
  "user_id": "BR.0000000000000000",
  "type": "image",
  "text": "legenda opcional",
  "message_id": "wamid.HBgM...",
  "timestamp": 1781727884000,
  "contact_name": "Nome do Contato",
  "media": {
    "url": "https://.../arquivo.jpg",
    "mime_type": "image/jpeg",
    "filename": "tabela.pdf"
  }
}`;

function CopyBlock({ label, json }: { label: string; json: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard?.writeText(json).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            copied
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-background text-foreground hover:bg-accent",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar JSON"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto bg-background p-3 text-[11px] leading-relaxed text-foreground">
        <code>{json}</code>
      </pre>
    </div>
  );
}

export function WhatsappInboundHelp() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Como enviar os dados</p>
        <p className="text-xs text-muted-foreground">
          Monte o JSON abaixo e assine com HMAC-SHA256 de{" "}
          <code className="rounded bg-muted px-1 font-mono">{"${timestamp}.${corpo}"}</code>, nos
          headers <code className="rounded bg-muted px-1 font-mono">X-Signature</code> e{" "}
          <code className="rounded bg-muted px-1 font-mono">X-Timestamp</code>. Copie o modelo e
          preencha os valores.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 font-medium">Campo</th>
              <th className="w-28 px-3 py-2 font-medium">Obrigatório</th>
              <th className="px-3 py-2 font-medium">O que é</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f.field} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-1.5 font-mono text-foreground">{f.field}</td>
                <td className="px-3 py-1.5">
                  <ReqBadge req={f.req} />
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <CopyBlock label="Exemplo , mensagem de texto" json={JSON_TEXT} />
        <CopyBlock label="Exemplo , mensagem com arquivo (imagem/PDF)" json={JSON_MEDIA} />
      </div>
    </div>
  );
}
