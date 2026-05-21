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
import type { CatalogByModule, CatalogToolItem } from "@/lib/actions/mcp-catalog-schema";

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

function buildExamples(base: string, toolName: string, args: Record<string, unknown>): Record<Language, string> {
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
  return {
    curl: `curl -X POST "${base}" \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`,
    javascript: `const res = await fetch("${base}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer mcp_live_SEU_TOKEN",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${body})
});
const data = await res.json();`,
    python: `import requests

res = requests.post(
    "${base}",
    headers={
        "Authorization": "Bearer mcp_live_SEU_TOKEN",
        "Content-Type": "application/json"
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

function ToolCard({ tool, base }: { tool: CatalogToolItem; base: string }) {
  const [open, setOpen] = useState(false);
  const isWrite = tool.operation === "write";
  const kindClass = isWrite
    ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  const catalogExamples = toolExamplesRecord(tool);
  const sampleArgs: Record<string, unknown> = {};
  for (const k of tool.inputSchemaKeys.slice(0, 3)) sampleArgs[k] = "...";
  const fallbackExamples = buildExamples(base, tool.id, sampleArgs);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-foreground/20">
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

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {tool.capability && (
                  <span>
                    Capability:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                      {tool.capability}
                    </code>
                  </span>
                )}
                {tool.addedInVersion && <span>Disponível desde a v{tool.addedInVersion}</span>}
              </div>

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

const sections = [
  { id: "intro", label: "Início", icon: BookOpen },
  { id: "auth", label: "Autenticação", icon: Key },
  { id: "concepts", label: "Conceitos", icon: ListTree },
  { id: "flow", label: "Fluxo de uma chamada", icon: Zap },
  { id: "tools", label: "Tools", icon: Layers },
  { id: "errors", label: "Códigos de erro", icon: AlertTriangle },
  { id: "rate-limits", label: "Rate limits", icon: Gauge },
];

const concepts = [
  {
    title: "Capabilities",
    icon: <Layers className="h-4 w-4 text-violet-500" />,
    content:
      "Cada chave de API declara o que pode fazer em cada módulo de negócio: somente leitura, ou leitura e escrita com ações específicas. O catálogo de tools que a chave enxerga já vem filtrado por essas capabilities.",
  },
  {
    title: "Idempotência",
    icon: <Repeat className="h-4 w-4 text-emerald-500" />,
    content:
      "Operações de escrita exigem o header Idempotency-Key. Reenviar a mesma requisição devolve o resultado original sem reexecutar a operação. O registro de idempotência expira em 24 horas.",
  },
  {
    title: "External ID",
    icon: <Hash className="h-4 w-4 text-sky-500" />,
    content:
      "Registros do Odoo podem ser referenciados por um identificador textual (xmlid) no formato modulo.referencia, sem precisar conhecer o ID interno. Útil para integrar vários sistemas que apontam para o mesmo registro.",
  },
  {
    title: "RBAC em 7 camadas",
    icon: <ShieldCheck className="h-4 w-4 text-amber-500" />,
    content:
      "RBAC (controle de acesso por função) em 7 camadas estruturais, que não dependem de prompt: catálogo filtrado, validação no handler, escopo de tenant injetado, papel do Postgres com permissões mínimas, isolamento por linha (RLS) opcional, validação de schema (Zod) e auditoria com limite de uso.",
  },
  {
    title: "Cache e frescor do dado",
    icon: <Clock className="h-4 w-4 text-violet-500" />,
    content:
      "As tools de leitura respondem a partir do cache Postgres interno, alimentado por sincronização periódica do Odoo. Cada resposta informa há quanto tempo o dado foi atualizado.",
  },
];

const errorCodes = [
  {
    code: "unauthorized",
    http: 401,
    description: "Token ausente, inválido, expirado ou revogado.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "capability_missing",
    http: 403,
    description: "Token válido, mas sem capability para a tool solicitada.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "idempotency_key_required",
    http: 400,
    description: "Write tool invocada sem o header Idempotency-Key.",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    code: "idempotency_conflict",
    http: 409,
    description: "Mesma Idempotency-Key usada para um payload diferente.",
    color: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    code: "validation_error",
    http: 422,
    description: "Argumentos da tool reprovados pela validação de schema.",
    color: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    code: "rate_limit_exceeded",
    http: 429,
    description: "Limite de chamadas por minuto da chave atingido.",
    color: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    code: "internal_error",
    http: 500,
    description: "Erro interno do servidor. Tente novamente ou contate o suporte.",
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
  return (
    <nav className="space-y-0.5">
      {sections.map((s) => {
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
  const [activeSection, setActiveSection] = useState("intro");
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
    // Sem espaço morto de rolagem após a última seção, ela nunca cruza a faixa
    // do observer; ao chegar ao fim do scroll, marcamos a última seção ativa.
    const scrollEl = document.querySelector("main");
    function onScroll() {
      if (!scrollEl) return;
      const atBottom =
        scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
      if (atBottom) setActiveSection(sections[sections.length - 1].id);
    }
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observerRef.current?.disconnect();
      scrollEl?.removeEventListener("scroll", onScroll);
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
        className="min-w-0 flex-1 space-y-12 pb-16"
      >
        {/* Hero */}
        <motion.div variants={itemVariants} id="intro" className="space-y-6 scroll-mt-24">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Servidor MCP, Documentação
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Endpoint semântico para agentes de IA, com {totalTools} tools de leitura e escrita
              sobre os dados do Odoo
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
            O servidor MCP expõe os dados do Odoo para agentes de IA e integrações externas por
            ferramentas semânticas, não por SQL livre. Cada tool tem um contrato validado e
            auditado. As leituras respondem a partir do cache interno, e as escritas vão ao Odoo
            de forma controlada, gated por capability da chave de API.
          </p>

          {/* Passo a passo de uso */}
          <div
            data-tour="mcp-docs-passos"
            className="rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-foreground">Como começar, em 4 passos</h3>
            <ol className="space-y-1.5">
              {[
                {
                  n: 1,
                  t: "Gere uma chave de API",
                  d: "Em Chaves de Acesso, crie uma chave com as capabilities que a integração precisa.",
                  href: "/integracoes/servidor-mcp/chaves",
                },
                {
                  n: 2,
                  t: "Autentique cada chamada",
                  d: "Envie a chave no header Authorization: Bearer. Não há sessão, cada chamada é independente.",
                  section: "auth",
                },
                {
                  n: 3,
                  t: "Escolha a tool certa",
                  d: "O catálogo lista todas as tools por módulo, com os argumentos de cada uma.",
                  section: "tools",
                },
                {
                  n: 4,
                  t: "Copie um exemplo pronto",
                  d: "Cada tool traz exemplos em curl, JSON-RPC e n8n para você adaptar.",
                  section: "tools",
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

        {/* Autenticação */}
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
              com a chave de API. Não há sessão, cada chamada é autenticada de forma independente.
            </p>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Como gerar a chave
              </h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>
                  Abra{" "}
                  <span className="text-foreground font-medium">
                    Integrações, Servidor MCP, Chaves de Acesso
                  </span>
                </li>
                <li>
                  Clique em <span className="text-foreground font-medium">Nova chave</span> e
                  defina rótulo, capabilities e rate limit
                </li>
                <li>Copie o token gerado, ele aparece uma única vez</li>
                <li>
                  Envie o token no header{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-violet-500">
                    Authorization: Bearer mcp_live_...
                  </code>
                </li>
              </ol>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Exemplo de chamada
              </h4>
              <CodeBlock code={authExample} />
            </div>

            <Warning>
              <p>
                <span className="font-medium">Mantenha a chave em segredo.</span> Nunca a exponha
                em código de cliente, repositórios públicos ou logs. Se uma chave for
                comprometida, revogue na hora pelo painel e gere uma nova.
              </p>
            </Warning>
          </div>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Conceitos */}
        <motion.div variants={itemVariants} id="concepts" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={ListTree} color="text-violet-500">
            Conceitos
          </SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cinco ideias que valem entender antes de integrar.
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

        {/* Fluxo de uma chamada */}
        <motion.div variants={itemVariants} id="flow" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={Zap} color="text-violet-500">
            Fluxo de uma chamada
          </SectionTitle>
          <div className="rounded-xl border border-border bg-card p-6">
            <ol className="space-y-4">
              {[
                {
                  t: "Autenticação",
                  d: "O servidor valida o Bearer token e carrega as capabilities da chave.",
                },
                {
                  t: "Catálogo filtrado",
                  d: "A chave só enxerga as tools que suas capabilities permitem.",
                },
                {
                  t: "Validação",
                  d: "Os argumentos da tool passam por validação de schema antes de executar.",
                },
                {
                  t: "Execução",
                  d: "Leitura responde do cache Postgres. Escrita vai ao Odoo, com idempotência.",
                },
                {
                  t: "Auditoria",
                  d: "A chamada é registrada nos logs com duração, status e capability usada.",
                },
              ].map((step, i) => (
                <li key={step.t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-500">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.t}</p>
                    <p className="text-[13px] text-muted-foreground">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Tip>
            Para operações de escrita, envie sempre o header{" "}
            <code className="rounded bg-amber-500/10 px-1 font-mono">Idempotency-Key</code> com um
            UUID v4 único por operação. Reenvios devolvem o mesmo resultado, sem duplicar.
          </Tip>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Tools */}
        <motion.div
          variants={itemVariants}
          id="tools"
          className="space-y-5 scroll-mt-24"
        >
          <div data-tour="mcp-docs-tools-head" className="space-y-2 scroll-mt-24">
            <SectionTitle icon={Layers} color="text-violet-500">
              Tools
            </SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Todas as tools disponíveis, agrupadas por módulo. Leitura em verde, escrita em
              violeta. Abra qualquer tool para ver os argumentos e exemplos prontos.
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
                const tools = [...mod.readTools, ...mod.writeTools];
                if (tools.length === 0) return null;
                return (
                  <div key={mod.module} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {moduleLabel(mod.module)}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {mod.readTools.length} de leitura, {mod.writeTools.length} de escrita
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {tools.map((tool) => (
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

        {/* Códigos de erro */}
        <motion.div variants={itemVariants} id="errors" className="space-y-5 scroll-mt-24">
          <SectionTitle icon={AlertTriangle} color="text-red-500">
            Códigos de erro
          </SectionTitle>
          <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Código
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">HTTP</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Quando acontece
                  </th>
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
              Cada chave tem um limite independente de chamadas por minuto, definido ao criar ou
              editar a chave. O mínimo é 1, o máximo é 600, e o padrão é 60 chamadas por minuto.
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
              O campo <code className="rounded bg-amber-500/10 px-1 font-mono">retryAfterMs</code>{" "}
              diz quantos milissegundos aguardar antes de tentar de novo. Use backoff exponencial
              com jitter nas automações.
            </Tip>
          </div>
        </motion.div>

        <div className="pt-4 border-t border-border">
          <p className="text-center text-xs text-muted-foreground">
            Servidor MCP do Nexus Odoo. Transporte Streamable HTTP, autenticação por chave de API.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
