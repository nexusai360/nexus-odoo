"use client";

/**
 * Ajuda na tela do webhook receptor de WhatsApp (F5.1): seção colapsável (aberta
 * por padrão) que ensina a MONTAR O PAYLOAD em passos , Passo 1 (endereço/URL
 * real = base + slug), Passo 2 (headers), Passo 3 (tabela de campos) e, por fim,
 * o corpo (body) com cURL completo copiável e exemplos de texto e mídia. Os
 * campos opcionais aparecem marcados com "(opcional)" ao lado do valor (a marca
 * é só visual; o JSON copiado continua válido). Derivado do contrato real
 * (`inbound-payload.ts`). Não cita ferramenta específica.
 */

import * as React from "react";
import {
  Braces,
  Check,
  ChevronDown,
  Circle,
  Copy,
  KeyRound,
  Link2,
  Minus,
  Table2,
  Terminal,
} from "lucide-react";
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

/** Linha de um exemplo de JSON: texto cru + marca visual "(opcional)". A marca
 *  NÃO entra no que é copiado (o copy usa o JSON limpo). */
interface JsonLine {
  text: string;
  optional?: boolean;
}

const JSON_TEXT_LINES: JsonLine[] = [
  { text: "{" },
  { text: '  "wa_id": "5500000000000",' },
  { text: '  "user_id": "BR.0000000000000000",' },
  { text: '  "type": "text",' },
  { text: '  "text": "qual o estoque da esteira X?",' },
  { text: '  "message_id": "wamid.HBgM...",' },
  { text: '  "timestamp": 1781727884000,' },
  { text: '  "contact_name": "Nome do Contato"', optional: true },
  { text: "}" },
];

const JSON_MEDIA_LINES: JsonLine[] = [
  { text: "{" },
  { text: '  "wa_id": "5500000000000",' },
  { text: '  "user_id": "BR.0000000000000000",' },
  { text: '  "type": "image",' },
  { text: '  "text": "legenda da imagem",', optional: true },
  { text: '  "message_id": "wamid.HBgM...",' },
  { text: '  "timestamp": 1781727884000,' },
  { text: '  "contact_name": "Nome do Contato",', optional: true },
  { text: '  "media": {' },
  { text: '    "url": "https://.../arquivo.jpg",' },
  { text: '    "mime_type": "image/jpeg",' },
  { text: '    "filename": "tabela.pdf",', optional: true },
  { text: '    "id": "3657728954379391",', optional: true },
  { text: '    "sha256": "r2HIFOaG...gXc="', optional: true },
  { text: "  }" },
  { text: "}" },
];

/** Converte as linhas em JSON limpo (válido), sem as marcas "(opcional)". */
function linesToJson(lines: JsonLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

function useCopy(): [boolean, (value: string) => void] {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback((value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, []);
  return [copied, copy];
}

/** Botão de copiar reutilizável (texto + estado "Copiado"). */
function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : label}
    </button>
  );
}

/** Bloco de código com cabeçalho (rótulo + copiar) e corpo. Aceita string ou
 *  linhas anotáveis; quando recebe linhas, o copy usa o JSON limpo. */
