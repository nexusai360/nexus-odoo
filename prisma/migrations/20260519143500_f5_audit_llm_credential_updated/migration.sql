-- F5 UI rework v2: novo valor de AuditAction para edição de credencial LLM.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'llm_credential_updated';
