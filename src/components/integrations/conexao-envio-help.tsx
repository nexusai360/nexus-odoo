"use client";

/**
 * Guia "O que enviamos" da etapa de ENVIO da Conexão com WhatsApp (SPEC §3.7).
 *
 * Colapsado por padrão. Mostra os headers com que assinamos cada disparo e o
 * payload completo (formato da SPEC §3.10), e orienta, com todas as letras,
 * que a deduplicação deve usar `message.inboundMessageId` , o `deliveryId`
 * muda a cada tentativa de entrega.
 */

import * as React from "react";
import { AlertCircle, ChevronDown, FileJson, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CodeBlock,
  Step,
  type CodeLine,
} from "@/components/integrations/whatsapp-inbound-help";

const HEADERS_EXEMPLO: CodeLine[] = [
  { text: "Content-Type: application/json" },
  { text: "X-Timestamp: 1752090000000" },
  { text: "X-Signature: a3f1... (HMAC SHA-256 do corpo, com o token de assinatura)" },
];

const PAYLOAD_EXEMPLO: CodeLine[] = [
  { text: "{" },
  { text: '  "event": "agent.reply",' },
  { text: '  "deliveryId": "novo a cada tentativa (NÃO use para deduplicar)",' },
  { text: '  "kind": "final",                    // "final" ou "blocked"' },
  { text: '  "timestamp": 1752090000000,' },
  { text: '  "connection": {' },
  { text: '    "name": "Nome da conexão",' },
  { text: '    "businessId": "5561995630029"' },
  { text: "  }," },
  { text: '  "message": {' },
  { text: '    "inboundMessageId": "wamid.HBgM...",  // use ESTE campo para deduplicar' },
  { text: '    "to": "5534991908624",' },
  { text: '    "type": "text"' },
  { text: "  }," },
  { text: '  "session": {' },
  { text: '    "conversationId": "…",' },
  { text: '    "assistantMessageId": "…"' },
  { text: "  }," },
  { text: '  "result": {' },
  { text: '    "ok": true,' },
  { text: '    "reason": null,                   // em "blocked": user_not_found, daily_limit_exceeded, …' },
  { text: '    "reply": "texto pronto para o WhatsApp",' },
  { text: '    "suggestions": ["…"],' },
  { text: '    "deniedModule": null,' },
  { text: '    "allowedModules": []' },
  { text: "  }," },
  { text: '  "diagnostics": {' },
  { text: '    "tools": ["faturamento_periodo"],' },
  { text: '    "reasoningMs": 4200,' },
  { text: '    "model": "…",                     // null em bloqueio/erro' },
  { text: '    "usage": { "tokensInput": 1200, "tokensOutput": 340, "costUsd": 0.0021 }' },
  { text: "  }" },
  { text: "}" },
];

export function ConexaoEnvioHelp({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">O que enviamos</span>
          <span className="block text-xs text-muted-foreground">
            Headers, corpo do POST e como deduplicar as entregas.
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border/60 p-3">
          <Step icon={KeyRound} n={1} title="Headers">
            <p className="text-xs text-muted-foreground">
              Cada disparo é um <span className="font-medium text-foreground">POST</span> assinado.
              Valide a assinatura recalculando o HMAC SHA-256 do corpo com o{" "}
              <span className="font-medium text-foreground">token de assinatura</span> desta conexão.
            </p>
            <CodeBlock label="Headers de cada disparo" lines={HEADERS_EXEMPLO} />
          </Step>

          <Step icon={FileJson} n={2} title="Payload">
            <p className="text-xs text-muted-foreground">
              O corpo segue sempre este formato. Em <code className="rounded bg-muted px-1 font-mono text-foreground">kind: &quot;blocked&quot;</code>{" "}
              o <code className="rounded bg-muted px-1 font-mono text-foreground">result.reply</code> já traz a mensagem
              pronta para entregar ao usuário.
            </p>
            <CodeBlock label="Exemplo do payload" lines={PAYLOAD_EXEMPLO} />
          </Step>

          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Deduplicação:</span> use{" "}
              <code className="rounded bg-muted px-1 font-mono text-foreground">message.inboundMessageId</code>.
              O <code className="rounded bg-muted px-1 font-mono text-foreground">deliveryId</code> é gerado de novo a
              cada tentativa de entrega, então a mesma resposta pode chegar com{" "}
              <code className="rounded bg-muted px-1 font-mono text-foreground">deliveryId</code> diferente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
