# Review #1 — SPEC v1 (adversarial)

Data: 2026-05-23
Alvo: `2026-05-23-agente-nex-polish-config.md` v1

## Achados materiais

### A1. Falta separar "ativação" de "disponibilidade do canal"
A SPEC fala em desativar bubble e WhatsApp via toggle, mas não trata o
caminho do `agent-bubble` no `layout.tsx`. Hoje o `bubbleEnabled` controla
a montagem; quando recolhido para "off", precisa **desmontar** sem deixar
restos no DOM. Acrescentar nota explícita.

### A2. "Plug MCPs" tem desbalanço, mas SPEC não diz qual coluna fica
SPEC só diz "centralizar/equilibrar margem". Definir: header + lista
ocupam coluna principal `1fr`, sidebar de instruções/upsell fica em
`320px` à direita em desktop, colapsa para baixo em mobile.

### A3. Animação "consultando" — esquema de estado insuficiente
SPEC diz `inflight | done | error` mas não diz onde o estado vive nem
como ele é alimentado pelo stream SSE. Adicionar: cada `tool_call` emitido
pelo provedor LLM gera um nó `ToolCallChip` com id único; quando chega o
`tool_result`, atualiza estado do chip in-place. Nenhum desmount.

### A4. Sugestão clicada → resposta direta: como o agente sabe?
SPEC fala em "não pedir confirmação de pergunta já clicada", mas não diz
como o backend sinaliza que a entrada veio de sugestão. Proposta:
acrescentar `meta: { source: "suggestion" }` no payload da rota SSE
quando o usuário clica numa sugestão; o prompt do agente recebe
`<meta source="suggestion">true</meta>` ou equivalente e segue regra
mais restrita.

### A5. Custo por nível — UX ambígua
"1x / 2x / 4x / 8x" é mais técnico do que ajuda. Trocar por linguagem
qualitativa: "consumo leve / moderado / alto / intenso", com tooltip
que explica o motivo (mais reasoning tokens) e indica que a tarifa é a
mesma por token.

### A6. Renomear "Sugestões clicáveis" tem dois lugares óbvios faltando
Além do card, há referência em:
- `src/lib/agent/prompt/compose.ts` (texto injetado no prompt — pode
  ficar como "sugestões" sem o "clicáveis")
- `src/app/(protected)/agente/configuracao/page.tsx` (heading da seção)

### A7. Busca acento-insensível — performance
`unaccent(name) ILIKE unaccent(:term)` não usa índice por padrão. Para os
modelos `fato_produto` e `raw_product_template`, criar índice funcional:
`CREATE INDEX ON <table> (lower(unaccent(name)))`. Adicionar à
SPEC v2.

### A8. Whitelist de modelos no sync — quem mantém?
SPEC manda whitelist por provedor mas não diz onde fica nem como
atualizar. Definir: lista hardcoded em
`src/lib/agent/llm/sync-whitelist.ts`, atualizável por PR. Cada entrada
tem `{ provider, modelIdPattern, validFrom }`.

### A9. Telas afetadas — falta `agente/dashboards` se existir
Verificar se há outras rotas dentro de `(protected)/agente/`. Listar
todas e aplicar regra de largura.

### A10. Falta o caso "playground" no toggle de raciocínio
Quando `reasoningCheckpoint = PLAYGROUND`, o cabeçalho da bubble in-app
em produção deve mostrar status? SPEC v1 não trata. Decisão: bubble em
produção segue `PRODUCTION`, playground page segue `PLAYGROUND`. Sem
indicador visual; já está coberto pela lógica existente do
`FeatureCheckpoint`.

### A11. Reset de modelo no provedor — fluxo do "Atualizar"
Após o sync, se o modelo atualmente selecionado deixou de existir, o
form precisa cair para fallback. SPEC não diz. Definir: se modelo
selecionado some, escolher o primeiro `tier=production` do provedor e
toast warning.

### A12. Estado expandir/recolher por sessão vs persistido
SPEC diz "preferência local" mas também menciona `localStorage`. Fechar:
`localStorage` mesmo (sobrevive ao refresh, não sai do navegador, não
precisa de banco).

### A13. Não dá pra ter `bubbleEnabled = false` e `whatsappEnabled = false` simultaneamente?
Decisão: **pode**. É o estado "desativado em todos os canais". UI mostra
sumário "Agente Nex desativado" e a bubble não monta no app.

### A14. Falta nota sobre Sonnet proibido / Opus obrigatório
Lembrete operacional para o executor: tudo no Opus 4.7, conforme CLAUDE.md.

### A15. Idioma da nova string de raciocínio incompatível
"O modelo selecionado não tem suporte a raciocínio. Para liberar este
recurso, escolha um modelo compatível na seção de conexão acima." —
substituir "este" por "esse" (norma culta brasileira para anáfora) e
encurtar para uma frase só: "O modelo selecionado não tem suporte a
raciocínio. Escolha um modelo compatível na seção de conexão para
liberar o recurso."

### A16. Falta enumerar exigências de testes
SPEC v1 cita testes em §8 mas não amarra "este teste cobre este achado".
Em v2, mapear test → requisito.

## Não achados materiais (vou anotar como ok)

- Estrutura geral da SPEC.
- Inventário de problemas.
- Decisão de Prisma generate sem schema novo.

## Próximo passo

Aplicar A1–A16 → gerar SPEC v2.
