---
agent: claude-kb-upload-polish
started_at: 2026-05-24T19:50-03:00
branch: feat/f4-leitura-expansao
target_phase: KB upload — robustez 4 (fixes pos-uso + URL multi)
status: in_progress
---

## Tópico
1. **Bug crítico**: `precountKbCharsAction` rejeita arquivo de poucos MB com
   "Arquivo excede 10 MB". Causa raiz: Next.js limita Server Actions a 1MB
   de body por padrão. Fix em `next.config.ts` com
   `experimental.serverActions.bodySizeLimit = "12mb"`.
2. Duplicidade na KB: **bloquear na seleção** (não adicionar à lista),
   mostrar aviso amarelo "X já está na base." (mesmo formato do "já está
   nesta seleção"). Atualizar `addFiles` em `kb-upload-dialog.tsx`.
3. Remover o ponto separador `·` no breakdown da barra de orçamento.
4. File picker: se a seleção for maior que `remainingSlots`, **não adicionar
   nenhum** e mostrar erro pedindo seleção compatível.
5. Modal mais alto para caber 5 arquivos sem scroll. `min-h-[520px]` +
   `max-h-[380px]` na lista.
6. URL multi (até 5 por upload): refator do `KbUrlForm` para lista com
   trava de duplicidade na KB e na lista, contagem real de chars via
   nova Server Action `precountKbUrlCharsAction` (fetch + strip HTML),
   ingestão sequencial. Igualar visual aos arquivos.

## Arquivos que vou tocar
- `next.config.ts` (bodySizeLimit) — compartilhado, baixo risco.
- `src/components/agent/kb-upload-dialog.tsx`
- `src/components/agent/kb-url-form.tsx` (refator para lista)
- `src/lib/actions/kb.ts` (nova action `precountKbUrlCharsAction` + reforço duplicidade)

## Sem conflito com outros agentes
`claude-nex-renaissance` em outros arquivos. Pull antes de commit garante sync.

## Bloqueios
Nenhum.
