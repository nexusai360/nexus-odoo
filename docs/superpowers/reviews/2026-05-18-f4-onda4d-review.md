# Review — F4 Onda 4d (Financeiro)

**Data:** 2026-05-18
**Escopo:** Onda 4d do plano `docs/superpowers/plans/2026-05-17-f4-mcp-semantico.md`,
spec §3.5.3/§3.9. Commits `c570f4f` → `18eb80f`.
**Veredito:** APROVADO COM RESSALVAS

## Verificação automatizada

- `npx tsc --noEmit` — verde.
- `npx tsc -p mcp/tsconfig.json` — verde.
- `npx jest` — 85 suites, 569 testes, todos verdes (42 cobrem 4d).

## Conformidade

- 6 tools de financeiro presentes, registradas em `mcp/tools/financeiro/index.ts`
  e somadas ao catálogo (`mcp/catalog/index.ts` — import `financeiroTools`
  descomentado, confirmado).
- Cada tool tem `inputSchema`, `outputSchema`, `inputSchemaShape`, `dominio:
  "financeiro"`, `withFreshness` com a lista de fatos correta.
- `id`s batem com a assertiva de 14 tools de 4f-4.
- Perguntas-alvo da spec §3.5.3: todas atendidas pelo conjunto de tools.
- Critério "não pago" = `{ dataPagamento: null }` — bate com
  `research/2026-05-17-f4-financeiro-fontes.md` Step 4 e com o builder
  `fato-financeiro-titulo.ts`.
- `tipo` (`a_pagar`/`a_receber`) derivado do campo selection real, não do
  `sinal` — coerente com `research/2026-05-18-f4-financeiro-sinal-tipo.md`.
- Campos `Decimal` convertidos via `Number()` no shaping da query; somas em
  `number`. Sem perda observável nos volumes do projeto.
- `diasAtraso` calculado na query (não materializado) — conforme decisão.
- `queryCaixaPeriodo` soma `entrada`/`saida` realizados; `queryFluxoCaixa` usa
  `valor`/`valorPrevisto` — realizado vs. previsto correto, alinhado ao builder
  de `fato_financeiro_movimento`.

---

## Achados

### IMPORTANTE

**I-1 — `queryTitulosVencidos` conta título que vence hoje como vencido (fuso/limite).**
Arquivo: `src/lib/reports/queries/financeiro.ts` (`queryTitulosVencidos`), tool
`mcp/tools/financeiro/titulos-vencidos.ts`.
Problema: o `where` usa `dataVencimento: { lt: hoje }` com `hoje = new Date()`
(timestamp com componente de hora, ex. `2026-05-18T14:30:00-03:00`). As datas de
vencimento são gravadas pelo builder com sufixo `T00:00:00` (início do dia
local). Logo, um título que vence **hoje** (`2026-05-18T00:00:00`) satisfaz
`< 2026-05-18T14:30:00` e é classificado como **vencido** — quando, pela função
`diasAtraso`, ele tem 0 dias de atraso (não está vencido). Resultado: a tool
inclui no resultado e em `totalVencido` títulos que vencem hoje, e esses títulos
aparecem com `diasAtraso: 0`. Há incoerência interna na própria resposta
(listado como "vencido" mas com 0 dias de atraso). O teste de query passa só
porque o mock usa `hoje = new Date("2026-05-18")` (meia-noite UTC) e vencimentos
de meses anteriores — não cobre o caso de borda.
Recomendação: normalizar `hoje` para início do dia antes do `where`, ou usar
`{ lt: inicioDoDia(hoje) }`. Coerência desejada: um título conta como vencido
somente quando `diasAtraso > 0`. Ajustar a query e adicionar teste de borda
(vencimento == hoje → não vencido; vencimento == ontem → vencido). Observação: o
plano 4d.7-q também especifica `{ lt: hoje }` literalmente — o desvio está no
plano; corrigir nos dois.

