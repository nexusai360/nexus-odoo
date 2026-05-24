---
agent: claude-kb-upload-polish
started_at: 2026-05-24T18:30-03:00
branch: feat/f4-leitura-expansao
target_phase: Robustez do upload de KB (multi-formato, limites, feedback visual)
status: in_progress
---

## Tópico
Onda de robustez no modal "Adicionar conhecimento" após uso real do usuário:

1. **Auditoria real de extração** por formato (PDF, DOCX, XLSX, YAML, MD, TXT, CSV, XML, +JSON novo). Garantir que o `extractedText` tem conteúdo de fato; sem "fake/placeholder".
2. **JSON** como novo formato aceito (texto cru, com try-parse para validar e pretty-print quando válido).
3. **Limite de 10 arquivos** por upload (bloqueio no `addFiles`).
4. **MAX_KB_TOTAL_CHARS sobe de 50_000 para 500_000** — limite real do prompt do agente.
5. **Pré-validação do total de chars no modal**, ANTES do salvar:
   - O usuário precisa ver, ainda no modal, se a soma `KB atual + arquivos selecionados` estoura o limite.
   - Arquivos que estouram ficam marcados em **vermelho** com mensagem; o botão Salvar bloqueia até o usuário remover.
6. **Estado pós-upload no modal** (não fecha auto se houver falha):
   - Cada arquivo no modal tem estado `idle | uploading | success | error`.
   - `success` → linha verde com check.
   - `error` → linha vermelha com mensagem específica.
   - Modal só fecha quando 100% deu success (ou usuário clica Cancelar/X).
   - Arquivo já enviado com sucesso é **removido da lista** ao tentar salvar de novo (não duplica).
7. **Indicador "mais abaixo"** quando a lista de arquivos passa da viewport interna do modal: setinha + microcopy "X arquivos abaixo", some quando o último arquivo entra parcialmente em viewport.
8. **Nome de arquivo longo** quebra em até 2 linhas, com truncamento+reticências se ainda for grande demais. Sem quebrar layout do modal.

## Arquivos que vou tocar
- `src/components/agent/kb-upload-dialog.tsx` (UI grande)
- `src/components/agent/kb-section.tsx` (rever microcopy de truncamento + cap novo)
- `src/lib/agent/rag/kb-kinds.ts` (+ JSON)
- `src/lib/agent/rag/extract.ts` (+ JSON, auditoria de cada extractor)
- `src/lib/actions/kb.ts` (mensagem de erro, cap)
- `src/lib/agent/prompt/identity-base.ts` ou `kb-budget.ts` (MAX_KB_TOTAL_CHARS)
- `prisma/migrations/.../migration.sql` (adicionar JSON ao enum KbKind)
- Testes: pelo menos 1 jest por extractor novo + cap

## Arquivos compartilhados que VOU modificar
- `prisma/schema.prisma` (enum KbKind ganha JSON)
- `package.json` — sem novas libs nesta rodada (JSON é nativo)

## Sem conflito com claude-nex-renaissance
Ele está em `chat-panel.tsx`, `agent-bubble.tsx`, `format/by-channel.ts`,
`personalized-suggestions/`. Áreas disjuntas das minhas.

## Bloqueios
Nenhum.
