/**
 * Logger de uso de LLM para o agente nexus-odoo.
 *
 * Portado de nexus-insights/src/lib/llm/agent/usage-logger.ts.
 * Adaptações (BUGs 1, 4, 5, 6, 7, 8 da SPEC §4.6):
 * - Usa Prisma v7 + model LlmUsage (não pgPool + ensure-tables).
 * - calculateCost retorna {costUsd, costKnown}: costUsd=null quando costKnown=false (BUG 1).
 * - getUsdBrlRate nunca retorna null , usa cache stale com rateStale=true (BUG 5).
 * - rateSpread é gravado junto com a cotação (BUG 6).
 * - costBrl calculado corretamente com spread já embutido na rate (BUG 4).
 * - Falhas são silenciosas , nunca bloqueiam o chat.
 */

import { prisma } from "@/lib/prisma";
import { calculateCost } from "./catalog";
import { getUsdBrlRate } from "./exchange-rate";
import { refreshCredentialBalance } from "./credentials";

export interface LogUsageArgs {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  /**
   * Tokens consumidos no raciocinio interno (subset de tokensOutput).
   * OpenAI/Gemini/OpenRouter expoem; Anthropic nao (deixe null). Onda 1 da
   * modernizacao dos adapters.
   */
  reasoningTokens?: number | null;
  conversationId?: string;
  userId?: string;
  durationMs?: number;
  errorMessage?: string;
  isPlayground?: boolean;
  promptChars?: number;
  responseChars?: number;
  /** Chave de API usada , atribui o consumo à chave e atualiza o saldo. */
  credentialId?: string;
  /** Tipo da requisição: texto | imagem | audio | arquivo (default: texto). */
  requestKind?: "texto" | "imagem" | "audio" | "arquivo";
}

/**
 * Registra uma chamada de LLM em `LlmUsage`.
 *
 * Falhas são engolidas silenciosamente , não devem bloquear o chat.
 * costUsd é null quando o preço do modelo não é conhecido (costKnown=false).
 * costBrl é null quando costUsd for null.
 * rateStale=true quando a cotação está obsoleta (cache de fallback).
 */
export async function logUsage(args: LogUsageArgs): Promise<void> {
  try {
    // Calcular custo , repassa durationMs para modelos cobrados por minuto (ex.: whisper-1)
    const { costUsd, costKnown } = calculateCost(
      args.model,
      args.tokensInput,
      args.tokensOutput,
      args.durationMs !== undefined ? { durationMs: args.durationMs } : undefined,
    );

    // Cotação cambial , nunca retorna null (usa cache stale em falha)
    let costBrl: number | null = null;
    let rateValue: number | null = null;
    let rateSpread: number | null = null;
    let rateStale = false;

    const rateResult = await getUsdBrlRate();
    rateValue = Number(rateResult.rate.toFixed(4));
    rateSpread = Number(rateResult.spread.toFixed(4));
    rateStale = rateResult.stale;

    // costBrl só calculado quando o custo é conhecido
    if (costKnown && costUsd !== null) {
      costBrl = Number((costUsd * rateResult.rate).toFixed(6));
    }

    await prisma.llmUsage.create({
      data: {
        provider: args.provider,
        model: args.model,
        tokensInput: args.tokensInput,
        tokensOutput: args.tokensOutput,
        reasoningTokens: args.reasoningTokens ?? null,
        costUsd: costKnown ? costUsd : null,
        costKnown,
        costBrl,
        usdToBrlRate: rateValue,
        rateSpread,
        rateStale,
        promptChars: args.promptChars ?? null,
        responseChars: args.responseChars ?? null,
        userId: args.userId ?? null,
        conversationId: args.conversationId ?? null,
        durationMs: args.durationMs ?? null,
        errorMessage: args.errorMessage ?? null,
        isPlayground: args.isPlayground ?? false,
        credentialId: args.credentialId ?? null,
        requestKind: args.requestKind ?? "texto",
      },
    });

    // Atualiza o saldo da conta do provedor após o uso (best-effort, sem
    // bloquear). Mantém o saldo exibido na tela Chaves de API em dia.
    if (args.credentialId) {
      void refreshCredentialBalance(args.credentialId).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[agent] Falha ao registrar uso em LlmUsage:", err);
  }
}
