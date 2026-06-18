"use client";

/**
 * Ajuda na tela do webhook receptor de WhatsApp (F5.1): seção colapsável (aberta
 * por padrão) que ensina a MONTAR O PAYLOAD em passos, cada um com seu próprio
 * dropdown (abrir/fechar) para não ocupar a tela inteira:
 *  - Passo 1: Endereço (URL real = base + slug). Copiar só habilita com a URL
 *    preenchida; vazio mostra aviso para preencher o campo acima.
 *  - Passo 2: Headers, explicados em linguagem de leigo (token = secret do
 *    webhook; X-Timestamp = horário em ms; X-Signature = HMAC calculado pelo n8n).
 *  - Passo 3: tabela de campos do body.
 *  - Exemplos de cURL: dois comandos COMPLETOS (texto e mídia), prontos para
 *    copiar; opcionais marcados com "(opcional)" (só visual, o copiado fica limpo).
 * Derivado do contrato real (`inbound-payload.ts`) e do esquema HMAC (`hmac.ts`).
 */

import * as React from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  FileJson,
  KeyRound,
  Link2,
  Minus,
  ShieldCheck,
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

/** Linha de exemplo: texto cru + marca visual "(opcional)". A marca NÃO entra
 *  no que é copiado (o copy usa o texto limpo). */
interface CodeLine {
  text: string;
  optional?: boolean;
}