**I-2 — Regra "vazio" não cobre `financeiro_saldo_contas` nem `financeiro_caixa_periodo`.**
Arquivo: `mcp/lib/freshness.ts` (`ARRAY_KEYS_PRIORITY`), tools `saldo-contas.ts`
e `caixa-periodo.ts`.
Problema: `withFreshness` decide "vazio" inspecionando o primeiro array de
`dados` entre `["linhas","titulos","serie","contas","top","familia","marca"]`.
- `financeiro_saldo_contas` devolve `{ contas, saldoTotal }` — `contas` está na
  lista, então banco sem nenhuma conta → `estado: "vazio"`. OK.
- `financeiro_caixa_periodo` devolve `{ entrada, saida, saldo }` — **nenhum
  array**. `extractFirstArray` retorna `null` → `estado` sempre `"ok"`, mesmo
  quando não há nenhum movimento no período (período sem dados retorna
  `entrada:0, saida:0, saldo:0` com estado `"ok"`).
Isso pode ser intencional (caixa zerado é um resultado válido, não "vazio"), mas
não há decisão registrada para essa tool escalar. A spec §3.9 trata "vazio" como
estado de primeira classe; uma tool de agregação escalar nunca emitir "vazio" é
um desvio silencioso da regra. `financeiro_fluxo_caixa` está coberto (`serie`).
Recomendação: decidir explicitamente — ou (a) documentar no código de
`caixa-periodo.ts` que a tool nunca emite "vazio" por ser escalar (no-op
explícito, como feito com o tenant scoping), ou (b) passar um predicado `isVazio`
que considere `entrada === 0 && saida === 0`. Preferir (a) com comentário, para
não inventar semântica. O ponto material é a ausência de decisão registrada.

### MENOR

**M-1 — `extractFirstArray` é frágil a colisão de chaves entre domínios.**
Arquivo: `mcp/lib/freshness.ts`.
A heurística por nome de chave funciona hoje, mas qualquer tool futura cujo
`dados` tenha um array auxiliar com nome da lista (ex. um array de avisos
chamado `linhas`) decidiria "vazio" pelo array errado. Não é bug atual.
Recomendação: ao expandir o catálogo (ondas 4e+), preferir passar `isVazio`
explícito nas tools com `dados` não-triviais, em vez de depender da prioridade
de chaves.

**M-2 — `participanteId` aceito mas não validado contra existência.**
Arquivo: `contas-a-receber.ts` / `contas-a-pagar.ts`.
`participanteId` inexistente retorna `titulos: []` + total 0 com `estado:
"vazio"` — indistinguível de "participante existe mas não tem títulos". Aceitável
para um MCP de leitura; registrar como limitação conhecida caso a F5 precise
diferenciar.

**M-3 — Cobertura de teste: valores negativos e datas.**
Arquivo: `financeiro.test.ts`.
Os testes de query não exercitam `vrSaldo` negativo (estorno/crédito) nem
`saldo` de conta negativo. `diasAtraso` cobre bordas bem. Recomenda-se um caso
com valor negativo para fixar que a soma não o trata como anomalia.

---

## Desvios de processo relatados

- **`-q`/`-t` no mesmo commit:** o plano define tasks `-q` e `-t` separadas com
  commit próprio cada. Os commits da onda agregam query+tool. Desvio de
  granularidade de commit — sem impacto em corretude; o histórico fica mais
  grosso que o planejado. Aceitável, registrado.
- **Testes de query escritos todos de uma vez:** o ciclo TDD por task pede
  teste-falhando antes de cada implementação. Escrever a suíte inteira de uma
  vez não invalida o resultado (todos verdes, cobertura razoável), mas reduz a
  garantia de que cada teste já falhou antes da implementação. Aceitável dado o
  resultado final verde; registrado como desvio de método.

---

## Contagem

- CRÍTICO: 0
- IMPORTANTE: 2 (I-1, I-2)
- MENOR: 3 (M-1, M-2, M-3)

Nenhum bloqueador. I-1 deve ser corrigido antes do fechamento da F4 (afeta
corretude da resposta ao usuário). I-2 exige uma decisão registrada.
