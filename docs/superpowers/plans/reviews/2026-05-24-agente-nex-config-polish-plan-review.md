# Review do PLAN v1 + ajustes para v3 final

## Achados materiais

- PR1: `listModels(p, opts?)` opcional — não quebra callers existentes. OK.
- PR2: MODELS array não é mutada — `getModel` segue retornando legados. OK.
- PR3: `pinnedFirst` + `fromCatalog`: garantir que Outro NÃO está duplicado no fromCatalog (remover o push e mover para pinnedFirst). Detalhar no U.1.
- PR4: fetchAnthropic não vem com `released`. Sync aceita modelos sem `released` (não pode descartar).
- PR5: OpenRouter entries com `pricing: null` em catalog.ts (o3-mini, o4-mini, o3-pro) — manter como está; curadoria manual.
- PR6: `:free` → tier="free" SEMPRE, regardless de pricing.
- PR7: Verificar `playgroundSession` no schema antes de incluir no cleanup.
- PR8: Acentos em strings JÁ existentes no llm-config-form (catalogo, ja, esta, preco).
- PR9: Botão refresh `h-7 px-2 text-xs` para não esticar o row.
- PR10: ProviderBadge: classes `bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20`.
- PR11: pinnedFirst usa `option.value` como key.
- PR12: Texto "Atualizar modelos" (3 palavras) cabe. Manter.
- PR13: Confirmado equilíbrio simétrico após pt-5 pb-5.

## Aplicados no PLAN v3 (mesmo arquivo do v1 com edits)

PR3, PR8, PR9, PR10, PR11 adicionados como detalhes em U.1.
PR4 adicionado em S.2.
PR6 adicionado em S.2 (deriveTier).
PR7: verificar schema antes de C.1.
