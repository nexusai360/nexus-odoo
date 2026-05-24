# Code Review + UI Review, F4 Onda 2 Correções Rodada 2

> Etapa [10] do workflow. Revisão inline na sessão principal (Opus 4.7), o usuário vetou
> delegação a subagentes. Cobre as Áreas A a G do plano `2026-05-21-f4-onda2-correcoes-r2.md`.

## Verificação

| Aspecto | Resultado |
|---|---|
| Tipos (`tsc --noEmit`) | limpo |
| Lint (`eslint`) | limpo nos arquivos da rodada (warnings de import sem uso corrigidos) |
| Testes (`jest`) | 1529 passando, 1 skipped (poc-happy-path, sem credenciais) |
| Build (`next build`) | compila, todas as rotas |
| Travessão | varredura nos arquivos autorais da rodada: zero ocorrências |

## Code review

- **Documentação (`mcp-docs-content.tsx`):** estrutura clonada do nexus-nfe (sidebar
  scrollspy, hero, CodeBlock com realce, callouts, ToolCard). Cores adaptadas para os tokens
  de tema do nexus-odoo, integrando ao painel. `buildExamples` converte para Python por
  substituição textual de `true/false/null`; risco teórico em valores string, irrelevante para
  os exemplos atuais (args mínimos). Aceito.
- **Chaves (`chaves-lista.tsx`):** criar e editar em modal; capabilities por nível de acesso
  (helper puro `mcp-capability-levels` com teste). O `ChaveDialog` hidrata o form derivando de
  props durante o render (padrão React de "ajustar estado quando props mudam"), com guarda
  `hydratedFor` contra laço. Funciona, tsc e testes verdes. Aceito como padrão conhecido.
- **Logs (`logs-timeline.tsx`):** busca única (backend `search` agora cobre `tool`), status em
  `CustomSelect`, período em pílulas. Sem achados.
- **Tour:** componentes clonados do nexus-insights; persistência por usuário em `UserTourSeen`
  com actions testadas; `TourAutoStart` com guarda de ref e cleanup do timer. Sem achados.
- **Segurança:** `user-tour` gated por usuário autenticado; `UserTourSeen` não guarda dado
  sensível. Sem nova superfície de risco.

## UI review (6 pilares)

| Pilar | Resultado |
|---|---|
| Tipografia | escala do sistema; perfil do sidebar ajustado em 1 degrau conforme pedido |
| Consistência | modais, `CustomSelect`, `Switch`, `DateField` reusam o design system |
| Hierarquia | doc com blocos de seção e divisores; chaves e logs em cards padrão |
| Estados | loading, vazio e erro tratados em todas as telas |
| Navegação | sub-nav do MCP com aba ativa; tour com botão de interrogação no cabeçalho |
| Acessibilidade | `aria-label` em botões de ícone; campo obrigatório com asterisco vermelho |

## Pendência herdada (não desta rodada)

- Teste E2E de escrita real no Odoo de teste segue pendente de credenciais (rodada 1, Task 16).

**Conclusão:** sem achados materiais que bloqueiem. Rodada 2 pronta.
