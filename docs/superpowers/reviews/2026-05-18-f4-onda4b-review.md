# Code Review — F4 Onda 4b (Camada de fatos de financeiro)

> Revisão de conformidade + qualidade. Branch `feat/mcp-semantico`.
> Commits: `d576619`, `fe91439`, `857b22c`, `3186993`.
> Data: 2026-05-18. Não é carimbo — auditoria adversarial.

## Veredito: **REPROVADO**

Contagem: **3 CRÍTICO · 2 IMPORTANTE · 3 MENOR**

A refatoração do registry e a estrutura dos builders estão corretas e sem
regressão (`tsc` verde, `jest` 458/458 verde). **Porém os 3 builders de
financeiro mapeiam campos `raw` que NÃO existem nas fontes reais** — divergência
direta entre o código e a descoberta documentada da própria Task 4a.2
(`docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md`) e os JSONs de
discovery (`discovery/output/modelos/finan.*.json`). Os testes não pegaram isso
porque usam amostras `raw` fabricadas, não a forma real da fonte.

---

## CRÍTICO

### C1 — `fato-financeiro-saldo.ts`: PK usa `raw.id` em vez de `banco_id`

**Arquivo:** `src/worker/fatos/fato-financeiro-saldo.ts:24` (`bancoId: Number(raw.id)`).

**Problema.** A spec §3.4 define **"PK lógica: `bancoId`"** e a Task 4a.2 Step 3
documenta os `banco_id` distintos da fonte: `[2, 1, 3, 4, 5, 6, 7, 9]`. No
discovery real (`finan.banco.saldo.hoje`), `raw.id` é o id da linha do snapshot
(ex.: `1196`, `1184`, `1181`) e `raw.banco_id` é um many2one `[2, "Itaú / ..."]`.
O builder grava `bancoId = raw.id` (1196), não o id da conta bancária (2). A
coluna `bancoNome` já é extraída corretamente de `relNome(raw.banco_id)` — ou
seja, o builder lê `banco_id` para o nome mas ignora seu id para a PK. Resultado:
PK incoerente com o domínio, e qualquer join futuro por conta bancária quebra.

**Recomendação.** `bancoId: relId(raw.banco_id as OdooM2O)` (e tratar o caso
`null` — ver C3). Atualizar o teste para refletir a forma real.

### C2 — `fato-financeiro-saldo.ts`: lê `data_referencia` e `saldo_anterior`, campos inexistentes

**Arquivo:** `src/worker/fatos/fato-financeiro-saldo.ts:21,26,27`.

**Problema.** O mapper lê `raw.data_referencia` e `raw.saldo_anterior`. No
discovery real de `finan.banco.saldo.hoje` esses campos **não existem** — os
campos reais são `raw.data` (ex.: `"2026-05-14"`) e `raw.anterior` (ex.:
`-14433121.55`). Na amostra, `data_referencia` e `saldo_anterior` aparecem como
`None`. Consequência em produção: `dataReferencia` será **sempre `null`** e
`saldoAnterior` será **sempre `0`** — duas colunas inteiras zeradas/nulas
silenciosamente. A Task 4a.2 não nomeou explicitamente os campos `data`/`anterior`,
mas o builder deveria ter sido escrito contra a fonte real, não contra nomes
presumidos. A spec descreve `dataReferencia` como "a data do snapshot vinda do
Odoo".

**Recomendação.** `dataReferencia` ← `raw.data`; `saldoAnterior` ← `raw.anterior`.
Confirmar contra `discovery/output/modelos/finan.banco.saldo.hoje.json`.

### C3 — `fato-financeiro-titulo.ts`: `numeroDocumento` lê campo inexistente

**Arquivo:** `src/worker/fatos/fato-financeiro-titulo.ts:45`.

**Problema.** O mapper lê `raw.numero_documento`. Em `finan.pagamento.divida` o
campo `numero_documento` é **sempre `None`** na amostra; o campo com o número do
título preenchido é `raw.numero` (ex.: `"0-94380-001/1"`). Resultado: a coluna
`numeroDocumento` do fato — exibida nas tools `contas_a_receber`,
`contas_a_pagar` e `titulos_vencidos` (4d.5/4d.6/4d.7) — virá **sempre `null`**.

**Recomendação.** `numeroDocumento` ← `raw.numero` (fallback opcional para
`raw.numero_documento`). Confirmar contra
`discovery/output/modelos/finan.pagamento.divida.json`.

---

## IMPORTANTE

### I1 — `derivaTipo` ignora o campo `selection` `tipo` real da fonte

**Arquivo:** `src/worker/fatos/fato-financeiro-titulo.ts:32-35`.

**Problema.** O builder deriva `tipo` (`a_pagar`/`a_receber`) do sinal numérico
(`sinal < 0 → a_pagar`). A fonte `finan.pagamento.divida` possui um campo
`selection` `tipo` real com valor `"pagamento"` na amostra (4a.2 Step 1 presumiu
`"recebimento"` como o par). A descoberta 4a.2 foi ambígua aqui: o plano (Task
4b.4 Step 1) autoriza derivar "de `tipo`/`sinal`", então `sinal` é uma escolha
**defensável** — mas a 4a.2 só viu `sinal: -1` em toda a amostra (nenhum `+1`),
ou seja, a regra `sinal >= 0 → a_receber` **não foi validada empiricamente**. Há
risco real de o sinal ser `0`/`+1` para algo que não é "a receber", ou de a Tauga
usar outra convenção. O cabeçalho do arquivo afirma a regra como fato sem
qualquer evidência registrada.

