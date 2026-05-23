# Review #1 — PLAN v1

## Achados (P-series)

### P1. A2 — colunas reais
Confirma nomes: `fato_estoque_saldo.produto_nome` é mapeado por
`produtoNome` no Prisma → coluna SQL `produto_nome`. Para
`raw_product_template`, conferir; provavelmente `name`.

### P2. A4 — tabela de mensagens do agente
Tem que verificar nomes reais (`AgentChatMessage` ou
`PlaygroundMessage`). Provavelmente são duas. Adicionar coluna `source`
só se F5 vai usar; se não, **skip** para reduzir burocracia. Decisão:
**skip** por enquanto. Source vira metadado in-flight do prompt; log
detalhado vai com F5.

### P3. B8 — Prisma `findMany` vs `$queryRaw`
A camada de query usa `findMany` para tirar proveito do tipo gerado.
Substituir por `$queryRaw` quebra tipagem. Mitigação: implementar
helper `searchProductIdsByName(termo)` que faz `$queryRaw` e retorna
`number[]`; o `querySaldoProduto` continua com `findMany` passando
`{ produtoId: { in: ids } }`.

### P4. C5 — IDs do tool_call no SSE
Verificar se o backend hoje envia `tool_call_id`. Se não, adicionar.
Pode ser que provider OpenAI já carregue (`tool_call.id` no chunk).
Plumbar até o evento SSE.

### P5. D5 — bubbleEnabled false desativa bubble globalmente
Garante que `(protected)/layout.tsx` não monte AgentBubble se
`bubbleEnabled === false`. Hoje provavelmente já checa; só confirmar.
Adicionar task explícita.

### P6. D7 — outras telas talvez existam
Verificar `(protected)/agente/page.tsx` (raiz). Aplicar largura padrão
ou redirect para configuracao.

### P7. D9 — sem teste para flicker
Adicionar teste e2e (ou unitário no chat-panel) que simula stream:
tool_call(label=estoque) → tool_call(label=financeiro) → tool_result
(label=estoque) → tool_result(label=financeiro) → done. Asserta que
ambos os steps existem e ficam done.

### P8. F2 — busca real precisa dado real
O smoke "buscar mola espiral em aço" só passa se o cache tem o produto.
Verificar pré-condição: rodar `pnpm worker:sync` antes ou usar dataset
seedado.

### P9. Migração `unaccent` em prod
Reiterar no PLAN: rodar como superuser; documentar runbook.

### P10. Sync de catálogo — deprecated com seleção ativa
Ordem de operações no `sync-catalog.ts`:
1. Marca **todos os entries deprecated** primeiro? Não — pode quebrar
   modelo que ainda existe.
2. Padrão correto: para cada modelId no novo catálogo, `deprecated_at =
   NULL` (revive). Para cada entry **no banco** que não veio no novo,
   `deprecated_at = now()` se ainda não estiver.
3. Nunca deleta.

### P11. Renomear "Sugestões clicáveis" — string em texto user-visible
Procurar também em arquivos `.md` de documentação? Não, doc fica
inalterada (histórica). Só UI.

### P12. ProgressTrail — label collision FIFO
Hoje matching FIFO por label resolve para 1 tool por label. Se o agente
chama `estoque_saldo_produto` e `estoque_concentracao` no mesmo turno,
ambos viram label "estoque". Resultado: tool_result de um marca o
outro. Corrigir agora com id correlacional (P4).

### P13. SuggestionSource = playground
Quando o usuário no playground clicar numa sugestão, mandar
`source=suggestion`. O playground usa a mesma SSE? Sim. Aplicar a
mesma lógica em `playground-content.tsx`.

### P14. Tarefa que falta — atualizar AgentSettingsData consumers
Cada lugar que lê `AgentSettingsData` vai precisar tratar
`whatsappEnabled`. Listar consumers:
- `resources-toggles.tsx`
- `configuracao/page.tsx` (carrega initial)
- WhatsApp webhook (F5) — só leitura, não bloqueia.
Adicionar como sub-task.

### P15. Eslint pode reclamar de `useEffect` no `ResourceCard`
Garantir dependency array correto para o `localStorage`. Já listado em
B4 da review da spec; explicitar aqui.

### P16. Ordem de execução
Para evitar quebra, ordem **A → B (sem B8) → C → D → B8 → E → F**
seria mais segura (busca depois das migrações + UI estável). Mas A já
roda as migrations antes de B8. Manter ordem do PLAN, mas marcar B8
como "depende A2".

### P17. Atualizar progress-labels com novas tools
Já listada em B7. Confirmar lista atual lendo `mcp/tools/**/index.ts`.

### P18. Task de seed para teste E2E de busca
Sem dataset realista, E1 vai usar fixture. Adicionar fixture em
`__tests__/fixtures/produtos-mola.json`.

### P19. Restart do dev — usuário precisa ser instruído
Final do PLAN: documentar no resumo final que o usuário precisa rodar
`pnpm dev` reiniciado e talvez `pnpm prisma generate` se vier de pull.

### P20. Branch
Continua em `feat/f4-leitura-expansao` ou cria nova? Avaliação:
mantém na atual — a entrega é polish + bugfix, não inaugura fase nova.
Commit em série, push, PR.

## Próximo passo
Aplicar P1–P20 → PLAN v2.