const BODY_TEXT: CodeLine[] = [
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

const BODY_MEDIA: CodeLine[] = [
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

/** Exemplo (genérico, JavaScript) de como gerar a X-Signature a partir do token. */
const SIGN_EXAMPLE: CodeLine[] = [
  { text: 'const crypto = require("crypto");' },
  { text: "" },
  { text: 'const token = "TOKEN_DO_WEBHOOK";        // segredo mostrado ao criar' },
  { text: "const timestamp = Date.now().toString(); // vai no header X-Timestamp" },
  { text: "const body = JSON.stringify(payload);    // o corpo da requisição" },
  { text: "" },
  { text: "const signature = crypto" },
  { text: '  .createHmac("sha256", token)           // token = chave' },
  { text: "  .update(`${timestamp}.${body}`)        // texto assinado" },
  { text: '  .digest("hex");                        // resultado vai no X-Signature' },
];

/** Monta as linhas de um cURL COMPLETO (URL + headers + body) a partir do body. */
function curlLines(url: string, body: CodeLine[]): CodeLine[] {
  const open = body[0];
  const middle = body.slice(1, -1);
  const close = body[body.length - 1];
  return [
    { text: `curl -X POST '${url}' \\` },
    { text: `  -H 'Content-Type: application/json' \\` },
    { text: `  -H 'X-Timestamp: 1781727884000' \\` },
    { text: `  -H 'X-Signature: <assinatura gerada com o token>' \\` },
    { text: `  -d '${open.text}` },
    ...middle.map((l) => ({ text: l.text, optional: l.optional })),
    { text: `${close.text}'` },
  ];
}

/** Texto limpo (copiável) de uma lista de linhas, sem as marcas "(opcional)". */
function linesToText(lines: CodeLine[]): string {
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

function CopyButton({
  value,
  label = "Copiar",
  disabled = false,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && copy(value)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground/40"
          : copied
            ? "cursor-pointer border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "cursor-pointer border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : label}
    </button>
  );
}

/** Bloco de código com cabeçalho (rótulo + copiar) e corpo com linhas anotáveis. */
function CodeBlock({ label, lines, hint }: { label: string; lines: CodeLine[]; hint?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <CopyButton value={linesToText(lines)} />
      </div>
      <pre className="max-h-80 overflow-auto bg-background p-3 text-[11px] leading-relaxed text-foreground">
        <code>
          {lines.map((l, i) => (
            <span key={i} className="block whitespace-pre">
              {l.text}
              {l.optional && <span className="ml-2 select-none text-muted-foreground/50">(opcional)</span>}
            </span>
          ))}
        </code>
      </pre>
      {hint && (
        <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Passo com dropdown próprio (abrir/fechar). Numerado quando `n` é informado. */
function Step({
  icon: Icon,
  n,
  title,
  defaultOpen = true,
  children,
}: {
  icon: React.ElementType;
  n?: number;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="flex-1 text-sm font-semibold text-foreground">
          {n != null && <span className="text-muted-foreground">Passo {n} · </span>}
          {title}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="space-y-3 border-t border-border/50 p-3">{children}</div>}
    </section>
  );
}

/** Uma linha de explicação de header (ícone + nome + obrigatoriedade + texto). */
function HeaderHelp({
  icon: Icon,
  name,
  required,
  children,
}: {
  icon: React.ElementType;
  name: string;
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2">
          <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">{name}</code>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              required
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {required ? "obrigatório" : "fixo"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
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

  const hasPath = path.trim().length > 0;
  const url = `${inboundBaseUrl}${path.trim()}`;
  // Nos exemplos de cURL usamos um marcador quando a URL ainda não foi definida.
  const urlForExamples = hasPath ? url : `${inboundBaseUrl}<seu-endereco>`;

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
            Endereço, headers e corpo da requisição. Abra cada passo conforme precisar.
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border/60 p-3">
          {/* Passo 1 , Endereço (URL real) */}
          <Step icon={Link2} n={1} title="Endereço (URL)">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Use o método
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary ring-1 ring-primary/20">
                POST
              </span>
              neste endereço:
            </p>
            {hasPath ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <code className="overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
                  {url}
                </code>
                <CopyButton value={url} label="Copiar URL" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
                <span className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Preencha o campo Endereço (URL) acima para gerar o endereço.
                </span>
                <CopyButton value="" label="Copiar URL" disabled />
              </div>
            )}
          </Step>

          {/* Passo 2 , Headers (explicação para leigo) */}
          <Step icon={KeyRound} n={2} title="Headers">
            <p className="text-xs text-muted-foreground">A requisição leva três cabeçalhos:</p>
            <div className="space-y-4">
              <HeaderHelp icon={FileJson} name="Content-Type" required={false}>
                Sempre <code className="rounded bg-muted px-1 font-mono text-foreground">application/json</code>.
              </HeaderHelp>
              <HeaderHelp icon={Clock} name="X-Timestamp" required>
                O horário do envio, em milissegundos (ex.: 1781727884000). A requisição precisa chegar em até
                5 minutos desse horário, senão é recusada (proteção contra reenvio de mensagens antigas).
              </HeaderHelp>
              <HeaderHelp icon={ShieldCheck} name="X-Signature" required>
                A prova de que a mensagem é autêntica.{" "}
                <span className="font-medium text-foreground">Aqui não vai o token</span>: vai o resultado do
                cálculo abaixo (feito com o token). Muda a cada mensagem.
              </HeaderHelp>
            </div>

            {/* O token é a CHAVE; a assinatura calculada é que vai no header. */}
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Como gerar a X-Signature</p>
              <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
                <li>
                  Monte o texto{" "}
                  <code className="rounded bg-muted px-1 font-mono text-foreground">{"${X-Timestamp}.${body}"}</code>{" "}
                  (o mesmo valor do X-Timestamp, um ponto, e o corpo JSON exatamente como enviado).
                </li>
                <li>
                  Gere o <span className="font-medium text-foreground">HMAC-SHA256</span> desse texto usando o{" "}
                  <span className="font-medium text-foreground">token do webhook</span> como chave, com saída
                  em hexadecimal.
                </li>
                <li>
                  Coloque esse resultado no header{" "}
                  <code className="rounded bg-muted px-1 font-mono text-foreground">X-Signature</code>.
                </li>
              </ol>
            </div>

            <CodeBlock label="Exemplo: gerar a assinatura (JavaScript)" lines={SIGN_EXAMPLE} />

            <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">
                O <span className="font-medium text-foreground">token</span> é o segredo do webhook, mostrado
                ao criar (e no botão Rotacionar). Ele é só a chave do cálculo: nunca vai dentro de um header.
                Guarde-o com segurança.
              </p>
            </div>
          </Step>

          {/* Passo 3 , Campos do body */}
          <Step icon={Table2} n={3} title="Body">
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
          </Step>

          {/* Exemplos de cURL (fechado por padrão para não ocupar a tela) */}
          <Step icon={Terminal} title="Exemplos de cURL" defaultOpen={false}>
            <p className="text-xs text-muted-foreground">
              Comandos completos (URL + headers + body), prontos para copiar.
            </p>
            <CodeBlock label="cURL · mensagem de texto" lines={curlLines(urlForExamples, BODY_TEXT)} />
            <CodeBlock
              label="cURL · mensagem de mídia"
              lines={curlLines(urlForExamples, BODY_MEDIA)}
              hint="Os campos marcados com (opcional) podem ser omitidos , a marca é só visual e não vai no comando copiado."
            />
          </Step>
        </div>
      )}
    </div>
  );
}
