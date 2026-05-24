# Review #2 — PLAN v2 (mais profunda, foco em granularidade)

## Achados (Q-series)

### Q1. Quebrar B4 em sub-tasks
"`compose.ts` — diretrizes + source" esconde 3 unidades:
- B4a: novo bloco "## Comportamento" no system prompt + teste
- B4b: parâmetro `source` no composer + injeção da diretriz quando
  `suggestion` + teste
- B4c: renomear referência "sugestões clicáveis" → "sugestões de
  pergunta" no texto do prompt + teste

### Q2. Quebrar B5 / B6
- B5a: schema do body do SSE da bubble
- B5b: schema do body do SSE do playground
- B6a: assinatura de `runAgent({..., source})`
- B6b: propagação source para o composer

### Q3. Quebrar B8
- B8a: helper `_search-helpers.ts` com `searchProductIdsByName`
- B8b: aplicar em `querySaldoProduto`
- B8c: teste do helper (fixture)
- B8d: teste de `querySaldoProduto` com termo acento

### Q4. Quebrar B9 — uma sub-task por arquivo
Após auditoria, gerar uma task por arquivo (ex.:
B9-cadastros-buscar-parceiro, B9-comercial-preco-produto, etc.).
Determinar em tempo de execução.

### Q5. Quebrar B10
- B10a: criar `sync-whitelist.ts`
- B10b: aplicar whitelist no `sync-catalog.ts`
- B10c: revive logic (deprecated → null quando volta)
- B10d: marcar deprecated quando some
- B10e: teste de cada cenário

### Q6. Quebrar C3
- C3a: extrair `ResourceCard` para arquivo próprio (sem mudar visual)
- C3b: adicionar prop `collapsible` + chevron + estado
- C3c: localStorage com useEffect (SSR-safe)
- C3d: testes (visual base, expandir/recolher, persist)

### Q7. Quebrar C5
- C5a: backend SSE emite `toolCallId` no `tool_call`
- C5b: backend SSE emite `toolCallId` no `tool_result`
- C5c: chat-panel matching por id, FIFO fallback
- C5d: chat-panel guarantee no-drop
- C5e: animate-pulse no running
- C5f: teste de intercalação

### Q8. D5 quebrar
- D5a: componente `AgentAvailabilityCard` base
- D5b: integração com action `updateAgentAvailability`
- D5c: sumário textual computado
- D5d: substituir toggle antigo na `configuracao/page.tsx`
- D5e: ajustar `(protected)/layout.tsx` para só montar bubble se
  `bubbleEnabled`
- D5f: testes (4 estados)

### Q9. D6 quebrar
- D6a: ajuste de baseline provedor/modelo
- D6b: reposicionar botão Atualizar
- D6c: estado loading + toast com sumário
- D6d: banner deprecated quando modelo selecionado removido

### Q10. D7 — listar páginas explícitas
- D7a: configuracao/page.tsx
- D7b: chaves/page.tsx
- D7c: prompt/page.tsx
- D7d: consumo/page.tsx
- D7e: playground/page.tsx (e sub-rotas)
- D7f: plugar-mcps/page.tsx
- D7g: agente/page.tsx (raiz)

### Q11. D9 vs C5
D9 e C5 falam do mesmo wiring. Consolidar em C5 e remover D9.

### Q12. D10 quebrar
- D10a: bubble `chat-panel.tsx` adiciona `meta.source`
- D10b: playground `playground-content.tsx` mesmo
- D10c: SuggestionsBar quando sugestão clicada → marca source

### Q13. Resumo de testes
Cada teste deve ter caminho de arquivo no PLAN. Adicionar.

### Q14. Verificar nome de tabelas reais antes de A2
Adicionar como pré-tarefa A0: "ler schema, listar tabelas/colunas
relevantes". Output: ata em `.planning-temp/A0-tables.txt` consumida
por A2 e B8.

### Q15. Granularidade max — sem tasks > 1 arquivo
Cada task da PLAN v3 toca **um** arquivo (ou grupo coeso de 2-3
arquivos relacionados). Refatorar para garantir.

### Q16. Adicionar task de commit por onda
Após cada onda, commitar. Mensagens curtas em pt-br sem travessão.

### Q17. ProgressTrail — backend tem `toolCallId`?
Verificar agora-ish:
- Em `run-agent.ts`, o stream que emite `tool_call` provavelmente
  passa `name` e `args`. Adicionar `toolCallId` se o provider expor.
- Provider OpenAI: o chunk com `tool_calls` traz `id`. Já está no
  contexto, plumbar.
- Anthropic: `tool_use` traz `id`.

### Q18. Considerar dark/light theme nos componentes novos
`AgentAvailabilityCard`, `ToolCallChip`, `ResourceCard`. Já é convenção
do projeto; só checklist mental.

### Q19. Acessibilidade A2 do `pill-group` máximo sugestões
`role="group"` + `aria-label="Máximo de sugestões por resposta"`.
Já tem `aria-pressed`; manter.

### Q20. Tests no playground — não cobrir muito
Foco em chat-panel.tsx (bubble). Playground em §F2 smoke.

## Próximo passo

Aplicar Q1–Q20 → PLAN v3 (executável).
