-- F5 UI Rework v2 — parte 1: novos valores de enum.
-- ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser usado,
-- por isso fica numa migration própria, separada do resto.

-- Novos tipos de documento da base de conhecimento.
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'MARKDOWN';
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'CSV';
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'XML';
