-- Onda 1 da modernizacao dos adapters de LLM.
-- Adiciona coluna para registrar tokens de raciocinio internos por chamada.
-- Subset conceitual de tokens_output (provider ja inclui no faturamento);
-- gravamos separado para auditoria. Anthropic nao expoe (fica NULL).

ALTER TABLE "llm_usage"
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" INTEGER;
