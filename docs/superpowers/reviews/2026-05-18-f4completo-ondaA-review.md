# Review — F4 completo, Onda A (Schema + enum + GRANT)

**Data:** 2026-05-18
**Branch:** `feat/mcp-dominios-completos`
**Commits revisados:** `f216785`, `cf57ba3`, `7208148`, `ae42c53`, `3167e98`
**Plano:** `docs/superpowers/plans/2026-05-18-f4-completo.md` (ONDA A)
**SPEC v3:** `docs/superpowers/specs/2026-05-18-f4-completo-design.md` §3, §4
**Discovery (fonte de verdade do contábil):** `docs/superpowers/research/2026-05-18-f4-discovery-pre-schema.md`

## Veredito: APROVADO COM RESSALVAS

A Onda A está conforme ao plano e à discovery no que diz respeito ao schema,
migrations e GRANT. Foram encontrados **2 achados IMPORTANTES de regressão**
introduzidos pela ampliação de 4→9 domínios — ambos fora do escopo de tasks
da Onda A (A.1–A.5 só rodam `jest` em `src/lib`/`src/worker`), mas são
consequência direta da mudança e foram **corrigidos neste review**. Sem
correção, a suíte completa ficava com 1 teste vermelho e a criação de usuário
com os 5 domínios novos seria rejeitada em runtime.

## Contagem por severidade

| Severidade | Qtd |
|---|---|
| CRÍTICO | 0 |
| IMPORTANTE | 2 (ambos corrigidos no review) |
| MENOR | 1 |

---

## Conformidade — item a item

### 1. Migration isolada do enum (A.1) — CONFORME
`20260518105922_f4completo_enum_dominios/migration.sql` contém **apenas** 5
linhas `ALTER TYPE "ReportDomain" ADD VALUE` (`cadastros`, `contabil`, `rh`,
`crm`, `producao`). Zero `INSERT`/`UPDATE`/uso dos valores novos na mesma
migration — não há o erro de "unsafe use of new enum value" e `migrate deploy`
não quebra. `schema.prisma` enum espelha os 9 valores na ordem correta.

### 2. Os 6 modelos Prisma (A.3) — CONFORME
- `FatoPedido`, `FatoPedidoParcela`, `FatoNotaFiscal`, `FatoNotaFiscalItem`,
  `FatoParceiro` batem **literalmente** com o plano §A.3 (linhas 557-682):
  PKs `odooId @id`, monetários `Decimal(18,2)`, `atualizadoEm @default(now())`,
  índices conforme listados. `tipoMovimento` não-nulo com `@default("outro")`
  (achado P-I6) — correto. `entradaSaida` permanece `String?`.
