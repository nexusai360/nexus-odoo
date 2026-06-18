"use client";

/**
 * Ajuda na tela do webhook receptor de WhatsApp (F5.1): seção colapsável (aberta
 * por padrão) detalhando a requisição , URL, headers e body (o JSON) , com os
 * campos, a obrigatoriedade (com ícones) e exemplos copiáveis (texto e mídia).
 * Derivado do contrato real (`inbound-payload.ts`). Não cita ferramenta
 * específica: vale para qualquer forma de envio.
 */

import * as React from "react";
import { Check, ChevronDown, Copy, Minus, Circle } from "lucide-react";
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
  { field: "text", req: "cond", note: "Obrigatório em texto e áudio; opcional para legenda em mídia" },
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
    "filename": "tabela.pdf",
    "id": "3657728954379391",
    "sha256": "r2HIFOaG...gXc="
  }
}`;

function CopyBlock({ label, json, hint }: { label: string; json: string; hint?: string }) {
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
      {hint && <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function WhatsappInboundHelp() {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Como enviar os dados</span>
          <span className="block text-xs text-muted-foreground">
            URL, headers e corpo da requisição , com exemplos prontos.
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 p-4">
          {/* Detalhes da requisição: URL, headers, body */}
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="font-medium text-foreground">1. Endereço (URL)</p>
              <p className="mt-1 text-muted-foreground">
                Faça um <code className="rounded bg-muted px-1 font-mono">POST</code> no endereço que
                você definiu acima (campo <span className="font-medium">Endereço</span>).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="font-medium text-foreground">2. Headers</p>
              <p className="mt-1 text-muted-foreground">
                <code className="rounded bg-muted px-1 font-mono">X-Timestamp</code>: agora em ms.{" "}
                <code className="rounded bg-muted px-1 font-mono">X-Signature</code>: HMAC-SHA256 de{" "}
                <code className="rounded bg-muted px-1 font-mono">{"${timestamp}.${corpo}"}</code> com o
                token do webhook.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="font-medium text-foreground">3. Corpo (body)</p>
              <p className="mt-1 text-muted-foreground">
                O JSON com os campos abaixo. Use os modelos prontos e preencha os valores.
              </p>
            </div>
          </div>

          {/* Tabela de campos */}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Campo</th>
                  <th className="w-28 px-3 py-2 font-medium">Obrigatório</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
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

          {/* Exemplos */}
          <div className="grid gap-3 lg:grid-cols-2">
            <CopyBlock label="Exemplo , mensagem de texto" json={JSON_TEXT} />
            <CopyBlock
              label="Exemplo , mensagem de mídia"
              json={JSON_MEDIA}
              hint="media.filename, media.id e media.sha256 são opcionais , envie quando tiver."
            />
          </div>
        </div>
      )}
    </div>
  );
}
