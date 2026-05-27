-- Registra contagem e nomes das tools chamadas por iteracao no LlmUsage.
-- Permite ao drill-down do /agente/consumo mostrar o badge "Tools · N"
-- com os nomes das tools que a chamada acionou. NULL/array vazio em
-- linhas antigas e iteracoes que nao chamaram nenhuma tool (resposta
-- final direta sem tool call).

ALTER TABLE "llm_usage"
  ADD COLUMN IF NOT EXISTS "tool_calls_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "tool_names" TEXT[];
