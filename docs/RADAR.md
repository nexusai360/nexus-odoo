# RADAR — pendências conhecidas a resolver

> Itens identificados que **não bloqueiam** a entrega atual, mas precisam ser
> resolvidos antes de marcos seguintes. Revisar a cada nova onda/fase.

---

## R1 — Fonte de "contas a receber/pagar" pode ser a tabela errada

**Aberto desde:** 2026-05-18 (teste end-to-end da F4 onda 1).
**Resolver antes de:** F5 (WhatsApp) — quando um gestor vai ler números de
financeiro para decisão. Idealmente já na próxima onda de financeiro/comercial.

### O problema

`fato_financeiro_titulo` (que alimenta as tools `financeiro_contas_a_receber`,
`financeiro_contas_a_pagar`, `financeiro_titulos_vencidos`) é derivado de
**`finan.pagamento.divida`** — modelo cujo nome no Odoo é *"Pagamento de
Dívida"*. Cada linha é um **evento de pagamento**, não um título em aberto.

Sintomas no dado real do cache (1.146 registros):
- Apenas ~21 registros têm `situacao_simples = 'aberto'`.
- O saldo devedor (`vr_saldo`) vem ~zero para os títulos em aberto — por isso as
  tools passaram a usar `vr_total` (fix `c814a84`).
- Total "a receber em aberto" apurado: ~R$ 254 mil — baixo demais para uma
  operação com R$ 52 mi em estoque. Provável foto incompleta.

### Hipótese

A carteira real de contas a receber/pagar em aberto provavelmente vive em outro
modelo do Odoo. Candidatos a investigar (estão no cache `raw`):
- `finan.lancamento` (208 linhas) — "Base para código de barras de boleto".
- `finan.lancamento.item` (7.858 linhas).
- `finan.fluxo.caixa` (591) — já usado por `fato_financeiro_movimento`.

### Ação

Na próxima onda de financeiro/comercial: investigar qual modelo do Odoo é a
fonte canônica de **títulos em aberto** (duplicatas a receber/pagar), e
trocar/complementar a fonte de `fato_financeiro_titulo`. As tools e o catálogo
já estão prontos — muda só o builder e o fato.

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
