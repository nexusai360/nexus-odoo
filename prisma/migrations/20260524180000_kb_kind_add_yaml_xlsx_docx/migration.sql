-- Adiciona YAML, XLSX e DOCX ao enum KbKind para a base de conhecimento do Agente Nex.
-- Postgres exige ALTER TYPE ... ADD VALUE em statements separados; cada um precisa
-- estar fora de bloco transacional, mas o Prisma já cuida disso na aplicação.

ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'YAML';
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'XLSX';
ALTER TYPE "KbKind" ADD VALUE IF NOT EXISTS 'DOCX';