**Recomendação.** Decidir entre: (a) mapear `tipo` direto do `selection`
(`"pagamento"→a_pagar`, `"recebimento"→a_receber`) — mais alinhado ao domínio; ou
(b) manter `sinal` mas **registrar na 4a.2** que a regra para `sinal >= 0` é
presunção não-verificada e abrir gatilho de revisão. Hoje a decisão está
implícita no código sem rastro na descoberta. As tools 4d.5/4d.6/4d.7 dependem do
valor literal de `tipo` — qualquer divergência entre o que o builder grava e o
que a tool filtra produz resultado vazio silencioso.

### I2 — `data` (saldo) é date-only; `new Date("2026-05-14")` introduz desvio de fuso

**Arquivo:** `fato-financeiro-saldo.ts:26`, `fato-financeiro-movimento.ts:29`,
`fato-financeiro-titulo.ts:46-48`.

**Problema.** Os campos de data do Odoo (`data`, `data_documento`,
`data_vencimento`, `data_pagamento`) são **date-only** (`"2026-05-14"`).
`new Date("2026-05-14")` é interpretado pela engine como **meia-noite UTC**; em
fuso GMT-3 (servidor/Brasil) isso vira `2026-05-13 21:00` local. Toda comparação
de data nas tools de vencidos (`dataVencimento < hoje`, `diasAtraso`) e qualquer
agregação por dia/mês fica sujeita a deslocamento de um dia na borda. Os builders
de estoque podem ter o mesmo padrão, mas para títulos vencidos (cálculo de
`diasAtraso`) o erro é materialmente visível.

**Recomendação.** Normalizar para meio-dia local ou usar um parser date-only
explícito (ex.: `new Date(`${s}T00:00:00`)` força hora local, ou um helper
compartilhado). Padronizar com os builders de estoque e cobrir com teste de borda.

---

## MENOR

### M1 — `try/catch` redundante e assimétrico em `processors.ts`

**Arquivo:** `src/worker/sync/processors.ts:66-70` vs `:103`.

`processIncrementalCycle` envolve `runBuilders` em `try/catch`;
`processSnapshotCycle` chama direto. Como `runBuilders` já isola cada builder
internamente com `try/catch` (`registry.ts:36-41`), o `catch` externo só captura
falha fora do loop (improvável). A assimetria entre os dois ciclos é ruído.
**Recomendação:** remover o `try/catch` externo do incremental, ou aplicar nos
dois — escolher um padrão.

### M2 — Testes validam o mapper contra forma `raw` fabricada, não a fonte real

**Arquivos:** `fato-financeiro-saldo.test.ts:9-17`, `fato-financeiro-titulo.test.ts`,
`fato-financeiro-movimento.test.ts`.

Os testes usam objetos `raw` montados à mão com os campos que o mapper espera
(`id`, `banco_id`, `data_referencia`, `saldo_anterior`...). Por isso passam
mesmo com os bugs C1–C3: o teste e o código compartilham o mesmo schema
incorreto. **Recomendação:** derivar pelo menos um caso de teste de uma amostra
real recortada de `discovery/output/modelos/finan.*.json` (ou do banco), para que
o teste seja oráculo independente do mapper.

### M3 — Cabeçalho de `fato-financeiro-titulo.ts` afirma regra de `sinal` como fato

**Arquivo:** `fato-financeiro-titulo.ts:3`.

O comentário `"sinal < 0 → a_pagar; sinal >= 0 → a_receber"` é apresentado como
verdade estabelecida, mas a 4a.2 não observou nenhum `sinal >= 0`. Ver I1.
**Recomendação:** marcar como presunção e referenciar o gatilho de revisão.

---

## Conformidade — itens OK

- `markFatoBuilt(tx, ...)` está **dentro** do `$transaction` nos 3 builders (achado I3 — OK).
- Filtro `where: { rawDeleted: false }` presente nos 3 (OK).
- `createMany({ data: mapped })` sem injetar `atualizadoEm` — coerente com `@default(now())` no schema (decisão N5 — OK).
- Valores monetários são `Number(...)` no mapper → `Decimal @db.Decimal(18,2)` no schema (OK; nunca `Float` para dinheiro).
- `tipo`/`situacao`/`situacaoSimples` tratados como `String`, não enum (decisão #MN-2 — OK).
- `FatoFinanceiroMovimento` sem coluna `natureza` — coerente com 4a.2 Step 2 (realizado e previsto coexistem na linha — OK).
- Registry: `runBuilders` isola falha por builder com `try/catch` + log idêntico ao `processors.ts` antigo (OK, achado I4).
- Refactor de estoque: os 3 builders de estoque migrados sem mudança de comportamento — mesma ordem, mesmo log, mesmo `try/catch` por builder (sem regressão, achado verificado no diff de `d576619`).
- `runBuilders("incremental")` é chamado após o loop de sync em `processIncrementalCycle` (OK, achado I5); `runBuilders("snapshot")` idem em `processSnapshotCycle`.
- `FatoFinanceiroMovimento` mapeia `entrada`/`saida`/`valor`/`*_prevista` — todos batem com os campos reais de `finan.fluxo.caixa` (OK — este builder é o único sem bug de campo).

## Verificação

- `npx tsc --noEmit` → **exit 0** (verde).
- `npx jest` → **67 suites, 458 testes, todos verdes**. Sem regressão.
- Ressalva: a suíte verde **não atesta correção funcional** dos builders de saldo
  e título — ver M2. Os bugs C1–C3 só apareceriam com teste contra a fonte real.
