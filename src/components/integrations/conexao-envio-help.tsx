"use client";

/**
 * Guia "Payload que enviamos" da etapa de ENVIO da Conexão com WhatsApp.
 *
 * Mesma estrutura do guia de recebimento (blocos com dropdown próprio), mas
 * **sem numeração de passo**: aqui não há sequência a executar, só a descrição
 * do que a plataforma entrega. Blocos: Headers, Body e Exemplos.
 *
 * Tudo nasce fechado; o usuário abre o que quiser.
 */

import * as React from "react";
import { ChevronDown, KeyRound, Repeat, Table2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeBlock, Step, type CodeLine } from "@/components/integrations/whatsapp-inbound-help";

const HEADERS_EXEMPLO: CodeLine[] = [
  { text: "Content-Type: application/json" },
  { text: "X-Timestamp: 1752090000000" },
  { text: "X-Signature: a3f1c9... (HMAC SHA-256 em hex)" },
];

/** Campos do envelope, na ordem em que aparecem no corpo. */
interface CampoEnvelope {
  campo: string;
  sempre: boolean;
  nota: string;
}

const CAMPOS: CampoEnvelope[] = [
  { campo: "event", sempre: true, nota: 'Sempre "agent.reply"' },
  {
    campo: "deliveryId",
    sempre: true,
    nota: "Muda a cada tentativa de entrega (não use para deduplicar)",
  },
  { campo: "kind", sempre: true, nota: '"final" (resposta do agente) ou "blocked" (barreira)' },
  { campo: "timestamp", sempre: true, nota: "Data/hora do disparo, em milissegundos" },
  { campo: "connection.name", sempre: false, nota: "Nome desta conexão" },
  {
    campo: "connection.businessId",
    sempre: false,
    nota: "Número da empresa que recebeu a mensagem",
  },
  {
    campo: "message.inboundMessageId",
    sempre: true,
    nota: "Identificador da mensagem original (use para deduplicar)",
  },
  { campo: "message.to", sempre: true, nota: "Número de quem escreveu, para onde vai a resposta" },
  { campo: "message.type", sempre: true, nota: "Tipo da mensagem recebida (text, audio, image...)" },
  {
    campo: "session.conversationId",
    sempre: false,
    nota: "Conversa do agente; nulo quando barrado antes da sessão",
  },
  {
    campo: "session.assistantMessageId",
    sempre: false,
    nota: "Mensagem do assistente que gerou a resposta",
  },
  { campo: "result.ok", sempre: true, nota: "false nas barreiras e em falha técnica" },
  {
    campo: "result.reason",
    sempre: false,
    nota: "Motivo do bloqueio (user_not_found, daily_limit_exceeded...)",
  },
  { campo: "result.reply", sempre: true, nota: "Texto pronto para enviar ao usuário, já formatado" },
  { campo: "result.suggestions", sempre: true, nota: "Perguntas sugeridas; vazio quando ok é false" },
  {
    campo: "result.deniedModule",
    sempre: false,
    nota: "Só em permission_denied: módulo que o usuário não acessa",
  },
  {
    campo: "result.allowedModules",
    sempre: false,
    nota: "Só em permission_denied: módulos que ele acessa",
  },
  { campo: "diagnostics.tools", sempre: true, nota: "Ferramentas que o agente usou no turno" },
  { campo: "diagnostics.reasoningMs", sempre: true, nota: "Tempo de raciocínio, em milissegundos" },
  {
    campo: "diagnostics.model",
    sempre: false,
    nota: "Modelo que produziu a resposta; nulo em bloqueio",
  },
  { campo: "diagnostics.usage", sempre: true, nota: "Tokens de entrada/saída e custo do turno" },
];

const EXEMPLO_FINAL: CodeLine[] = [
  { text: "{" },
  { text: '  "event": "agent.reply",' },
  { text: '  "deliveryId": "0f2b...c91",' },
  { text: '  "kind": "final",' },
  { text: '  "timestamp": 1752090000000,' },
  { text: '  "connection": {' },
  { text: '    "name": "WhatsApp da loja matriz",' },
  { text: '    "businessId": "5561995630029"' },
  { text: "  }," },
  { text: '  "message": {' },
  { text: '    "inboundMessageId": "wamid.HBgM...",' },
  { text: '    "to": "5534991908624",' },
  { text: '    "type": "text"' },
  { text: "  }," },
  { text: '  "session": {' },
  { text: '    "conversationId": "c1f0...",' },
  { text: '    "assistantMessageId": "m9a2..."' },
  { text: "  }," },
  { text: '  "result": {' },
  { text: '    "ok": true,' },
  { text: '    "reason": null,' },
  { text: '    "reply": "O faturamento deste mes foi R$ 1.240.000,00",' },
  { text: '    "suggestions": ["E o mes passado?"],' },
  { text: '    "deniedModule": null,' },
  { text: '    "allowedModules": []' },
  { text: "  }," },
  { text: '  "diagnostics": {' },
  { text: '    "tools": ["faturamento_periodo"],' },
  { text: '    "reasoningMs": 4200,' },
  { text: '    "model": "gpt-5-mini",' },
  { text: '    "usage": { "tokensInput": 1200, "tokensOutput": 340, "costUsd": 0.0021 }' },
  { text: "  }" },
  { text: "}" },
];