- `FatoContaContabil` **diverge do bloco baseline do plano §A.3**, porém isso é
  **esperado e correto**: o próprio plano (linhas 540-545, 684-686) designa a
  discovery O.2/O.3 como fonte de verdade — "se a discovery registrou
  nomes/colunas diferentes, usar os da discovery". O modelo aplicado
  (`codigo`/`nome`/`tipo` NOT NULL, `nivel`, `natureza`, `contaPaiId`,
  `contaPaiNome`, `parentPath`, `caracteristicaSaldo`, `ehRedutora`) bate
  **verbatim** com a lista cravada na discovery (§"Lista final cravada de
  colunas"). Índices `tipo`/`natureza`/`contaPaiId` conforme. Nasce definitivo
  — sem modelo provisório nem migration de ajuste (achado P-C4 respeitado).
- Migration `20260518110146_f4completo_fatos_dominios/migration.sql`: só
  `CREATE TABLE` + `CREATE INDEX`, sem efeitos colaterais. Posterior à de enum.
  Monetários `DECIMAL(18,2)`, `atualizado_em DEFAULT CURRENT_TIMESTAMP`.

### 3. GRANT (A.4) — CONFORME
`prisma/sql/2026-05-17-mcp-role.sql` ganhou o bloco `-- 5b.` com
`GRANT SELECT` nos 6 fatos novos ao role `nexus_mcp`, inserido logo após
`fato_financeiro_titulo`. `GRANT SELECT` é idempotente (reaplicar não falha);
o script inteiro permanece reaplicável.

### 4. `domains.ts` (A.2) — CONFORME
9 domínios em `REPORT_DOMAINS` com labels pt-BR corretos
(`Cadastros`/`Contábil`/`RH`/`CRM`/`Produção`). `ALL_DOMAINS` derivado, sem
hardcode. `domains.test.ts` e `domain-access.test.ts` atualizados para 9
domínios sem regressão.

---

## Achados

### IMPORTANTE-1 — Regressão de teste: `access-step.test.tsx` (CORRIGIDO)
`src/components/users/access-step.test.tsx:24` esperava `toHaveLength(4)`
checkboxes. O componente `AccessStep` renderiza um checkbox por domínio de
`REPORT_DOMAINS` — agora 9 — então a suíte completa ficava **1 failed / 648**.
O implementador atualizou `domains.test.ts` e `domain-access.test.ts`, mas não
este. A task A.5 não pegou porque seu escopo de `jest` era só
`src/lib`/`src/worker`. **Corrigido:** asserção ajustada para `toHaveLength(9)`
com comentário explicando que o nº de checkboxes independe de `grantable`.

### IMPORTANTE-2 — Enum Zod desatualizado em `createUser` (CORRIGIDO)
`src/lib/actions/users.ts:73` validava `domains` com
`z.enum(["estoque","financeiro","fiscal","comercial"])` — literal de 4 valores.
Com 9 domínios, qualquer admin que tentasse criar um usuário concedendo
`cadastros`/`contabil`/`rh`/`crm`/`producao` receberia "Dados inválidos" em
runtime. Inconsistência funcional silenciosa (nenhum teste cobria o caminho).
`updateUserDomains` em `domain-access.ts:39` já fazia certo, derivando
`DOMAIN_IDS` de `REPORT_DOMAINS`. **Corrigido:** `users.ts` passou a usar o
mesmo padrão `DOMAIN_IDS = REPORT_DOMAINS.map(...)`, eliminando o hardcode.

### MENOR-1 — Escopo de verificação da task A.5 estreito demais
A task A.5 (Step 3) manda `npx jest src/lib src/worker`. Como a mudança de
domínios toca `src/components` (UI de RBAC), esse escopo deixa passar
regressões de componente — foi exatamente o que ocorreu (IMPORTANTE-1).
Recomendação para futuras ondas que alterem enums/contratos compartilhados:
rodar a suíte **completa** (`npx jest`) na verificação da onda.

---

## Verificação executada (suíte completa, pós-correções)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (raiz) | PASS (exit 0) |
| `npx tsc -p mcp/tsconfig.json` | PASS (exit 0) |
| `npx eslint src/ mcp/` | PASS (exit 0) |
| `npx jest` (suíte COMPLETA) | **89 suites / 648 testes — todos PASS** |

**Nota sobre o "316 testes" relatado pelo implementador:** era um
**subconjunto** (provavelmente `jest src/lib src/worker`, o escopo da task
A.5), não a suíte inteira. A suíte completa do projeto tem **648 testes em 89
suites** — confirmada verde após as duas correções deste review.

## Correções aplicadas neste review
- `src/components/users/access-step.test.tsx` — `toHaveLength(4)` → `9`.
- `src/lib/actions/users.ts` — `CreateUserInput.domains` agora usa `DOMAIN_IDS`
  derivado de `REPORT_DOMAINS` (import de `REPORT_DOMAINS`/`ReportDomainId`).

Recomenda-se commitar ambas com mensagem
`fix(f4completo): corrige regressões de 4→9 domínios (access-step test + enum Zod de createUser)`.
