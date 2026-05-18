# F4 — Code Review Final (auditoria holística) — etapa [10]

> Auditoria de código final da fase F4 inteira (MCP semântico) do nexus-odoo.
> Escopo: toda a diff `main...feat/mcp-semantico` (107 arquivos, +13.059/-709).
> Cada onda (4a–4f) já teve review individual; esta é a auditoria do conjunto:
> bugs, segurança, integração entre ondas, corretude, conformidade com a SPEC v3.
> **Não é carimbo.** Data: 2026-05-18.

---

## Veredito

**APROVADO COM RESSALVAS.**

Nenhum achado bloqueia o merge para produção. A fase está estruturalmente
sólida: RBAC de 7 camadas implementado conforme a spec, integração entre ondas
fechada, toolchain inteira verde. Os achados abaixo são 1 IMPORTANTE (bug de
corretura em caso de borda do `fonteStatus`) e 6 MENORES (robustez, duplicação,
código vestigial). Recomenda-se corrigir o IMPORTANTE antes do deploy; os
MENORES podem ser endereçados como follow-up.

### Contagem por severidade

| Severidade | Quantidade |
|---|---|
| CRÍTICO | 0 |
| IMPORTANTE | 1 |
| MENOR | 6 |

### Verificação automatizada — todos verdes

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | OK (sem erros) |
| `npx tsc -p mcp/tsconfig.json` | OK (sem erros) |
| `npx jest` | OK — 89 suites, 633 testes |
| `npx eslint src/ mcp/` | OK (sem warnings) |
| `npx next build` | OK (build completo, 16 rotas) |

---

## Auditoria por eixo

### 1. Segurança — RBAC estrutural ponta a ponta

**Verificado e correto:**

- **Camada 1 (catálogo filtrado):** `createMcpServerForUser` chama
  `visibleTools(catalogo, userCtx)` por sessão — cada `McpServer` registra só
  as tools visíveis. `tools/list` devolve o catálogo filtrado por construção.
- **Camada 2 (gate no handler):** `handleToolCall` chama `assertToolAllowed`
  antes do parse/handler; lança `DomainDeniedError` → `outcome=denied`.
- **Camada 4 (role Postgres mínimo):** `prisma/sql/2026-05-17-mcp-role.sql`
  concede `SELECT` só em `fato_*` + 4 tabelas de apoio, `INSERT` em
  `mcp_audit_log`/`feature_requests`, revoga `SELECT` de `mcp_audit_log` e
  `ALL` de todas as `raw_*` (loop dinâmico). Coerente com a spec 3.6.
- **Camada 6 (recarga de UserContext):** `handleToolCall` recarrega via
  `resolveUserContext` a cada chamada — autorização nunca obsoleta. `isActive`
  checado (espelha `src/auth.ts`).
- **Camada 7 (audit + rate limit):** `recordAudit` grava em todos os caminhos
  (`auditSafe` nunca derruba a resposta); `checkMcpRateLimit` roda antes de
  qualquer processamento, chave `mcp:rate:{userId}`, 60/min.
- **Service token constant-time:** `validateServiceToken` compara hashes
  SHA-256 (comprimento fixo) via `timingSafeEqual`; falha-seguro se o env
  ausente; token ausente/inválido → HTTP 401 antes do transporte MCP.
- **`bi_consulta_avancada` inalcançável por `manager`/`viewer`:** `gatedRoles:
  ["super_admin","admin"]`. `visibleTools` e `assertToolAllowed` aplicam o gate
  de role **antes** do `sempreVisivel` — confirmado em `registry.ts` linhas
  22-24 e 41-45. Testado em `integration.test.ts` (assertiva de catálogo por
  perfil). **Inalcançável de fato para manager/viewer.**
- **Sem segredo commitado:** `.env.example` traz `MCP_SERVICE_TOKEN`/
  `MCP_DB_PASSWORD`/`MCP_DATABASE_URL` **vazios** (template). `docker-compose.yml`
  usa interpolação `${...}`. Nenhum segredo real no diff.