function CodeBlock({
  label,
  code,
  lines,
  hint,
}: {
  label: string;
  code?: string;
  lines?: JsonLine[];
  hint?: string;
}) {
  const copyValue = code ?? (lines ? linesToJson(lines) : "");
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <CopyButton value={copyValue} />
      </div>
      <pre className="max-h-80 overflow-auto bg-background p-3 text-[11px] leading-relaxed text-foreground">
        <code>
          {lines
            ? lines.map((l, i) => (
                <span key={i} className="block">
                  {l.text}
                  {l.optional && (
                    <span className="ml-2 select-none text-muted-foreground/50">(opcional)</span>
                  )}
                </span>
              ))
            : code}
        </code>
      </pre>
      {hint && (
        <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Cabeçalho de um passo: ícone + "Passo N · título". */
function StepHeader({ n, icon: Icon, title }: { n: number; icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <h4 className="text-sm font-semibold text-foreground">
        <span className="text-muted-foreground">Passo {n} ·</span> {title}
      </h4>
    </div>
  );
}

export function WhatsappInboundHelp({
  inboundBaseUrl = "https://app.nexus-odoo.com/api/hooks/",
  path = "",
}: {
  /** Base read-only do endpoint de entrada (termina em "/"). */
  inboundBaseUrl?: string;
  /** Slug definido pelo usuário no formulário (o final do endereço). */
  path?: string;
}) {
  const [open, setOpen] = React.useState(true);

  const slug = path.trim() || "seu-endereco";
  const url = `${inboundBaseUrl}${slug}`;

  const headersText = [
    "Content-Type: application/json",
    "X-Timestamp: 1781727884000",
    "X-Signature: <HMAC-SHA256 de ${timestamp}.${body} com o token>",
  ].join("\n");

  const curl = [
    `curl -X POST '${url}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'X-Timestamp: 1781727884000' \\`,
    `  -H 'X-Signature: <assinatura HMAC-SHA256>' \\`,
    `  -d '${linesToJson(JSON_TEXT_LINES)}'`,
  ].join("\n");

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Como montar o payload</span>
          <span className="block text-xs text-muted-foreground">
            Endereço, headers e corpo da requisição , com exemplos prontos para copiar.
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-border/60 p-4">
          {/* Passo 1 , Endereço (URL real = base + slug) */}
          <section className="space-y-2">
            <StepHeader n={1} icon={Link2} title="Endereço (URL)" />
            <div className="space-y-2 pl-9.5">
              <p className="text-xs text-muted-foreground">
                Faça um <code className="rounded bg-muted px-1 font-mono text-foreground">POST</code> neste
                endereço (definido por você no campo acima):
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <code className="overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
                  {url}
                </code>
                <CopyButton value={url} label="Copiar URL" />
              </div>
            </div>
          </section>

          {/* Passo 2 , Headers */}
          <section className="space-y-2">
            <StepHeader n={2} icon={KeyRound} title="Headers" />
            <div className="space-y-2 pl-9.5">
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 font-mono text-foreground">X-Timestamp</code> é o
                horário atual em milissegundos.{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">X-Signature</code> é o
                HMAC-SHA256 de{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">{"${timestamp}.${body}"}</code>{" "}
                assinado com o token do webhook.
              </p>
              <CodeBlock label="Headers" code={headersText} />
            </div>
          </section>

          {/* Passo 3 , Campos */}
          <section className="space-y-2">
            <StepHeader n={3} icon={Table2} title="Campos do corpo" />
            <div className="space-y-2 pl-9.5">
              <p className="text-xs text-muted-foreground">
                O corpo é um JSON com os campos abaixo.
              </p>
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
            </div>
          </section>

          {/* Corpo (body): cURL completo + exemplos */}
          <section className="space-y-3 border-t border-border/60 pt-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Braces className="h-4 w-4" aria-hidden />
              </span>
              <h4 className="text-sm font-semibold text-foreground">Corpo (body) e exemplos</h4>
            </div>

            <div className="space-y-3 pl-9.5">
              <CodeBlock
                label={
                  // Rótulo com ícone de terminal para o comando pronto.
                  "cURL completo (URL + headers + body)"
                }
                code={curl}
                hint="Substitua o X-Signature pela assinatura HMAC-SHA256 gerada com o token do webhook."
              />

              <div className="grid gap-3 lg:grid-cols-2">
                <CodeBlock label="Exemplo , mensagem de texto" lines={JSON_TEXT_LINES} />
                <CodeBlock
                  label="Exemplo , mensagem de mídia"
                  lines={JSON_MEDIA_LINES}
                  hint="Os campos marcados com (opcional) podem ser omitidos , a marca é só visual e não vai no JSON copiado."
                />
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Use a URL e os headers acima para montar a requisição HTTP no n8n ou em qualquer cliente.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
