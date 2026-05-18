# Mapa de domínios do Odoo Tauga — base do escopo do MCP (F4 completo)

> Levantado em 2026-05-18 a partir do censo completo da F0
> (`discovery/output/censo.md`, 650 modelos) cruzado com o cache atual.
> Define o que o MCP semântico tem, de fato, como cobrir.

## 1. Domínios de negócio COM dado operacional → o MCP cobre

| Domínio | Prefixo Odoo | Modelos | Registros | Estado no MCP |
|---|---|---|---|---|
| **Estoque** | `estoque.*` | 16 | 77.642 | ✅ feito (F4 onda 1) |
| **Financeiro** | `finan.*` | 44 | 11.604 | ✅ feito (F4 onda 1) |
| **Fiscal** | `sped.*` | 140 | 451.902 | ⬜ a fazer — notas fiscais, itens, participantes |
| **Comercial / Pedidos** | `pedido.*` | 26 | 18.395 | ⬜ a fazer — pedidos de venda/compra, parcelas, etapas |
| **Cadastros** | `res.*` | 26 | 9.006 | ⬜ a fazer — clientes/parceiros (`res.partner`), empresas |
| **Contábil** | `contabil.*` | 29 | 8.094 | ⬜ parcial — só **plano de contas** (ver §3) |

## 2. Domínios que o cliente CITOU mas que estão VAZIOS no Odoo

> Informação crítica e verdadeira: estes módulos **existem instalados** no
> Odoo da Matrix, mas **não têm nenhum registro** — não são operados.

| Domínio | Prefixo | Modelos | Registros |
|---|---|---|---|
| **RH** | `rh.*` | 19 | **0** |
| **CRM** | `crm.*` | 2 | **0** |
| **Produção** | `producao.*` | 5 | 1 |
| Projeto | `projeto.*` | 2 | 0 |
| Chamado / OS | `chamado.*` | 2 | 0 |
| WMS | `wms.*` | 6 | 0 |

O cliente mencionou "módulo de RH, CRM, Contratos" como domínios a cobrir. A
realidade do dado: **RH e CRM não têm um único registro**. O MCP pode expor
tools para eles, mas elas responderão sempre vazio até a Matrix passar a
operar esses módulos no Odoo. "Contratos" não é um módulo separado — contratos
de venda/compra vivem dentro de `pedido.*` (campo `tipo` do pedido).

## 3. Contábil — só estrutura, sem movimento

`contabil.lancamento` (Lançamento Contábil) = **0 registros**;
`contabil.demonstracao`, `contabil.encerramento` = 0. Os 8.094 registros de
`contabil.*` são quase todos o **plano de contas** (`contabil.conta` 934,
`contabil.conta.arvore` 4.955, `contabil.conta.referencial` 2.204). O MCP
cobre a *estrutura* do plano de contas; não há movimento contábil para
perguntas de saldo/resultado/balanço.

## 4. Não são domínios de negócio (infraestrutura Odoo — fora do MCP)

`auditoria.*` (12,7 mi — log interno), `ir.*` (203k — internals do Odoo),
`mail.*`/`discuss.*`/`bus.*` (mensageria), `ks_dashboard_ninja.*`/`relatorio.*`/
`report.*` (dashboards do próprio Odoo), `api.*` (logs de API). Nada disso é
pergunta de gestor — fica fora do catálogo de tools (a cauda longa é o 3c).

## 5. Escopo real do "F4 completo"

O MCP cobrir "100% do que temos acesso" se traduz em:

1. **Fiscal** — fatos + tools de notas fiscais (emitidas/recebidas,
   faturamento, impostos, participantes).
2. **Comercial** — fatos + tools de pedidos (venda/compra, valor, etapa,
   pedidos em atraso, parcelas).
3. **Cadastros** — tools de clientes/parceiros (`res.partner`) e empresas.
4. **Contábil** — tool(s) de estrutura do plano de contas.
5. **RH, CRM, Produção** — tools podem ser criadas (decisão do cliente:
   "criar tudo mesmo sem dado"), mas responderão vazio enquanto não houver
   operação. Marcadas como "domínio sem dado" honestamente na resposta.
6. **Caminho 3c funcional** — Postgres MCP read-only para a cauda longa.

> Pode ser necessário **estender a ingestão (F2)** para sincronizar modelos de
> `sped`/`pedido`/`res` que ainda não estão no cache (hoje 79 tabelas `raw`;
> esses domínios têm muito mais modelos). Isso é dimensionado na spec do F4
> completo.