- **Mensagens de erro não vazam interno:** `safeErrorMessage` devolve textos
  genéricos; stack/detalhe fica no `console.error` do servidor.
- **Sem vazamento entre domínios:** todas as queries de tool filtram pelo fato
  do próprio domínio; o gate de domínio impede invocar tool de domínio não
  concedido. Não há caminho que cruze domínios.

Nenhum achado CRÍTICO de segurança.

### 2. Integração entre ondas

- **4a→4c/4d:** `catalog/index.ts` agrega `estoqueTools` + `financeiroTools` +
  `caminho3Tools` = **14 tools** (6+6+2). `integration.test.ts` valida a
  contagem e os IDs exatos contra o catálogo real (rede N6). Todas no catálogo
  e acessíveis.
- **4b→4d:** as 6 tools de financeiro consomem `queries/financeiro.ts`, que lê
  os 3 `fato_financeiro_*` produzidos pelos builders de 4b. Builders registrados
  no `FATO_BUILDERS` e disparados por `processSnapshotCycle`/
  `processIncrementalCycle` via `runBuilders`. Ciclo worker→fato→tool→resposta
  fecha.
- **4c-1 reuso F3:** `report-data.ts` virou wrapper fino sobre
  `queries/estoque.ts`; as tools de estoque do MCP chamam o **mesmo núcleo** —
  paridade por construção (verificada em `paridade.test.ts`).
- **4e (Caminho 3):** `registrar_lacuna` grava em `feature_requests`;
  `bi_consulta_avancada` é stub gated; `montarRecusa`/`MENSAGEM_RECUSA_3B` é o
  contrato 3b. Tudo integrado ao catálogo.
- **4f (hardening):** rate limiter no pipeline, role SQL, RLS preparada/
  desabilitada, harness de integração. Servidor usa todos.

Integração coesa — sem peça órfã além do achado MENOR-3.

### 3, 4, 5 — ver achados abaixo.

---

## Achados

### IMPORTANTE

#### IMP-1 — `withFreshness`: a lógica de "pior fonte" pode mascarar uma fonte que nunca sincronizou
**Arquivo:** `mcp/lib/freshness.ts:153-170`

O loop que calcula `piorSyncEm` (a sync mais antiga entre as fontes) tem um
caso de borda incorreto. A intenção: se **qualquer** fonte tem `syncAt === null`
(nunca sincronizou), `piorSyncEm` deve permanecer `null` — esse é o pior caso
possível e não deve ser sobrescrito por uma data válida.

```
if (piorSyncEm === null || (syncAt !== null && syncAt < piorSyncEm)) {
  piorSyncEm = syncAt;
} else if (syncAt === null) {
  piorSyncEm = null;
}
```

Quando a **primeira** fonte iterada tem `syncAt === null` e a **segunda** tem
data válida: na 1ª iteração `piorSyncEm===null` é verdadeiro → `piorSyncEm`
recebe `null` (ok). Na 2ª iteração `piorSyncEm===null` ainda é verdadeiro →
`piorSyncEm` recebe a **data válida da segunda fonte**, perdendo o sinal de
"nunca sincronizou". O `else if` nunca é avaliado nessa ordem porque o `if`
já casou.

