# RADAR — pendências conhecidas a resolver

> Itens identificados que **não bloqueiam** a entrega atual, mas precisam ser
> resolvidos antes de marcos seguintes. Revisar a cada nova onda/fase.

---

## ~~R1 — Fonte de "contas a receber/pagar" pode ser a tabela errada~~ RESOLVIDO

**Aberto desde:** 2026-05-18 (teste end-to-end da F4 onda 1).
**Resolvido em:** 2026-05-18 — commit `fix(f4): re-source fato_financeiro_titulo para finan.lancamento`.

### Diagnóstico confirmado

`fato_financeiro_titulo` era derivado de `raw_finan_pagamento_divida` (eventos
de pagamento — ~21 registros abertos, `vr_saldo` ≈ 0 nos abertos). A fonte
correta é **`raw_finan_lancamento`** (`finan.lancamento` — carteira de títulos):
- `tipo='a_receber' situacao_divida_simples='aberto'`: 120 títulos, R$ 1.164.266,36
- `tipo='a_pagar'  situacao_divida_simples='aberto'`:  18 títulos, R$    95.694,95
- Para título aberto: `vr_saldo == vr_documento == vr_total`.

### Correção aplicada

- **Builder** (`src/worker/fatos/fato-financeiro-titulo.ts`): fonte trocada para
  `rawFinanLancamento`, filtro `tipo IN ('a_receber','a_pagar')`, tipo mapeado
  direto (não derivado de `sinal`), `vrSaldo` agora é o valor correto.
- **Queries** (`src/lib/reports/queries/financeiro.ts`): `vrSaldo` re-adicionado
  ao output; `totalAReceber`/`totalAPagar`/`totalVencido` usam `vrSaldo`.
- **Handlers MCP** (3 tools de título): `tituloSchema` inclui `vrSaldo`; shape
  serializa `vrSaldo`.
- **Testes** (builder + queries + handlers): fixtures atualizados para o formato
  real de `finan.lancamento`; novos casos cobrem filtro de caixa descartado.

---

## R2 — Verificação por dado real, não só review de código

**Aberto desde:** 2026-05-18.

Os 2 bugs de financeiro da F4 onda 1 (critério "em aberto" errado; valor
somando `vr_saldo` ~zero) **passaram por 12 reviews adversariais** e só foram
pegos rodando o MCP contra o cache real. Lição: review de código não cobre
premissas sobre o dado.

### Ação

Toda onda de domínio novo (comercial, fiscal, contábil, produção) deve incluir,
na etapa de verificação, um **teste end-to-end contra o cache real** — popular
os fatos, subir o servidor, exercer as tools e conferir os números — não só
`tsc`/`eslint`/`jest`/code-review.

---

## R3 — Contábil e Produção quase não têm dado no cache

**Aberto desde:** 2026-05-18 (levantamento dos domínios restantes da F4).

Levantamento das tabelas `raw` por domínio que falta cobrir no MCP:

| Domínio | Tabelas `raw` | Volume |
|---|---|---|
| **Comercial** (pedidos) | `pedido_documento` (71), `pedido_parcela` (1.925), `pedido_etapa` (203), `pedido_documento_historico` (8.054), `pedido_operacao` (36) | substancial — domínio real |
| **Fiscal** (SPED) | `sped_documento` (3.743 notas), `sped_documento_item` (211.385), `sped_documento_pagamento` (36.141), `sped_participante` (6.516)… (40 tabelas) | substancial — domínio real |
| **Contábil** | `contabil_conta` (934), `contabil_conta_referencial` (2.204) | **só o plano de contas** — não há tabela de lançamentos contábeis no cache |
| **Produção** | `producao_processo` (1) | **1 único registro** — praticamente inexistente |

### Implicação — confirmado pelo censo F0 (não é gap de sync)

Verifiquei o censo completo do Odoo (`discovery/output/censo.md`): o dado
contábil/produção **não existe na instância Odoo**, não é só não-sincronizado.

- **Contábil:** `contabil.lancamento` (Lançamento Contábil) = **0 registros**;
  `contabil.demonstracao`, `contabil.encerramento`, `contabil.operacao` = 0.
  Só o **plano de contas** tem dado (`contabil.conta` 934, `…referencial`
  2.204, `…arvore` 4.955). A Matrix **não opera o módulo de contabilidade** no
  Odoo.
- **Produção:** `producao.processo` = 1; todos os demais modelos `producao.*`
  = 0. A empresa **movimenta/entrega** equipamento de academia — não fabrica.

### Decisão de escopo

"MCP 100% de todos os domínios" se traduz, na realidade do dado, em:
- **Comercial** (pedidos) e **Fiscal** (notas SPED) — domínios reais, dado rico
  → tools semânticas completas.
- **Contábil** — apenas tool(s) de *estrutura do plano de contas* (referência),
  pois não há movimento. Ou omitir até o cliente operar contabilidade no Odoo.
- **Produção** — sem dado; nada a expor. Omitir.
- O **Caminho 3c (modo BI)** cobre a cauda longa: qualquer pergunta fora das
  tools, inclusive sobre o que houver de contábil/produção, cai no SQL
  controlado.

Pendente: aval do usuário sobre cobrir contábil (plano de contas) e omitir
produção, ou aguardar dado.

---

## R4 — GRANTs SQL fora do `prisma migrate` — passo obrigatório no runbook de deploy

**Aberto desde:** 2026-05-18 (code review final F4 completo — IMP-2).

Os `GRANT SELECT` das tabelas de fato e os roles `nexus_mcp` / `nexus_mcp_bi`
**não vivem no `prisma migrate`** — foram aplicados em scripts SQL avulsos:

- `prisma/sql/2026-05-17-mcp-role.sql` — cria o role `nexus_mcp`, concede
  `CONNECT` no banco e `SELECT` nas tabelas `fato_*` e de suporte.
- `prisma/sql/2026-05-17-mcp-bi-role.sql` — cria o role `nexus_mcp_bi` (Caminho
  3c / modo BI), concede `SELECT` em todas as tabelas do schema `public`.

### Risco

Se o container `mcp` subir após um `prisma migrate deploy` em ambiente limpo
(novo deploy, novo banco), os GRANTs não existem → o usuário Postgres do MCP
recebe `permission denied` em qualquer query nas tools novas → todas as tools
de fato retornam erro em vez de dados.

### Ação no runbook de deploy assistido

Após `prisma migrate deploy`, (re)executar **obrigatoriamente**:

```bash
psql "$DATABASE_URL" -f prisma/sql/2026-05-17-mcp-role.sql
psql "$DATABASE_URL" -f prisma/sql/2026-05-17-mcp-bi-role.sql
```

Ordem importa: o migrate deve rodar antes (garante que as tabelas existem);
os scripts de GRANT rodam depois. Em Portainer/CI, adicionar como step
pós-migrate no script de deploy.