const EXEMPLO_BLOCKED: CodeLine[] = [
  { text: "{" },
  { text: '  "event": "agent.reply",' },
  { text: '  "deliveryId": "7a10...4de",' },
  { text: '  "kind": "blocked",' },
  { text: '  "timestamp": 1752090000000,' },
  { text: '  "connection": {' },
  { text: '    "name": "WhatsApp da loja matriz",' },
  { text: '    "businessId": "5561995630029"' },
  { text: "  }," },
  { text: '  "message": {' },
  { text: '    "inboundMessageId": "wamid.HBgM...",' },
  { text: '    "to": "5534991908624",' },
  { text: '    "type": "text"' },
  { text: "  }," },
  { text: '  "session": { "conversationId": null, "assistantMessageId": null },' },
  { text: '  "result": {' },
  { text: '    "ok": false,' },
  { text: '    "reason": "user_not_found",' },
  { text: '    "reply": "Nao encontrei seu numero na plataforma...",' },
  { text: '    "suggestions": [],' },
  { text: '    "deniedModule": null,' },
  { text: '    "allowedModules": []' },
  { text: "  }," },
  { text: '  "diagnostics": {' },
  { text: '    "tools": [],' },
  { text: '    "reasoningMs": 0,' },
  { text: '    "model": null,' },
  { text: '    "usage": { "tokensInput": 0, "tokensOutput": 0, "costUsd": 0 }' },
  { text: "  }" },
  { text: "}" },
];

function PresencaBadge({ sempre }: { sempre: boolean }) {
  return sempre ? (
    <span className="text-emerald-600 dark:text-emerald-400">Sempre</span>
  ) : (
    <span className="text-muted-foreground/70">Pode ser nulo</span>
  );
}

export function ConexaoEnvioHelp({
  defaultOpen = false,
  destaque = false,
}: {
  defaultOpen?: boolean;
  /** Contorno sutil para o guia se destacar sem competir com o token. */
  destaque?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/20 transition-colors",
        destaque ? "border-primary/30 bg-primary/[0.03] hover:border-primary/50" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Payload que enviamos</span>
          <span className="block text-xs text-muted-foreground">
            Headers, corpo do POST e exemplos completos.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border/60 p-3">
          <Step icon={KeyRound} title="Headers" defaultOpen={false}>
            <p className="text-xs text-muted-foreground">
              Cada entrega é um <span className="font-medium text-foreground">POST</span> assinado.
              Recalcule o HMAC SHA-256 do corpo com o{" "}
              <span className="font-medium text-foreground">token de assinatura</span> desta conexão
              e compare com o{" "}
              <code className="rounded bg-muted px-1 font-mono text-foreground">X-Signature</code>.
            </p>
            <CodeBlock label="Headers de cada entrega" lines={HEADERS_EXEMPLO} />
          </Step>

          <Step icon={Table2} title="Body" defaultOpen={false}>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Campo</th>
                    <th className="w-32 px-3 py-2 font-medium">Presença</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {CAMPOS.map((c) => (
                    <tr
                      key={c.campo}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-1.5 font-mono text-foreground">{c.campo}</td>
                      <td className="px-3 py-1.5">
                        <PresencaBadge sempre={c.sempre} />
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Deduplicação: informação de apoio, em tom NEUTRO , não compete com
                o bloco do token, que é o único elemento que pede atenção. */}
            <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-2.5 dark:bg-muted/20">
              <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Deduplicação:</span> uma entrega que
                falha é tentada de novo, com um{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">deliveryId</code>{" "}
                diferente. Para não processar a mesma resposta duas vezes, guarde os{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">
                  message.inboundMessageId
                </code>{" "}
                já recebidos e ignore os repetidos.
              </p>
            </div>
          </Step>

          <Step icon={Terminal} title="Exemplos" defaultOpen={false}>
            <p className="text-xs text-muted-foreground">
              Os dois formatos que o seu destino recebe.
            </p>
            <CodeBlock label="Resposta do agente (kind: final)" lines={EXEMPLO_FINAL} />
            <CodeBlock
              label="Mensagem barrada (kind: blocked)"
              lines={EXEMPLO_BLOCKED}
              hint="Em blocked, result.reply já traz o texto pronto para entregar ao usuário."
            />
          </Step>
        </div>
      )}
    </div>
  );
}