**Impacto:** real, mas restrito. Hoje só `concentracao`/`saldo`/etc. usam
**um único fato** por tool, então o loop roda uma vez só e o bug não dispara.
Ele só se manifesta em uma tool **multi-fato** onde uma das fontes nunca
sincronizou — não existe tool assim na F4 onda 1, mas a função é o helper
genérico e ondas futuras (F4 cobre todos os domínios) terão tools multi-fato.
É um bug latente no exato componente cuja razão de existir (#IM-3) é não
mascarar um Odoo caído.

**Recomendação:** trocar por uma passagem que primeiro detecta qualquer
`syncAt === null` e, se houver, fixa `piorSyncEm = null` definitivamente;
senão calcula o mínimo. Ex.: `const algumaNula = ...some(s => syncAt é null);
piorSyncEm = algumaNula ? null : min(...)`. Adicionar teste com 2 fatos, fonte
nula listada **antes** da fonte com data.

### MENOR

#### MEN-1 — `derivaTipo` faz fallback silencioso para "a_receber"
**Arquivo:** `src/worker/fatos/fato-financeiro-titulo.ts:38-41`

`derivaTipo` mapeia `"pagamento"` → `"a_pagar"` e **qualquer outro valor**
(inclusive string vazia ou um valor de `selection` novo que a Tauga introduza)
→ `"a_receber"`. A spec (#MN-2) escolheu `String` justamente por ser fail-safe
contra valores novos, mas o fallback aqui escolhe ativamente um lado em vez de
sinalizar "desconhecido". Um título com `tipo` corrompido contaria como a
receber e entraria em `financeiro_contas_a_receber`/`titulos_vencidos`.
**Recomendação:** mapear explicitamente `"recebimento"` → `"a_receber"` e
qualquer outro → `"desconhecido"` (ou logar), deixando as queries filtrarem só
os dois valores conhecidos. Baixa probabilidade (evidência empírica de 4b
confirmou só dois valores), mas a defesa custa pouco.

#### MEN-2 — `ARRAY_KEYS` duplicada em dois módulos
**Arquivos:** `mcp/lib/audit.ts:34-42` e `mcp/lib/freshness.ts:78`

A lista de chaves de array (`linhas`, `titulos`, `serie`, `contas`, `top`,
`familia`, `marca`) existe idêntica em `extractRowCount` (audit) e
`extractFirstArray` (freshness). São conceitualmente o mesmo contrato — "quais
chaves de `dados` carregam a coleção". Se uma tool futura usar uma chave nova,
é preciso lembrar de editar os **dois** lugares; esquecer um faz `rowCount`
divergir de `estado:vazio`. **Recomendação:** extrair para uma constante única
exportada (ex.: `mcp/lib/array-keys.ts`) e importar nos dois.

#### MEN-3 — `sessionStore` é populado mas nunca lido no caminho de execução
**Arquivos:** `mcp/auth/session-store.ts`, `mcp/server.ts:207,219,228`

`server.ts` faz `sessionStore.set(...)` em três pontos e `.delete(...)` no
`onclose`, mas `handleToolCall` **recarrega** o `UserContext` via
`resolveUserContext` a cada chamada (camada 6) — o valor guardado no
`sessionStore` nunca é consumido por `.get()` no fluxo de uma tool. O store é
efetivamente um registro vestigial. Não é bug (a recarga é o comportamento
correto e desejado pela spec 3.3), mas é estado morto que pode confundir um
mantenedor — sugere uma fonte de verdade que não é usada. **Recomendação:**
ou remover o `sessionStore` do caminho de execução (mantendo só o `sessionMap`
para o par MCP+transport), ou documentar explicitamente no arquivo que ele
existe apenas como ponto de extensão F5 e não é autoritativo.

#### MEN-4 — `docker-compose.yml`: `MCP_DB_PASSWORD` sem default quebra dev local silenciosamente
**Arquivo:** `docker-compose.yml:32`

`MCP_DATABASE_URL` é montada com `${MCP_DB_PASSWORD}` sem valor default
(diferente de `DB_PASSWORD:-nexus`). Se o desenvolvedor não definir
`MCP_DB_PASSWORD` no `.env`, a connection string nasce com senha vazia e o
container `mcp` falha a conexão com erro pouco óbvio. `MCP_SERVICE_TOKEN` tem
default dev, `MCP_DB_PASSWORD` não. **Recomendação:** ou dar um default dev
explícito (`${MCP_DB_PASSWORD:-nexus_mcp}`) coerente com o restante do compose
de dev, ou documentar no `.env.example`/runbook que a var é obrigatória mesmo
em dev. O `.env.example` diz "Obrigatória" — então alinhar o compose ou o
runbook de setup local.

#### MEN-5 — `mcp/lib/prisma.ts`: fallback para `DATABASE_URL` anula a camada 4 se mal configurado
**Arquivo:** `mcp/lib/prisma.ts:7`

O client do MCP faz `process.env.MCP_DATABASE_URL ?? process.env.DATABASE_URL`.
O comentário admite que é fallback "até 4f-1". Em produção, se `MCP_DATABASE_URL`
não estiver setada, o MCP conecta com a `DATABASE_URL` do role privilegiado —
anulando silenciosamente a camada 4 do RBAC (o risco que a própria spec lista,
#I6). Não é bug hoje (o compose seta `MCP_DATABASE_URL`), mas o fallback é um
pé-de-coelho de segurança. **Recomendação:** em `NODE_ENV=production`, exigir
`MCP_DATABASE_URL` e lançar erro se ausente — sem cair para `DATABASE_URL`.
Manter o fallback só fora de produção.

#### MEN-6 — `estoque_top_movimentados`: `kpis.totalProdutos` inconsistente com a lista `top` truncada
**Arquivo:** `mcp/tools/estoque/top-movimentados.ts:39-44`

A tool devolve `top` com `slice(0, 20)` mas `kpis.totalProdutos` é a contagem
**completa** do núcleo. Isso é intencional e correto (o KPI descreve o universo,
a lista é o top-20), mas a `descricao` da tool — "Top 20 produtos mais
movimentados" — não avisa o agente de que `totalProdutos` pode ser >20
enquanto `top` tem no máximo 20. Um agente pode somar `top` e reportar um
total errado. **Recomendação:** ajustar a `descricao` para explicitar que
`top` é truncado em 20 e `kpis.totalProdutos` é o universo completo, ou
renomear o KPI para algo inequívoco.

---

## Conformidade com a SPEC v3 — sem desvio material

Verificado contra `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md`:

- Container `mcp/` Node puro, `node:http` + `StreamableHTTPServerTransport`,
  porta 3100, não publicada — **conforme** (3.2, docker-compose).
- Service token constant-time + `X-Mcp-User-Id` por sessão — **conforme** (3.3.1).
- 3 fatos de financeiro + registry de builders + migração dos 3 de estoque —
  **conforme** (3.4, `registry.ts`).
- `diasAtraso` calculado na query, não materializado — **conforme** (3.4,
  `dias-atraso.ts`, `financeiro.ts`).
- Enums de `selection` como `String`, não enum Prisma — **conforme** (schema).
- 7 camadas de RBAC: 5 ativas, camadas 3 e 5 preparadas/no-op documentado —
  **conforme** (`mcp-rls.sql` comentado, role SQL sem `tenant_id`).
- Caminho 3: 3a/3b funcionais, 3c stub gated — **conforme**.
- `McpAuditLog` + `FeatureRequest`, sem expurgo (gap registrado) — **conforme**.
- Harness de integração Streamable HTTP exercendo os 4 perfis — **conforme**
  (`integration.test.ts`).
- Toolchains separadas (`next build` só para `app/`, `mcp/` build próprio) —
  **conforme** (`mcp/Dockerfile`, `mcp/tsconfig.json` autônomo).

Nenhuma decisão da spec foi omitida na implementação.

---

## Achados que bloqueiam o merge para produção

**Nenhum.** Os 7 achados são não-bloqueantes. Recomenda-se corrigir **IMP-1**
(bug latente no `fonteStatus`) e **MEN-5** (fallback de `DATABASE_URL` que
pode anular a camada 4) antes do deploy de produção, por serem os dois com
potencial de impacto silencioso. Os demais MENORES são follow-up de qualidade.
