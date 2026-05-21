# Code Review + UI Review — F4 Onda 2 Correções

> Auditoria da etapa [10] do workflow (CLAUDE.md §6). Feita **inline na sessão
> principal** (Opus 4.7) — o usuário vetou delegação a subagentes nesta sessão,
> então `/gsd-code-review` e `/gsd-ui-review` (que spawnam subagentes) foram
> substituídos por revisão crítica inline equivalente.

## Escopo revisado

`servidor-mcp-nav.tsx`, `visao-geral.tsx`, `chaves-lista.tsx`, `logs-timeline.tsx`,
`docs-renderer.tsx`, `docs-layout.tsx`, `docs-catalog.tsx`, `plugar-mcps-content.tsx`,
as 5 rotas (`servidor-mcp/**`, `agente/plugar-mcps`), `external-mcp-servers.ts` (+types),
`schema.prisma` (ExternalMcpServer) e a migration.

## Code review

| Aspecto | Resultado |
|---|---|
| Tipos (`tsc --noEmit`) | ✅ limpo |
| Lint (`eslint`) | ✅ limpo nos arquivos alterados |
| Testes (`jest`) | ✅ 1519 passed / 1 skipped (poc-happy-path — credenciais) |
| Build (`next build`) | ✅ todas as rotas compilam |
| Segurança — token de MCP externo | ✅ cifrado em repouso (AES-256-GCM); nunca devolvido ao cliente (só `hasAuth`) |
| Segurança — gate | ✅ `requireSuperAdmin` em todas as Server Actions; gate de rota nas páginas |
| Segurança — XSS no docs-renderer | ✅ `dangerouslySetInnerHTML` só sobre conteúdo estático do repo, com escape de `&<>` |
| Auditoria | ✅ `logAudit` em create/update/delete de MCP externo |

**Observação (severidade baixa, aceita):** `testExternalMcpServer` faz `fetch` em
URL arbitrária informada pelo super_admin — vetor de SSRF teórico. Mitigado por
ser exclusivo de super_admin (confiança máxima) e por ser exatamente o propósito
da feature (conectar a endpoints externos). Sem ação neste ciclo.

## UI review (6 pilares)

| Pilar | Resultado |
|---|---|
| Tipografia | ✅ escala uniforme; `grep` confirma zero `text-lg/xl/2xl` no conteúdo do painel |
| Consistência | ✅ todos os componentes seguem o padrão `webhooks-content`/`api-keys-content` |
| Hierarquia / espaçamento | ✅ ritmo 4/8px; cards `rounded-xl border bg-card p-5` |
| Estados | ✅ loading (`Loader2`), vazio (border-dashed + mensagem), erro (`toast`) |
| Navegação | ✅ aba ativa destacada via `ServidorMcpNav` (pathname); fim do `<Tabs>` duplicado |
| Acessibilidade | ✅ `aria-label` em botões icon-only; `aria-current`/`aria-expanded`; foco visível |
| Ícones | ✅ Lucide, sem emoji |

## Verificação pendente (não bloqueante)

- **Inspeção visual pixel a pixel** e captura de erros de console do cliente
  exigem sessão autenticada de super_admin no navegador — fora do alcance da
  execução autônoma. Smoke test feito: as 5 rotas respondem 302 (redirect de
  auth), zero 500, sem erro de SSR no log do dev server.
- **Teste E2E de escrita real** no Odoo de teste — pendente de credenciais
  (ver plano, Task 16).

**Conclusão:** nenhum achado material que bloqueie. Correções de UI prontas.
