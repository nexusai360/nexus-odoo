# Review F4 — Ondas 4e (Caminho 3) e 4f (Hardening e harness)

**Data:** 2026-05-18
**Branch:** `feat/mcp-semantico`
**Commits 4e:** `6bb18aa`, `19fc031`, `5c2335d`
**Commits 4f:** `0f52345`, `71feeae`, `c047fce`, `7bbc494`, `bf18fb5`
**Escopo:** conformidade spec §3.6/§3.7 + plano + qualidade + segurança.

---

## Veredito: APROVADO COM RESSALVAS

Verificação automatizada toda verde: `tsc --noEmit` (raiz e `mcp/tsconfig.json`)
PASS, `jest` 626 testes / 89 suites PASS, `eslint src/ mcp/` 0 erros (1 warning
pré-existente em `report-data.test.ts`, fora do escopo desta onda).

Funcionalmente as ondas 4e e 4f estão completas e corretas: recusa 3b,
`bi_consulta_avancada` gated, role Postgres com GRANT mínimo, RLS preparada,
rate limiter integrado e container. As ressalvas são de **segurança** (segredo
em arquivo versionado) e de **profundidade do harness** (não é o teste de
integração HTTP-end-to-end que o plano descreve).

### Contagem por severidade

| Severidade  | Qtde |
|-------------|------|
| CRÍTICO     | 0    |
| IMPORTANTE  | 2    |
| MENOR       | 4    |

---

## Achados

### IMPORTANTE

#### I-1 — Senha dev hardcoded em arquivo versionado
- **Arquivo:** `docker-compose.yml:32`
- **Problema:** `MCP_DATABASE_URL=postgresql://nexus_mcp:${MCP_DB_PASSWORD:-nexus_mcp_dev_password_2026}@db:5432/...`
  embute a senha `nexus_mcp_dev_password_2026` como valor de fallback. O
  arquivo é versionado (`git ls-files` confirma). Isso viola o CLAUDE.md §8:
  "Credenciais nunca no chat / segredos só em `.env.local`/`.env.production`".
  Embora seja apenas a senha de dev e exista override por `MCP_DB_PASSWORD`,
  é um segredo concreto commitado — e em dev a porta 3100 fica na rede
  interna do compose, então o risco operacional imediato é baixo, mas o
  hábito é o problema. O `MCP_SERVICE_TOKEN` na linha 33 já usa o padrão
  correto (`dev_service_token_change_in_production` — um placeholder, não um
  segredo "real-sounding"). Nota: a senha **não** aparece em nenhum `.sql`,
  `.ts` ou `.env*` versionado — só neste ponto.
- **Recomendação:** trocar o fallback por um placeholder explícito, ex.
  `${MCP_DB_PASSWORD:-CHANGE_ME_dev_password}`, ou remover o fallback e
  exigir `MCP_DB_PASSWORD` via `.env.local`. Alinhar com o estilo da linha 33.

#### I-2 — Harness não exerce as 14 tools via Streamable HTTP real
- **Arquivo:** `mcp/__tests__/harness.ts`, `mcp/__tests__/integration.test.ts`
- **Problema:** o plano 4f-4 / a descrição do harness pedem um teste de
  integração que exerce as tools "via Streamable HTTP real". O que existe:
  - As assertivas de catálogo (14 tools, filtro por perfil, gate de
    `bi_consulta_avancada`, `registrar_lacuna` sempreVisível) rodam contra
    `visibleTools(catalogo, user)` **direto** — não via `tools/list` HTTP.
  - As assertivas de `tools/call` (domínio negado, gate de role, input
    inválido) rodam contra `handleToolCall(...)` **direto** — não via
    `tools/call` HTTP.
  - O único teste que toca o servidor HTTP real (`describe` item 5) cobre
    apenas `initialize`, `401` token inválido e `403` userId desconhecido.
    Não há um `tools/list` nem um `tools/call` passando pelo
    `StreamableHTTPServerTransport`.
  - O `harness.ts` admite no próprio comentário: "para simplificar o harness,
    fazemos chamadas JSON-RPC diretamente sem o SDK client completo" — e
    `mcpRequest` nunca é usado para `tools/list`/`tools/call`.
  - O teste `initialize` (linha 261) tem assertiva frouxa:
    `expect(hasSid || status === 200).toBe(true)` — sempre verdadeira se
    status for 200, não verifica de fato o sessionId.
  - Consequência: a camada 1 do RBAC (filtro de catálogo) e o pipeline são
    testados como **unidades**, mas a integração transport→McpServer→handler
    com o catálogo filtrado por sessão **não é exercida end-to-end**. Um bug
    no registro de tools por sessão em `createMcpServerForUser` ou na
    delegação ao transport passaria despercebido.
