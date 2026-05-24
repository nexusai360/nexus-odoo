"use client";

import { useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Key,
  Zap,
  BookOpen,
  Terminal,
  Lightbulb,
  AlertTriangle,
  Gauge,
  ShieldCheck,
  Layers,
  Repeat,
  Hash,
  Clock,
  ListTree,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moduleLabel } from "@/lib/mcp-module-labels";
import { useTour } from "@/components/tour/tour-provider";
import { servidorMcpDocsTour } from "@/lib/tours/servidor-mcp-tour";
import type { CatalogByModule, CatalogInputField, CatalogToolItem } from "@/lib/actions/mcp-catalog-schema";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Language = "curl" | "javascript" | "python";

const langLabels: Record<Language, string> = {
  curl: "cURL",
  javascript: "JavaScript",
  python: "Python",
};

// ---------------------------------------------------------------------------
// JSON Syntax Highlighting
// ---------------------------------------------------------------------------

function highlightJson(json: string): ReactNode {
  const lines = json.split("\n");

  return lines.map((line, lineIdx) => {
    const parts: ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    while (remaining.length > 0) {
      const commentMatch = remaining.match(/^(\s*)(\/\/.*)/);
      if (commentMatch) {
        if (commentMatch[1]) parts.push(commentMatch[1]);
        parts.push(
          <span key={`c-${lineIdx}-${keyIdx++}`} className="text-zinc-600 italic">
            {commentMatch[2]}
          </span>,
        );
        remaining = "";
        break;
      }

      const wsMatch = remaining.match(/^(\s+)/);
      if (wsMatch) {
        parts.push(wsMatch[1]);
        remaining = remaining.slice(wsMatch[1].length);
        continue;
      }

      const bracketMatch = remaining.match(/^([{}\[\],:])/);
      if (bracketMatch) {
        parts.push(
          <span key={`b-${lineIdx}-${keyIdx++}`} className="text-zinc-500">
            {bracketMatch[1]}
          </span>,
        );
        remaining = remaining.slice(1);
        if (bracketMatch[1] === ":" && remaining.startsWith(" ")) {
          parts.push(" ");
          remaining = remaining.slice(1);
        }
        continue;
      }

      const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")(\s*:)/);
      if (keyMatch) {
        parts.push(
          <span key={`k-${lineIdx}-${keyIdx++}`} className="text-violet-400">
            {keyMatch[1]}
          </span>,
        );
        remaining = remaining.slice(keyMatch[1].length);
        continue;
      }

      const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
      if (strMatch) {
        parts.push(
          <span key={`s-${lineIdx}-${keyIdx++}`} className="text-emerald-400">
            {strMatch[1]}
          </span>,
        );
        remaining = remaining.slice(strMatch[1].length);
        continue;
      }

      const numMatch = remaining.match(/^(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/);
      if (numMatch) {
        parts.push(
          <span key={`n-${lineIdx}-${keyIdx++}`} className="text-amber-400">
            {numMatch[1]}
          </span>,
        );
        remaining = remaining.slice(numMatch[1].length);
        continue;
      }

      const boolMatch = remaining.match(/^(true|false|null)/);
      if (boolMatch) {
        parts.push(
          <span key={`bl-${lineIdx}-${keyIdx++}`} className="text-sky-400">
            {boolMatch[1]}
          </span>,
        );
        remaining = remaining.slice(boolMatch[1].length);
        continue;
      }

      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    return (
      <span key={`line-${lineIdx}`}>
        {parts}
        {lineIdx < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Code Syntax Highlighting (JS / Python / curl)
// ---------------------------------------------------------------------------

function highlightCode(code: string): ReactNode {
  const lines = code.split("\n");

  return lines.map((line, lineIdx) => {
    const parts: ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    while (remaining.length > 0) {
      const lineCommentMatch = remaining.match(/^(\/\/.*)/);
      if (lineCommentMatch) {
        parts.push(
          <span key={`lc-${lineIdx}-${keyIdx++}`} className="text-zinc-600 italic">
            {lineCommentMatch[1]}
          </span>,
        );
        remaining = "";
        break;
      }

      const pyCommentMatch = remaining.match(/^(#.*)/);
      if (pyCommentMatch) {
        parts.push(
          <span key={`pc-${lineIdx}-${keyIdx++}`} className="text-zinc-600 italic">
            {pyCommentMatch[1]}
          </span>,
        );
        remaining = "";
        break;
      }

      const wsMatch = remaining.match(/^(\s+)/);
      if (wsMatch) {
        parts.push(wsMatch[1]);
        remaining = remaining.slice(wsMatch[1].length);
        continue;
      }

      const dqMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
      if (dqMatch) {
        parts.push(
          <span key={`dq-${lineIdx}-${keyIdx++}`} className="text-emerald-400">
            {dqMatch[1]}
          </span>,
        );
        remaining = remaining.slice(dqMatch[1].length);
        continue;
      }

      const sqMatch = remaining.match(/^('(?:[^'\\]|\\.)*')/);
      if (sqMatch) {
        parts.push(
          <span key={`sq-${lineIdx}-${keyIdx++}`} className="text-emerald-400">
            {sqMatch[1]}
          </span>,
        );
        remaining = remaining.slice(sqMatch[1].length);
        continue;
      }

      const kwMatch = remaining.match(
        /^(const|let|var|async|await|function|return|if|else|for|while|try|catch|throw|new|import|from|export|of)\b/,
      );
      if (kwMatch) {
        parts.push(
          <span key={`kw-${lineIdx}-${keyIdx++}`} className="text-violet-400">
            {kwMatch[1]}
          </span>,
        );
        remaining = remaining.slice(kwMatch[1].length);
        continue;
      }

      const pyKwMatch = remaining.match(
        /^(import|from|def|return|if|elif|else|for|while|with|as|None|True|False|print)\b/,
      );
      if (pyKwMatch) {
        parts.push(
          <span key={`pk-${lineIdx}-${keyIdx++}`} className="text-violet-400">
            {pyKwMatch[1]}
          </span>,
        );
        remaining = remaining.slice(pyKwMatch[1].length);
        continue;
      }

      const numMatch = remaining.match(/^(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/);
      if (numMatch) {
        parts.push(
          <span key={`n-${lineIdx}-${keyIdx++}`} className="text-amber-400">
            {numMatch[1]}
          </span>,
        );
        remaining = remaining.slice(numMatch[1].length);
        continue;
      }

      const bracketMatch = remaining.match(/^([{}\[\](),:;])/);
      if (bracketMatch) {
        parts.push(
          <span key={`br-${lineIdx}-${keyIdx++}`} className="text-zinc-500">
            {bracketMatch[1]}
          </span>,
        );
        remaining = remaining.slice(1);
        continue;
      }

      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    return (
      <span key={`line-${lineIdx}`}>
        {parts}
        {lineIdx < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------

function CodeBlock({
  code,
  highlight = false,
  highlightAs,
}: {
  code: Partial<Record<Language, string>> | string;
  highlight?: boolean;
  highlightAs?: "json" | "code";
}) {
  const isMulti = typeof code !== "string";
  const langs = isMulti ? (Object.keys(code) as Language[]) : [];
  const [activeLang, setActiveLang] = useState<Language>(langs[0] ?? "curl");
  const [copied, setCopied] = useState(false);

  const currentCode = isMulti ? (code[activeLang] ?? "") : code;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    toast.success("Copiado");
    setTimeout(() => setCopied(false), 2000);
  }, [currentCode]);

  const renderHighlighted = () => {
    if (highlightAs === "code") return highlightCode(currentCode);
    if (highlightAs === "json" || highlight) return highlightJson(currentCode);
    if (isMulti) return highlightCode(currentCode);
    return currentCode;
  };

  return (
    <div className="group rounded-lg border border-border bg-zinc-950 overflow-hidden">
      {isMulti && langs.length > 1 && (
        <div className="flex items-center gap-1 border-b border-border bg-zinc-900/80 px-3 py-1.5">
          {langs.map((lang) => (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activeLang === lang
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {langLabels[lang]}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleCopy}
            aria-label="Copiar código"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
      <div className="relative">
        {(!isMulti || langs.length <= 1) && (
          <button
            onClick={handleCopy}
            aria-label="Copiar código"
            className="absolute right-2 top-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 opacity-0 transition-all hover:text-zinc-300 group-hover:opacity-100"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          <code className="font-mono text-zinc-300">{renderHighlighted()}</code>
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5">
      <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
      <div className="text-xs text-amber-700 dark:text-amber-200/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3.5">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
      <div className="text-xs text-red-700 dark:text-red-200/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers, exemplos JSON-RPC
// ---------------------------------------------------------------------------

const BASE_FALLBACK = "https://seu-dominio.com/api/mcp";

/**
 * Placeholder semântico para gerar um valor de exemplo em cada campo do input.
 * Resolve o bug visual antigo onde tudo virava `"..."`. Cobre os tipos do snapshot.
 */
export function typedPlaceholder(field: CatalogInputField): unknown {
  switch (field.type) {
    case "boolean":
      return true;
    case "integer":
    case "number":
      return 1;
    case "date":
      return "2026-05-24";
    case "datetime":
      return "2026-05-24T00:00:00Z";
    case "enum":
      return field.enumValues?.[0] ?? "<valor>";
    case "array":
      return [];
    case "object":
      return {};
    case "string":
      return `<${field.name}>`;
    default:
      return "<valor>";
  }
}

function buildExamples(base: string, toolName: string, args: Record<string, unknown>, opts: { write?: boolean } = {}): Record<Language, string> {
  const argsJson = JSON.stringify(args, null, 2)
    .split("\n")
    .map((l, i) => (i === 0 ? l : "        " + l))
    .join("\n");
  const body = `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "${toolName}",
    "arguments": ${argsJson}
  }
}`;
  const isWrite = opts.write === true;
  const curlIdemPrefix = isWrite ? `IDEM=$(uuidgen)\n` : "";
  const curlIdemHeader = isWrite ? `  -H "Idempotency-Key: $IDEM" \\\n` : "";
  const jsIdemConst = isWrite ? `const idem = crypto.randomUUID();\n` : "";
  const jsIdemHeader = isWrite ? `,\n    "Idempotency-Key": idem` : "";
  const pyIdemImport = isWrite ? "import uuid\n" : "";
  const pyIdemVar = isWrite ? "idem = str(uuid.uuid4())\n" : "";
  const pyIdemHeader = isWrite ? `,\n        "Idempotency-Key": idem` : "";
  return {
    curl: `${curlIdemPrefix}curl -X POST "${base}" \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
${curlIdemHeader}  -d '${body}'`,
    javascript: `${jsIdemConst}const res = await fetch("${base}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer mcp_live_SEU_TOKEN",
    "Content-Type": "application/json"${jsIdemHeader}
  },
  body: JSON.stringify(${body})
});
const data = await res.json();`,
    python: `import requests
${pyIdemImport}
${pyIdemVar}res = requests.post(
    "${base}",
    headers={
        "Authorization": "Bearer mcp_live_SEU_TOKEN",
        "Content-Type": "application/json"${pyIdemHeader}
    },
    json=${body.replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None")}
)
data = res.json()`,
  };
}

/** Converte os exemplos do catálogo (por linguagem) em um record para o CodeBlock. */
function toolExamplesRecord(tool: CatalogToolItem): Partial<Record<Language, string>> | null {
  const record: Partial<Record<Language, string>> = {};
  for (const ex of tool.examples) {
    const lang = ex.language.toLowerCase();
    if (lang === "curl" || lang === "bash" || lang === "shell") record.curl = ex.code;
    else if (lang === "javascript" || lang === "js") record.javascript = ex.code;
    else if (lang === "python" || lang === "py") record.python = ex.code;
  }
  return Object.keys(record).length > 0 ? record : null;
}

// ---------------------------------------------------------------------------
// ToolCard, card expansível de uma tool do catálogo
// ---------------------------------------------------------------------------

function ToolCard({
  tool,
  base,
  isFirst,
  forceOpen,
}: {
  tool: CatalogToolItem;
  base: string;
  isFirst?: boolean;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // O tour da Documentação força a abertura da primeira tool, para o passo
  // mostrar os argumentos e o exemplo de chamada já visíveis.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const isWrite = tool.operation === "write";
  const kindClass = isWrite
    ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  const catalogExamples = toolExamplesRecord(tool);
  const sampleArgs: Record<string, unknown> = {};
  const fields: CatalogInputField[] = tool.inputSchemaFields
    ? tool.inputSchemaFields
    : tool.inputSchemaKeys.map((name) => ({ name, type: "unknown" as const, optional: false }));
  for (const f of fields.slice(0, 3)) {
    sampleArgs[f.name] = typedPlaceholder(f);
  }
  const fallbackExamples = buildExamples(base, tool.id, sampleArgs, { write: isWrite });

  return (
    <div
      data-tour={isFirst ? "mcp-docs-tool" : undefined}
      className="rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-foreground/20"
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            "inline-flex w-[68px] shrink-0 items-center justify-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
            kindClass,
          )}
        >
          {isWrite ? "Escrita" : "Leitura"}
        </span>
        <code className="text-sm font-mono text-foreground truncate">{tool.id}</code>
        {tool.sensitive && (
          <span className="ml-auto hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Sensível
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{tool.descricao}</p>

              {isWrite && tool.capability && (
                <div className="flex items-start gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                  <Key className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta tool exige a capability{" "}
                    <code className="rounded bg-violet-500/10 px-1 py-0.5 font-mono">
                      {tool.capability}
                    </code>{" "}
                    marcada na chave de acesso e o header{" "}
                    <code className="rounded bg-violet-500/10 px-1 py-0.5 font-mono">
                      Idempotency-Key
                    </code>{" "}
                    em toda chamada.
                  </span>
                </div>
              )}

              {tool.inputSchemaKeys.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Argumentos
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tool.inputSchemaKeys.map((k) => (
                      <code
                        key={k}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                      >
                        {k}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Exemplo de chamada
                </h4>
                <CodeBlock code={catalogExamples ?? fallbackExamples} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navegação de seções
// ---------------------------------------------------------------------------

type SectionGroup = "visao-geral" | "externo" | "interno";

interface DocSection {
  id: string;
  label: string;
  icon: typeof BookOpen;
  group: SectionGroup;
}

const GROUP_LABELS: Record<SectionGroup, string> = {
  "visao-geral": "Visão geral",
  externo: "Integrar de fora",
  interno: "Operar por dentro",
};

const sections: DocSection[] = [
  { id: "intro", label: "Início", icon: BookOpen, group: "visao-geral" },
  { id: "concepts", label: "Conceitos", icon: ListTree, group: "visao-geral" },
  { id: "errors", label: "Códigos de erro", icon: AlertTriangle, group: "visao-geral" },
  { id: "rate-limits", label: "Rate limits", icon: Gauge, group: "visao-geral" },
  { id: "como-comecar", label: "Como começar", icon: ArrowRight, group: "externo" },
  { id: "auth", label: "Autenticação", icon: Key, group: "externo" },
  { id: "headers", label: "Headers obrigatórios", icon: Hash, group: "externo" },
  { id: "flow", label: "Fluxo de chamada", icon: Zap, group: "externo" },
  { id: "tools-leitura", label: "Tools de leitura", icon: Layers, group: "externo" },
  { id: "tools-escrita", label: "Tools de escrita", icon: ShieldCheck, group: "externo" },
  { id: "quando-usar", label: "Quando usar", icon: Clock, group: "interno" },
  { id: "service-token", label: "Service token e identidade", icon: Key, group: "interno" },
  { id: "restricao-escrita", label: "Restrição de escrita", icon: ShieldCheck, group: "interno" },
  { id: "exemplo-agente-nex", label: "Exemplo: Agente Nex", icon: Terminal, group: "interno" },
];

const concepts = [
  {
    title: "Stateless",
    icon: <Repeat className="h-4 w-4 text-emerald-500" />,
    content:
      "Cada chamada se autentica sozinha; não há sessão. Reenvie o header Authorization em toda requisição. Tools de leitura respondem do cache Postgres interno, sincronizado periodicamente com o Odoo.",
  },
  {
    title: "JSON-RPC 2.0",
    icon: <Layers className="h-4 w-4 text-violet-500" />,
    content:
      "Protocolo de RPC padrão da indústria. Envie {jsonrpc, id, method, params}; receba {jsonrpc, id, result | error}. Versão 2.0 é a única suportada. Sem chamadas em lote por enquanto.",
  },
  {
    title: "Modos de autenticação",
    icon: <Key className="h-4 w-4 text-amber-500" />,
    content:
      "Dois modos, mutuamente exclusivos. Externo (Bearer mcp_live_*) para integradores. Interno (MCP_SERVICE_TOKEN + X-Mcp-User-Id) só para código nosso server-side. Detalhes em Operar por dentro.",
  },
  {
    title: "RBAC por capabilities",
    icon: <ShieldCheck className="h-4 w-4 text-amber-500" />,
    content:
      "O que sua chave vê em tools/list depende das capabilities marcadas no momento da criação. Tools fora do escopo não aparecem. A verificação é estrutural (7 camadas), não depende de prompt.",
  },
];

const errorCodes = [
  {
    code: "unauthorized",
    http: 401,
    description: "Header Authorization ausente, token inválido ou chave revogada. Reenvie com um token válido.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "capability_missing",
    http: 403,
    description: "A chave existe, mas não tem permissão para a tool. Edite a chave em Chaves de Acesso e marque a capability.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "idempotency_key_required",
    http: 400,
    description: "Tool de escrita chamada sem o header Idempotency-Key. Envie um UUID v4 novo e refaça.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "idempotency_conflict",
    http: 409,
    description: "Mesma Idempotency-Key reutilizada com payload diferente. Gere uma chave nova ou repita o payload original.",
    color: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    code: "idempotency_in_progress",
    http: 422,
    description: "A mesma Idempotency-Key já está em execução em outra requisição. Aguarde alguns segundos e tente de novo.",
    color: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    code: "rate_limit_exceeded",
    http: 429,
    description: "Mais chamadas por minuto que o limite da chave. Espere o retryAfterMs antes de tentar de novo.",
    color: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    code: "idempotency_lock_unavailable",
    http: 503,
    description: "Lock distribuído (Redis) indisponível. Tente novamente em alguns segundos.",
    color: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
];

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // O scroll real acontece no <main> do layout, não na window; scrollIntoView
  // rola o container correto. O deslocamento vem do scroll-mt das seções.
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// SideNav
// ---------------------------------------------------------------------------

function SideNav({ activeSection }: { activeSection: string }) {
  const groups: SectionGroup[] = ["visao-geral", "externo", "interno"];
  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <div key={group} className="space-y-0.5">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {GROUP_LABELS[group]}
          </div>
          {sections
            .filter((s) => s.group === group)
            .map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {s.label}
                </button>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle
// ---------------------------------------------------------------------------

function SectionTitle({ icon: Icon, color, children }: { icon: typeof Key; color: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-5 w-5", color)} />
      <h2 className="text-xl font-semibold text-foreground">{children}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface Props {
  catalog: CatalogByModule[];
  mcpUrl?: string;
}

export function McpDocsContent({ catalog, mcpUrl }: Props) {
  const base = mcpUrl && mcpUrl.length > 0 ? mcpUrl : BASE_FALLBACK;
  const { active, currentStepIndex } = useTour();
  // No tour da Documentação, ao chegar no passo "tool-aberta" (índice 3) a
  // primeira tool do catálogo é aberta para o passo destacá-la.
  const docsToolStepActive =
    active?.id === servidorMcpDocsTour.id && currentStepIndex >= 3;
  const firstToolId =
    catalog.flatMap((m) => [...m.readTools, ...m.writeTools])[0]?.id ?? null;
  const [activeSection, setActiveSection] = useState("intro");
  const [spacerHeight, setSpacerHeight] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current?.observe(el);
    });

    // O scroll real acontece no <main> do layout protegido (overflow-y-auto).
    const scrollEl = document.querySelector("main");
    const lastId = sections[sections.length - 1].id;
    // Topo padrão de cada seção ao ser selecionada (scroll-mt-24 = 96px).
    const TOP_OFFSET = 96;

    function onScroll() {
      if (!scrollEl) return;
      const atBottom =
        scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
      if (atBottom) setActiveSection(lastId);
    }

    // Espaçador dinâmico: ajusta o espaço de rolagem abaixo do conteúdo para que
    // a rolagem máxima posicione a última seção exatamente no topo padrão, e nada
    // além. Auto-corrige (o espaçador é a única variável): newSpacer = prev +
    // (rolagem desejada - rolagem atual).
    function recomputeSpacer() {
      const last = document.getElementById(lastId);
      if (!scrollEl || !last) return;
      const lastTop =
        last.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop;
      const desiredMaxScroll = Math.max(0, lastTop - TOP_OFFSET);
      const currentMaxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      setSpacerHeight((prev) =>
        Math.max(0, Math.round(prev + (desiredMaxScroll - currentMaxScroll))),
      );
    }

    recomputeSpacer();
    const settle = setTimeout(recomputeSpacer, 300);
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", recomputeSpacer);

    return () => {
      observerRef.current?.disconnect();
      scrollEl?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", recomputeSpacer);
      clearTimeout(settle);
    };
  }, []);

  const totalTools = catalog.reduce((acc, m) => acc + m.readTools.length + m.writeTools.length, 0);

  const authExample = buildExamples(base, "estoque_saldo_produto", { armazemId: 1 });

  return (
    <div className="flex gap-8">
      {/* Navegação lateral, oculta em telas menores */}
      <div className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-24 space-y-2">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Navegação
          </p>
          <SideNav activeSection={activeSection} />
        </div>
      </div>

      {/* Conteúdo */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-w-0 flex-1 space-y-12"
      >
        {/* Hero */}
        <motion.div variants={itemVariants} id="intro" className="space-y-6 scroll-mt-24">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Documentação do Servidor MCP
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Endpoint semântico para agentes de IA, com {totalTools} tools de leitura e escrita sobre os dados do Odoo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 font-mono text-sm text-foreground">
              <Terminal className="h-4 w-4 text-violet-500" />
              {base}
            </span>
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            >
              v1
            </Badge>
            <Badge
              variant="secondary"
              className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
            >
              Streamable HTTP
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            O servidor MCP expõe os dados do Odoo por ferramentas semânticas, não por SQL livre. Cada tool tem contrato validado e auditado. Leitura responde do cache Postgres interno (atualizado pelo worker). Escrita vai ao Odoo, gated por capability da chave de API e idempotência. Esta página cobre os dois modos de uso: integração externa (Bearer mcp_live_*) e operação interna server-side (service token).
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Conceitos */}
        <motion.div variants={itemVariants} id="concepts" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={ListTree} color="text-violet-500">
            Conceitos
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Quatro ideias que valem entender antes de integrar.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {c.icon}
                  <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Códigos de erro */}
        <motion.div variants={itemVariants} id="errors" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={AlertTriangle} color="text-red-500">
            Códigos de erro
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Os erros que o servidor pode retornar e como agir em cada um.
          </p>
          <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Código</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">HTTP</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Quando acontece e como resolver</th>
                </tr>
              </thead>
              <tbody>
                {errorCodes.map((e) => (
                  <tr key={e.code} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {e.code}
                      </code>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono",
                          e.color,
                        )}
                      >
                        {e.http}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Rate limits */}
        <motion.div variants={itemVariants} id="rate-limits" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Gauge} color="text-violet-500">
            Rate limits
          </SectionTitle>
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cada chave tem um limite por minuto, configurável no passo 3 do assistente de criação. Mínimo 1, máximo 600, padrão 60. Janela de 60 segundos deslizantes, contagem por chave. Ao exceder, o servidor responde com HTTP 429 e o campo <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">retryAfterMs</code> indicando quantos milissegundos aguardar.
            </p>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Resposta quando o limite é atingido
              </h4>
              <CodeBlock
                highlight
                code={`{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "rate_limit_exceeded",
    "data": {
      "errorCode": "rate_limit_exceeded",
      "retryAfterMs": 12000
    }
  }
}`}
              />
            </div>
            <Tip>
              Use backoff exponencial com jitter nas automações. Acima de 600 req/min, peça aumento ao suporte.
            </Tip>
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Como começar — modo externo */}
        <motion.div variants={itemVariants} id="como-comecar" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={ArrowRight} color="text-violet-500">
            Como começar
          </SectionTitle>
          <div
            data-tour="mcp-docs-passos"
            className="rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <ol className="space-y-1.5">
              {[
                {
                  n: 1,
                  t: "Crie uma chave de API",
                  d: "Em Integrações > Servidor MCP > Chaves de Acesso, clique em Nova chave.",
                  href: "/integracoes/servidor-mcp/chaves",
                },
                {
                  n: 2,
                  t: "Marque as capabilities",
                  d: "No passo 2 do assistente, escolha leitura ou leitura e escrita por módulo.",
                  href: "/integracoes/servidor-mcp/chaves",
                },
                {
                  n: 3,
                  t: "Copie o token",
                  d: "Na tela final, o token mcp_live_... aparece uma única vez. Guarde em local seguro.",
                  href: "/integracoes/servidor-mcp/chaves",
                },
                {
                  n: 4,
                  t: "Faça a primeira chamada",
                  d: "Use o token no header Authorization. Veja Autenticação e Headers obrigatórios.",
                  section: "auth",
                },
              ].map((step) => {
                const inner = (
                  <>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-500">
                      {step.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{step.t}</span>
                      <span className="block text-[13px] text-muted-foreground leading-relaxed">
                        {step.d}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </>
                );
                const className =
                  "flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted/50";
                return (
                  <li key={step.n}>
                    {step.href ? (
                      <Link href={step.href} className={className}>
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => step.section && scrollToSection(step.section)}
                        className={className}
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Autenticação — modo externo */}
        <motion.div variants={itemVariants} id="auth" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Key} color="text-amber-500">
            Autenticação
          </SectionTitle>

          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Toda requisição usa Bearer Token. Inclua o header{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-violet-500">
                Authorization
              </code>{" "}
              com a chave de API que você gerou. Não há sessão; cada chamada é autenticada de forma independente.
            </p>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Exemplo: primeira chamada de leitura autenticada
              </h4>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                A chamada abaixo já está autenticada. Use a tool <code className="font-mono">estoque_saldo_produto</code> para validar suas credenciais sem mexer em dado nenhum.
              </p>
              <CodeBlock code={authExample} />
            </div>

            <Warning>
              <p>
                <span className="font-medium">Mantenha a chave em segredo.</span> Nunca em código de cliente, repositório público ou log. Se uma chave for comprometida, revogue na hora pelo painel e gere uma nova.
              </p>
            </Warning>
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Headers obrigatórios — modo externo */}
        <motion.div variants={itemVariants} id="headers" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Hash} color="text-violet-500">
            Headers obrigatórios
          </SectionTitle>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Header</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Quando</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-mono">Authorization</td>
                  <td className="px-4 py-2.5">sempre</td>
                  <td className="px-4 py-2.5 font-mono">Bearer mcp_live_...</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-mono">Content-Type</td>
                  <td className="px-4 py-2.5">sempre</td>
                  <td className="px-4 py-2.5 font-mono">application/json</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono">Idempotency-Key</td>
                  <td className="px-4 py-2.5">só em escrita</td>
                  <td className="px-4 py-2.5 font-mono">UUID v4 único por operação</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Como gerar o Idempotency-Key</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Uma chave UUID v4 nova por operação de escrita. Reenviar com a mesma chave devolve o resultado original sem duplicar (idempotência implementada em mcp/middleware/idempotency.ts).
            </p>
            <CodeBlock
              code={{
                curl: `IDEM=$(uuidgen)
curl -X POST "${base}" \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEM" \\
  -d '{...}'`,
                javascript: `const idem = crypto.randomUUID();
await fetch("${base}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer mcp_live_SEU_TOKEN",
    "Content-Type": "application/json",
    "Idempotency-Key": idem,
  },
  body: JSON.stringify({ /* ... */ }),
});`,
                python: `import uuid, requests

idem = str(uuid.uuid4())
requests.post(
    "${base}",
    headers={
        "Authorization": "Bearer mcp_live_SEU_TOKEN",
        "Content-Type": "application/json",
        "Idempotency-Key": idem,
    },
    json={ },
)`,
              }}
            />
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Fluxo de chamada — modo externo */}
        <motion.div variants={itemVariants} id="flow" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Zap} color="text-violet-500">
            Fluxo de chamada
          </SectionTitle>
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 text-xs leading-relaxed text-muted-foreground font-mono">
{`seu sistema  ──POST /api/mcp──▶  servidor MCP  ──SELECT──▶  Postgres (cache)
                                       │
                                       └── auditoria ──▶  McpAuditLog`}
          </pre>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Leitura responde do cache Postgres interno, atualizado pelo worker em duas frentes: incremental a cada 3 minutos e snapshot/reconcile a cada 24 horas. Cada resposta de leitura inclui o <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">lastSyncAt</code> da tabela base. Escrita vai ao Odoo, com sincronização direcionada da linha afetada para o cache em até 2 segundos.
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Tools de leitura — modo externo */}
        <motion.div variants={itemVariants} id="tools-leitura" className="space-y-5 scroll-mt-24">
          <div data-tour="mcp-docs-tools-head" className="space-y-2 scroll-mt-24">
            <SectionTitle icon={Layers} color="text-emerald-500">
              Tools de leitura
            </SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Consultas que não modificam dados. Não exigem Idempotency-Key. Agrupadas por módulo.
            </p>
          </div>
          {catalog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                O catálogo de tools não pôde ser carregado.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {catalog.map((mod) => {
                if (mod.readTools.length === 0) return null;
                return (
                  <div key={`r-${mod.module}`} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {moduleLabel(mod.module)}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {mod.readTools.length} {mod.readTools.length === 1 ? "tool" : "tools"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {mod.readTools.map((tool) => (
                        <ToolCard
                          key={tool.id}
                          tool={tool}
                          base={base}
                          isFirst={tool.id === firstToolId}
                          forceOpen={tool.id === firstToolId && docsToolStepActive}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <div className="h-px bg-border" />

        {/* Tools de escrita — modo externo */}
        <motion.div variants={itemVariants} id="tools-escrita" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={ShieldCheck} color="text-violet-500">
            Tools de escrita
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Mutações no Odoo. Exigem o header <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Idempotency-Key</code> e capability marcada na chave. Só executáveis pelo modo externo. Ver <a href="#restricao-escrita" className="text-violet-600 dark:text-violet-400 hover:underline">Restrição de escrita</a> para o motivo.
          </p>
          {catalog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                O catálogo de tools não pôde ser carregado.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {catalog.map((mod) => {
                if (mod.writeTools.length === 0) return null;
                return (
                  <div key={`w-${mod.module}`} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {moduleLabel(mod.module)}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {mod.writeTools.length} {mod.writeTools.length === 1 ? "tool" : "tools"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {mod.writeTools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} base={base} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <div className="h-px bg-border" />

        {/* Modo interno — quando usar */}
        <motion.div variants={itemVariants} id="quando-usar" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Clock} color="text-amber-500">
            Quando usar o modo interno
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Modo interno é só para código nosso, server-side: worker de sincronização, Agente Nex in-app, scripts internos. Cliente nunca recebe <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">MCP_SERVICE_TOKEN</code>. Se você está integrando uma plataforma externa (n8n, scripts de terceiros, automações em outro app), use o <a href="#auth" className="text-violet-600 dark:text-violet-400 hover:underline">modo externo</a> com Bearer mcp_live_*.
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Modo interno — service token + identidade */}
        <motion.div variants={itemVariants} id="service-token" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Key} color="text-amber-500">
            Service token e identidade
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O modo interno usa dois headers obrigatórios em cada requisição. Não há sessão.
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Header</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-mono">Authorization</td>
                  <td className="px-4 py-2.5 font-mono">{"Bearer ${MCP_SERVICE_TOKEN}"}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono">X-Mcp-User-Id</td>
                  <td className="px-4 py-2.5">ID do usuário da plataforma cuja identidade efetua a chamada</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A comparação do service token é constant-time (<code className="font-mono">timingSafeEqual</code>) contra a env var <code className="font-mono">MCP_SERVICE_TOKEN</code>, definida no <code className="font-mono">.env.local</code> ou <code className="font-mono">.env.production</code> do servidor. Sem <code className="font-mono">X-Mcp-User-Id</code> ou com usuário inexistente, o servidor responde 401.
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Modo interno — restrição de escrita */}
        <motion.div variants={itemVariants} id="restricao-escrita" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={ShieldCheck} color="text-amber-500">
            Restrição de escrita
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O dispatcher do modo interno bloqueia qualquer tool com <code className="font-mono">operation: &quot;write&quot;</code>, retornando 403 <code className="font-mono">forbidden_via_internal_auth</code> antes de chegar no Odoo. É defesa por rota de autenticação, não por prompt: o Agente Nex pode até listar tools de escrita no <code className="font-mono">tools/list</code>, mas não consegue executá-las nesse modo. Quem escreve no Odoo é sempre uma chave do modo externo, com capability marcada.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Implementado em <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">mcp/dispatcher/check-mode.ts</code>.
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Modo interno — exemplo Agente Nex */}
        <motion.div variants={itemVariants} id="exemplo-agente-nex" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Terminal} color="text-violet-500">
            Exemplo: Agente Nex
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Snippet de chamada server-side dentro do app Next.js, lendo o token do env e resolvendo o usuário da sessão da plataforma.
          </p>
          <CodeBlock
            code={{
              javascript: `// Server-side, dentro do app Next.js
const userId = await resolveUserIdFromSession();
const res = await fetch(process.env.MCP_INTERNAL_URL!, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.MCP_SERVICE_TOKEN}\`,
    "X-Mcp-User-Id": userId,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "cadastro_contar_parceiros", arguments: {} },
  }),
});
const data = await res.json();`,
            }}
          />
        </motion.div>

        <div id="docs-footer" className="pt-4 border-t border-border">
          <p className="text-center text-xs text-muted-foreground">
            Servidor MCP do Nexus Odoo. Transporte Streamable HTTP, autenticação por chave de API.
          </p>
        </div>

        {/* Espaçador dinâmico: permite a última seção alcançar o topo, sem rolagem extra. */}
        <div aria-hidden style={{ height: spacerHeight }} />
      </motion.div>
    </div>
  );
}
