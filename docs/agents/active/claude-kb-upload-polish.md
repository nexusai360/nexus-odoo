---
agent: claude-kb-upload-polish
started_at: 2026-05-24T17:21-03:00
branch: feat/f4-leitura-expansao
target_phase: Polimento do modal "Adicionar conhecimento" da KB
status: in_progress
---

## Tópico
Refinos pontuais no upload de conhecimento solicitados pelo usuário:
- Tabs Arquivo/URL: voltar para tamanho compacto que tinha antes (height reduzido).
- Travar troca de aba quando há conteúdo em andamento (arquivos selecionados → bloqueia ir para URL; URL com texto → confirma antes de ir para arquivo). Diálogo de confirmação genérico.
- Mensagem de erro de validação some sozinha após 10s.
- Microcopy do DialogDescription enxuta (sem listar todos os formatos).
- Suporte a novos formatos: `.yaml/.yml`, `.xlsx/.xls`, `.docx/.doc`. Atualiza extractor + UI.
- "≤ 15 MB" vira "menor ou igual a 15 MB" em texto corrido.

## Arquivos que vou tocar
- `src/components/agent/kb-upload-dialog.tsx`
- `src/lib/agent/rag/kb-kinds.ts`
- `src/lib/agent/rag/extract.ts` (acrescentar extractors dos novos formatos)
- `src/lib/actions/kb.ts` (validação de tipo, se necessário)
- `package.json` (possíveis libs novas: `mammoth` para DOCX, `xlsx` para XLSX, `yaml` para YAML)

## Arquivos compartilhados que VOU modificar
- `package.json` (vou adicionar dependências; checar antes de bumpar)

## Sem conflito esperado com claude-nex-renaissance
O outro agente está em `chat-panel.tsx`, `agent-bubble.tsx`, `welcome-suggestions.ts`,
`agent-config.ts`, prisma migrations. Nenhuma sobreposição com o escopo deste
agente. Pulls antes de commit garantem sincronia.

## Bloqueios
Nenhum.
