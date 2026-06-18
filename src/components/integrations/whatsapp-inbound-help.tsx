"use client";

/**
 * Ajuda na tela do webhook receptor de WhatsApp (F5.1): mostra a tabela dos
 * campos que o n8n deve enviar e o JSON padrão (texto e mídia) com botão de
 * copiar. Tudo derivado do contrato real (`inbound-payload.ts`).
 */

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldRow {
  field: string;
  req: string;
  note: string;
}

const FIELDS: FieldRow[] = [
  { field: "wa_id", req: "sim", note: "Número do WhatsApp do usuário" },
  { field: "user_id", req: "sim", note: "ID Meta do usuário (ex.: BR.4377...)" },
  { field: "type", req: "sim", note: "text | audio | image | document | video | sticker" },
  { field: "text", req: "condicional", note: "Obrigatório em text/audio; legenda em mídia" },
  { field: "message_id", req: "sim", note: "ID único da mensagem (idempotência)" },
  { field: "timestamp", req: "sim", note: "Epoch em ms" },
  { field: "contact_name", req: "não", note: "Nome do contato" },
  { field: "media.url", req: "mídia", note: "Link do arquivo (image/document/...)" },
  { field: "media.mime_type", req: "mídia", note: "Ex.: image/jpeg, application/pdf" },
  { field: "media.filename / id / sha256", req: "não", note: "Metadados opcionais da mídia" },
];

const JSON_TEXT = `{
  "wa_id": "5511965725987",
  "user_id": "BR.4377207372590200",
  "type": "text",
  "text": "qual o estoque da esteira X?",
  "message_id": "wamid.HBgM...",
  "timestamp": 1781727884000,
  "contact_name": "isabella cunha"
}`;

const JSON_MEDIA = `{
  "wa_id": "5511965725987",
  "user_id": "BR.4377207372590200",
  "type": "image",
  "text": "legenda opcional",
  "message_id": "wamid.HBgM...",
  "timestamp": 1781727884000,
  "contact_name": "isabella cunha",
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
        <code>{json}</code>
      </pre>
    </div>
  );
}

export function WhatsappInboundHelp() {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Como enviar do n8n</p>
        <p className="text-xs text-muted-foreground">
          Monte o JSON abaixo e assine com HMAC-SHA256 de{" "}
          <code className="font-mono">{"${timestamp}.${corpo}"}</code> (headers{" "}
          <code className="font-mono">X-Signature</code> e{" "}
          <code className="font-mono">X-Timestamp</code>).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="py-1.5 pr-3 font-medium">Campo</th>
              <th className="py-1.5 pr-3 font-medium">Obrigatório</th>
              <th className="py-1.5 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f.field} className="border-b border-border/30 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-foreground">{f.field}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{f.req}</td>
                <td className="py-1.5 text-muted-foreground">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CopyBlock label="JSON , texto" json={JSON_TEXT} />
        <CopyBlock label="JSON , mídia (imagem/PDF)" json={JSON_MEDIA} />
      </div>
    </div>
  );
}
