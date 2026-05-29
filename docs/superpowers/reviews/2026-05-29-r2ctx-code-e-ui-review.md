# R2-ctx , Code Review + UI Review (etapa [10] da metodologia)

> 2026-05-29. Review do diff `c5f38c3..HEAD` (22 arquivos, ~1629 linhas, ~metade testes).
> Observação: `/gsd-code-review` e `/gsd-ui-review` são da família GSD e exigem scaffolding
> `.planning/` que este projeto (Superpowers) não mantém; a review foi conduzida sobre o diff
> com o mesmo rigor (segurança, correção, telemetria, qualidade, 6 pilares de UI).

## Code review , focos da spec

### Segurança (RBAC na decisão FINAL) , OK
- `run-agent.ts`: o fast-path de recusa e o `filterCatalog` usam `decisaoFinal` (Camada 3 quando houve
  reformulação), não a `decisaoL1`. Coberto pelo teste `run-agent.contextual.test.ts` "SEGURANÇA:
  reformulação leva a domínio proibido -> fast-path dispara na decisão FINAL". Sem vazamento de tools
  fora do acesso.
- A resposta do agente usa `args.userMessage` (pergunta crua) + janela de contexto; a reformulada serve
  só para rotear. Não troca a fala do usuário.

### Gating das 3 camadas , OK
- Camada 2 só dispara com `decisaoL1.fallback.triggered && reformActive && agentSettings.routerEnabled`.
- Em shadow (`routerEnabled=false`) não gasta LLM (teste cobre). Primeiro turno (sem pares) e reform
  retornando null mantêm a decisão L1 (testes cobrem).

### Telemetria , OK
- Chamada LLM de reformulação loga `router_reformulacao` (em `contextualize.ts`, fire-and-forget);
  re-embedding (Camada 3) loga `router`. Decisão grava `originalFallback`/`usedReformulation`/
  `reformulatedQuestion`. Painel exibe badge "reformulada" + a pergunta reformulada.

### Janela de contexto , OK
- `loadHistory` ganhou filtro de papéis com limpeza de `toolCalls` órfãs no modo "Usuário + IA" (teste).
- `resolveContextWindow` clampa 10..50 e respeita o checkpoint por superfície; `runAgent` resolve e passa
  por parâmetro (loadHistory continua puro). Clamp também na escrita (Zod em `updateAgentResources`).

### Achados menores (não bloqueantes)
- `router-config-card.tsx`: o select de Provedor do sub-bloco Embeddings é display-only (`onChange` no-op)
  porque embedding é OpenAI-only hoje. Aceitável; se outros provedores ganharem embedding, habilitar.
- Latência: a reformulação roda em série antes da resposta, só na cauda de fallback, com timeout 2.5s e
  modelo barato. Aceitável; medir p95 na validação.
- `reformProviders` = provedores com credencial; se o provedor salvo não tiver chave, o select cai no
  primeiro disponível (comportamento consistente com áudio/anexo).

### Verificação automatizada
- `tsc` limpo; `eslint` 0 erros (warnings pré-existentes em testes não relacionados).
- Jest: 494 testes do agente verdes; suíte completa 2047 passed (1 suíte de `users/access-step` falha só
  no run paralelo, passa isolada , poluição de teste pré-existente, domínio não tocado).
- `next build` de produção: compilou, 18 páginas geradas.

## UI review , 6 pilares (blocos novos)
- **Consistência:** reusa `ResourceCard` (mesmo chrome: ícone Lucide + título + descrição + pílulas
  Desativado/Playground/Produção) e `FieldBlock`/`CustomSelect`/`SearchableSelect`. Sub-blocos com heading
  secundário + borda violeta sutil.
- **Sem emoji:** ícones Lucide (`History`, `Route`, `ArrowUpRight`, `KeyRound`, `Plus`).
- **Acessibilidade:** `aria-label` nos controles, `role="group"`/`aria-pressed` no segmented, `role=listbox`/
  `aria-selected` no ApiKeySelect, foco e disabled tratados.
- **Tipografia/cor:** tokens semânticos (text-muted-foreground, violet-500/15), badge tabular no slider.
- **Dark mode:** classes `dark:` herdadas do padrão (violet-300 etc.).
- **Layout:** grids `sm:grid-cols-3` como os blocos existentes; slider + badge alinhados.

## Pendências para a validação humana (gate da spec §9)
- A "Construção da pergunta" nasce **OFF** (decisão da spec): ligar só após validação empírica.
- Validação ao vivo: conversa multi-turno no playground com router ativo + reform ON, conferindo no painel
  do Router (original -> reformulada -> domínio) e no Consumo (`router_reformulacao` + `router`).
- Calibragem contextual (reduzir fallback sem baixar Top-K) , rodar com a credencial de reform definida.
- Rebuild dos containers `app`/`mcp`/`worker` antes da validação visual (CLAUDE.md §2.1); o dev canônico
  roda na pasta principal (main), não nesta worktree.
