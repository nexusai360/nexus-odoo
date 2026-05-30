# Reviews da SPEC O3 (Pedido , histórico de etapas)

> Alvo: `docs/superpowers/specs/2026-05-30-o3-pedido-spec.md`. Review #1 conceitual
> + review #2 aterrada no dado real (introspecção JSON-RPC de
> `pedido.documento.historico`). Geram a v3.

## Review #2 (dado real , decisiva)

Shape real de `pedido.documento.historico` (9.173 reg, 1.642 pedidos, máx 30
linhas/pedido): **log append-only, 1 linha por mudança de etapa**, etapa de DESTINO.

Campos reais: `pedido_id` (m2o→pedido.documento), `etapa_id` (m2o→pedido.etapa),
`etapa_tipo` (selection), `data_ultima_etapa` (entrada na etapa), `data_proxima_etapa`
(saída), **`tempo_etapa` (INT em dias, já calculado pelo Odoo)**, `create_uid`,
`create_date`.

### Achados aplicados na v3
- **O3-B1:** a SPEC inventou nomes (`dataEntrada`, "duração calculada na query"). O
  real traz duração pronta (`tempo_etapa`), entrada (`data_ultima_etapa`) e saída
  (`data_proxima_etapa`). Sem lag necessário. Corrigir os nomes.
- **O3-B2:** FK é **`pedido_id`** (não `documento_id`, que não existe).
- **O3-B3:** sem campo de nome de etapa/usuário; usar `etapa_id[0]` como chave +
  `etapa_id[1]` como label (ou join na dim etapa); usuário = `create_uid`.
- **O3-B4 (saneamento):** `tempo_etapa` tem **204 valores negativos** (data_proxima <
  data_ultima). Sanear no builder com `GREATEST(tempo_etapa, 0)` para não corromper
  médias/somas.
- **O3-B5 (semântica):** loops de retrabalho (ex.: pedido 821, 30 eventos / ~6 etapas
  distintas). `pedido_historico_etapas` mostra o log cru + um agregado por etapa
  (soma de `tempo_etapa`). "Soma das durações ~ tempo total" só fecha somando TODAS
  as linhas.
- **O3-B6 (overlap):** as 2 tools são distintas das existentes (`tempo_medio_fechamento`
  = tempo total agregado; `pedidos_atrasados` = parcela vencida/financeiro;
  `pedidos_por_etapa` = headcount por etapa atual). **Renomear/descrever**
  `pedido_travados_por_etapa` como travamento de **processo/fluxo**, não financeiro,
  para o Router não confundir com `pedidos_atrasados`.
- **Infra:** `RawPedidoDocumentoHistorico` (schema.prisma:639) + `pedido.documento.historico`
  no catálogo (model-catalog.ts:43) JÁ existem. **O3 não precisa de migration de raw,
  só do fato.**

## Review #1 (conceitual)
- Escopo honesto confirmado: cotação/proposta = Balde B vazio (fora); pedido/parcela
  já F4-cobertos; único gap Balde A = o histórico de etapas. OK.
- Proporcionalidade: metodologia completa justificada (fato + 2 tools sobre dado real).

## Shape final do FatoPedidoHistorico (v3)
| Campo | Origem | Tipo |
|---|---|---|
| odooId | id | Int @id |
| pedidoId | pedido_id[0] | Int |
| etapaId | etapa_id[0] | Int? |
| etapaNome | etapa_id[1] | String? |
| etapaTipo | etapa_tipo | String? |
| dataEntrada | data_ultima_etapa | DateTime? |
| dataProxima | data_proxima_etapa | DateTime? |
| tempoEtapaDias | GREATEST(tempo_etapa,0) | Int |
| usuarioId | create_uid[0] | Int? |
| criadoEm | create_date | DateTime? |

Tools: `pedido_historico_etapas` (log + agregado por etapa de 1 pedido),
`pedido_travados_por_etapa` (último evento por pedido onde `now - data_ultima_etapa
> N dias`; descrição deixa claro: processo, não financeiro).
