---
agent: claude-kb-upload-polish
started_at: 2026-05-24T19:25-03:00
branch: feat/f4-leitura-expansao
target_phase: KB upload — robustez 2 (pre-processamento real, layout, travas)
status: in_progress
---

## Tópico
Rodada 3 do upload de KB. Mudanças solicitadas:

- Limites: KB total = **1.000.000 chars**, máximo de arquivos por upload = **5**, tamanho máximo por arquivo = **10 MB**. Texto do prompt (identityBase) **independente da KB**, com cap próprio de **100.000 chars**.
- **Pré-processamento real** de cada arquivo no client (ou via Server Action para binários): extrai texto e conta chars de verdade antes de aceitar. Estado novo `processing` (cinza, sutil) com microcopy "Processando…". Após terminar: violeta (ok) ou vermelho (excede).
- **Trava de duplicidade na KB** (mesmo nome de arquivo já gravado) com aviso pré-save.
- **Trava de duplicidade no modal** (já estava silenciosa) com aviso explícito.
- **Trava no file picker** para limitar seleção ao espaço restante (5 − atuais).
- **Timer de mensagens** baixa de 10s → **5s**.
- **Indicador "mais arquivos abaixo"** integrado ao container da lista, não flutuando.
- **Barra de orçamento** mostra `KB atual + selecionados / total` (1.000.000) sem confundir.
- **Microcopy de erro** em **1 linha**.
- **Microcopy do dropzone** lista XLSX e DOCX explicitamente.

## Arquivos que vou tocar
- `src/components/agent/kb-upload-dialog.tsx` (refator de estado + layout)
- `src/components/agent/kb-section.tsx` (cap 1M + mostrar usado)
- `src/components/agent/identity-base-editor.tsx` (cap 100k)
- `src/components/agent/playground-session-prompt.tsx` (MAX_IDENTITY 100k)
- `src/lib/agent/rag/kb-kinds.ts` (MAX_FILES_PER_UPLOAD = 5)
- `src/lib/agent/prompt/compose.ts` (MAX_PROMPT_LEN = 100k, MAX_KB_TOTAL_CHARS = 1M)
- `src/lib/agent/rag/search.ts` (FALLBACK_MAX_CHARS 1M)
- `src/lib/actions/kb.ts` (action `precountKbCharsAction` nova, action `listKbDocumentNamesAction` nova, MAX 10MB)
- `prisma/migrations/.../migration.sql` — não muda nesta rodada.

## Sem conflito com outros agentes
`claude-nex-renaissance` está em `chat-panel.tsx`, `agent-bubble.tsx`,
`format/by-channel.ts`. Áreas disjuntas.

## Bloqueios
Nenhum.