- **Recomendação:** ou (a) completar o harness fazendo `initialize` →
  capturar `mcp-session-id` → `tools/list` → asserir os IDs retornados pelo
  protocolo, e ao menos um `tools/call` HTTP por perfil; ou (b) se a
  cobertura via unidade for considerada suficiente, ajustar a descrição do
  harness e o checklist do plano para refletir que a verificação HTTP cobre
  apenas o handshake/auth, sem alegar "exerce as 14 tools via HTTP real".
  Endurecer também a assertiva da linha 261.

### MENOR

#### M-1 — `bi_consulta_avancada` não valida `outputSchema`
- **Arquivo:** `mcp/tools/caminho3/bi-consulta-avancada.ts:38-49`
- **Problema:** o handler declara `outputSchema` mas retorna o objeto literal
  sem passar por `outputSchema.parse(...)`. Como o objeto é estático e
  tipado, não há bug hoje, mas o `outputSchema` vira documentação morta —
  inconsistente com a intenção de validar saída. Vale conferir se as demais
  tools do catálogo validam o output; se nenhuma valida, é um padrão do
  projeto e o achado é informativo.
- **Recomendação:** ou aplicar `outputSchema.parse(output)` (no handler ou no
  pipeline), ou remover o `outputSchema` se o projeto deliberadamente não
  valida saída.

#### M-2 — Rate limiter ignora erro do `INCR` no resultado do pipeline
- **Arquivo:** `mcp/lib/rate-limit.ts:46`
- **Problema:** `const count = results?.[0]?.[1] ?? 1` lê o segundo elemento
  da tupla `[Error|null, number]`, mas nunca inspeciona `results[0][0]` (o
  erro). Se o `INCR` falhar parcialmente e retornar `[Error, undefined]`, o
  código trata como `count=1` → **permite** a requisição. É um fail-open
  silencioso por chamada. O caso comum (Redis totalmente fora) cai no
  `try/catch` de `handleToolCall` → `outcome=error` (fail-closed), então o
  impacto real é estreito.
- **Recomendação:** se `results[0][0]` não for `null`, decidir explicitamente
  a política (logar e permitir, ou negar) em vez do `?? 1` implícito.

#### M-3 — Mensagem de recusa por estouro de rate limit não usa o contrato 3b
- **Arquivo:** `mcp/server.ts:62`
- **Problema:** o estouro de rate limit retorna a string literal
  `"rate_limit_exceeded: muitas requisições..."`. A onda 4e criou
  `mcp/lib/recusa.ts` para centralizar texto de recusa — mas esse caso é
  outro tipo de recusa (técnica, não 3b de escopo), então usar
  `montarRecusa` aqui seria incorreto. O achado é só de consistência: não há
  um helper central para mensagens de recusa técnica. Aceitável manter
  literal; registrado para visibilidade.
- **Recomendação:** nenhuma ação obrigatória. Opcional: centralizar também
  as mensagens de recusa técnica se mais casos surgirem.

