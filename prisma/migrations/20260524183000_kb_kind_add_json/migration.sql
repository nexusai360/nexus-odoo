-- Adiciona JSON ao enum KbKind para a base de conhecimento do Agente Nex.
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'JSON';
