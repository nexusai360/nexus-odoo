# SPEC, Onda O4: Financeiro , resultado por conta gerencial (DRE gerencial)

> **Versão:** v3 (2026-05-30). Aterrada na auditoria de cobertura + introspecção
> JSON-RPC ao vivo (`reviews/2026-05-30-o4-financeiro-review.md`).
> **Onda:** O4 do roadmap. **Branch:** `feat/router-ativacao-r2`.

## 1. Achado de cobertura (aterrado no dado)

A F4 já entrega 7 tools financeiras + 3 fatos. Auditoria dos 7 `finan.*` Balde A:

| Modelo | Balde A | Coberto? |
|---|---:|---|
| finan.fluxo.caixa | 16834 | SIM (FatoFinanceiroMovimento + fluxo-caixa/caixa-periodo) |
| finan.lancamento | 10015 | SIM (FatoFinanceiroTitulo + contas a pagar/receber/vencidos/liquidez) |
| **finan.lancamento.item** | **9663** | **NÃO , raw órfão, sem fato** |
| finan.pagamento.divida | 1672 | NÃO (abandonado no R1; é baixa/quitação, vr_saldo=0) , CORTAR |
| finan.banco.extrato | 1591 | NÃO, mas é linha de saldo (overlap com FatoFinanceiroSaldo) , CORTAR |
| finan.banco.saldo | 238 | indireto (FatoFinanceiroSaldo via saldo.hoje) |
| finan.conta | 66 | dimensão, já desnormalizada , CORTAR isolado |

**Único gap de alto valor:** `finan.lancamento.item` (9663) , a quebra por **conta
gerencial** (`conta_id` → finan.conta) e **centro de resultado** (`centro_resultado_id`).
Nenhuma tool atual responde "quanto por conta gerencial (DRE gerencial)" , todas dão
totais agregados sem essa quebra. É um eixo analítico NOVO, não duplicação.

## 2. Escopo (mínimo honesto)

- **1 fato: `FatoFinanceiroLancamentoItem`** (`@@map("fato_financeiro_lancamento_item")`),
  fonte `raw_finan_lancamento_item` (já no MODEL_CATALOG). Campos reais:
  `odooId`(id), `lancamentoId`(lancamento_id[0]), `tipo` (**herdado do lançamento
  pai** via join no builder; item não tem tipo próprio , a_receber/a_pagar/...),
  `contaId`/`contaNome`(conta_id), `centroResultadoId`/`centroResultadoNome`(centro_resultado_id),
  `descricao`, `pedidoId`(pedido_id[0]), `vrDocumento`(vr_documento), `vrTotal`(vr_total),
  `vrSaldo`(vr_saldo), `vrPagoTotal`(vr_pago_total), `dataEmissao` (do pai, p/ filtro
  por período). Índices: contaId, centroResultadoId, tipo, dataEmissao.
- **Builder `fato-financeiro-lancamento-item.ts`**: lê `rawFinanLancamentoItem` +
  monta um Map `lancamentoId → { tipo, dataEmissao }` a partir de `rawFinanLancamento`
  (o pai), e enriquece cada item. Registry + FATO_FONTE. Cycle incremental.
- **1 tool core: `financeiro_resultado_por_conta`** (domínio financeiro): agrega
  `vrTotal`/`vrPagoTotal` por `contaNome`, separando despesa (a_pagar/pagamento) de
  receita (a_receber/recebimento), filtro opcional de período e tipo. DRE gerencial
  simplificada. Não sobrepõe as 7 atuais.
- **2ª tool condicional `financeiro_por_centro_resultado`**: só se `centro_resultado_id`
  for preenchido na maioria das linhas (validar no E2E; amostra veio false → provável
  CORTE). Decisão final no E2E contra o dado.

## 3. Fora de escopo (cortado, com dado)

`finan.banco.extrato` (linha de saldo, overlap FatoFinanceiroSaldo), `finan.pagamento.divida`
(baixa, abandonado no R1), `finan.conta` isolado (dimensão). Demais finan.* são Balde B
vazio (remessa/retorno/cheque/pix/demonstracao com 0..8 registros) , onda futura gated
por ativação.

## 4. Verificação (dado real)

- tsc/eslint/jest verdes; migration (1 fato) aplicada via workaround de drift.
- Builder popula `fato_financeiro_lancamento_item` (~9663) contra o raw; `tipo`
  herdado corretamente (não-nulo na maioria).
- E2E: `financeiro_resultado_por_conta` soma por conta coerente; validar se
  `centroResultadoId` é preenchido (decide a 2ª tool).
- Catálogo +1 ou +2 tools; BI_SCHEMA_REFERENCE; vocab Router; rebuild pasta principal.

## 5. Decisões
D1. O4 = DRE gerencial por conta (finan.lancamento.item), único gap real de Balde A.
D2. `tipo` herdado do lançamento pai no builder (item não tem tipo).
D3. extrato/pagamento.divida/conta cortados por overlap/baixo valor (auditoria).
D4. 2ª tool (centro de resultado) condicional ao dado real.