#### M-4 — `mcp/lib/recusa.ts` não tem ponto de chamada nesta fase
- **Arquivo:** `mcp/lib/recusa.ts`
- **Problema:** o contrato 3b é entregue como constante + função, mas
  nenhuma tool nem o servidor o invoca — coerente com a spec §3.7 ("a F4
  entrega a mensagem-padrão e o ponto onde o agente a aciona"; o roteamento
  é do agente/F5). É esperado, mas a função `montarRecusa(assunto)` fica sem
  uso real e sem export consumido — risco de drift até a F5.
- **Recomendação:** nenhuma ação. Confirmar que os testes em `recusa.test.ts`
  cobrem ambos os ramos (com e sem `assunto`) — o que mantém o contrato vivo.

---

## Conformidade com a spec — verificação ponto a ponto

| Item spec | Resultado |
|-----------|-----------|
| §3.7 3b — mensagem de recusa centralizada | OK (`recusa.ts`) |
| §3.7 3c — `bi_consulta_avancada` gated a admin/super_admin | OK (`gatedRoles`, invisível a manager/viewer — testado) |
| §3.7 3c — stub responde "modo BI não disponível" + aviso de consulta dinâmica | OK |
| §3.7 3c — role read-only documentado | OK (`research/2026-05-17-f4-postgres-mcp-role.md`, role `nexus_mcp_bi` separado) |
| §3.6 camada 4 — GRANT mínimo (`SELECT` fato_*/users/user_domain_access/sync_state/fato_build_state) | OK — nomes de tabela conferem com `@@map` do schema |
| §3.6 camada 4 — `INSERT` em mcp_audit_log/feature_requests, sem SELECT em mcp_audit_log | OK — `REVOKE SELECT ON mcp_audit_log` explícito |
| §3.6 camada 4 — sem raw_*, sem UPDATE/DELETE | OK — `REVOKE ALL` + loop dinâmico em `raw_%` |
| §3.6 camada 4 — script versionado, sem senha real | OK — placeholder `SUBSTITUIR_POR_SENHA_FORTE`, runbook instrui troca |
| §3.6 camada 5 — RLS preparada, documentada, desabilitada | OK — bloco comentado, runbook, verificação `relrowsecurity=false` |
| §3.6 camada 7 — rate limit INCR+EXPIRE, `mcp:rate:{userId}`, 60/min | OK |
| §3.6 camada 7 — estouro → `outcome=denied` | OK (`server.ts:59-62`) |
| §3.6 camada 7 — rate limit ANTES de qualquer processamento | OK (primeiro passo do `try`) |
| 4f-5 — Dockerfile Node puro, copia src/+prisma/+mcp/ | OK — multi-stage, `tsc -p mcp/tsconfig.json` no builder, user não-root |
| 4f-5 — serviço `mcp` no compose, porta 3100 rede interna | OK — `ports` comentado, depends_on db+redis |

**Observação sobre nomenclatura do role SQL:** confirmado que os nomes
`users`, `user_domain_access`, `sync_state`, `fato_build_state`,
`fato_estoque_*`, `fato_financeiro_*`, `mcp_audit_log`, `feature_requests`
batem com os `@@map` do `prisma/schema.prisma`. O comentário do SQL sobre
`User → "users"` está correto.

---

## Resumo

As ondas 4e e 4f cumprem a spec §3.6/§3.7 e o plano em estrutura e
funcionalidade. Não há achado CRÍTICO. As duas ressalvas materiais:
**I-1** (senha dev `nexus_mcp_dev_password_2026` commitada como fallback no
`docker-compose.yml` — corrigir para placeholder) e **I-2** (o harness de
"integração" testa catálogo e pipeline como unidades e cobre apenas
auth/handshake via HTTP real — não exerce `tools/list`/`tools/call` pelo
transport; ou completar o harness ou corrigir a alegação do plano). Os 4
achados MENOR são de robustez/consistência e não bloqueiam.
