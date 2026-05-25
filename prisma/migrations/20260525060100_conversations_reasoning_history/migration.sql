-- Onda 1 da modernizacao dos adapters de LLM.
-- Persiste o historico de blocos opacos de raciocinio por conversa.
-- run-agent.ts faz append a cada iteracao com raciocinio; adapter (Anthropic,
-- Gemini, OpenRouter) injeta no proximo turno conforme o formato exigido pelo
-- provider. Capado em 20 iteracoes ou 50KB serialized antes de salvar.

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "reasoning_history" JSONB NOT NULL DEFAULT '[]'::jsonb;
