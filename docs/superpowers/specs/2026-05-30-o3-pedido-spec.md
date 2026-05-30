# SPEC, Onda O3: Pedido , histórico de etapas (complemento)

> **Versão:** v1 (2026-05-30). **Onda:** O3 do roadmap. **Branch:** `feat/router-ativacao-r2`.
> **Insumo:** `discovery/odoo-schema/baldes.json` (R2) + auditoria de cobertura F4.

---

## 1. Achado de cobertura (aterrado no dado + F4)

Pedido é o domínio mais coberto pela F4. Já existem **17 tools comerciais**
(`mcp/tools/comercial/`: contar-pedidos, pedidos-periodo, pedidos-por-etapa,
pedidos-por-vendedor, pedidos-por-uf, pedidos-atrasados, pedidos-listar-top-valor,
pedidos-sem-vendedor, parcelas-a-vencer, tempo-medio-fechamento, preco-*,
produtos-por-margem/familia, vendedores-cadastrados, contar-regras-preco) +
`fato_pedido` (etapa atual + datas) e `fato_pedido_parcela`.

**Balde A de pedido (com dado real):**
| Modelo | count | Coberto? |
|---|---:|---|
| `pedido.documento` | 1.644 | sim (`fato_pedido` + tools) |
| `pedido.documento.historico` | 9.173 | **NÃO , raw existe, sem fato** |
| `pedido.parcela` | 2.429 | sim (`fato_pedido_parcela`) |
| `pedido.etapa` | 203 | sim (etapa no `fato_pedido`) |
| `pedido.operacao` | 119 | parcial |
| `pedido.documento.historico.tempo` | 9.173 | é VIEW sem `id`, não sincronizável (removido do catálogo em 2026-05-25) |

**Visão original do roadmap (O3 "cotação, proposta, follow-up") não tem dado:**
`pedido.documento.cotacao`, `.cotacao.item`, `.cotacao.analise`, `.reajuste`,
`.comissao`, `.pagamento`, `.defeito` etc. são todos **Balde B com 0 registros**
(`sem_sinal`). A Matrix não usa o fluxo de cotação do Odoo. Construir tools de
cotação sobre tabelas vazias seria trabalho fake (proibido).

## 2. Escopo real de O3 (o único gap de Balde A)

**`pedido.documento.historico`** (9.173 registros): o histórico de MUDANÇAS de
etapa de cada pedido (quando entrou/saiu de cada etapa, por quem). `fato_pedido` só
guarda a etapa ATUAL; o histórico permite responder o que hoje o Nex não responde:
- "quanto tempo o pedido X ficou em cada etapa?"
- "quais pedidos estão travados há mais de N dias numa etapa?"
- "histórico de etapas do pedido X"

**Entrega:**
- `FatoPedidoHistorico` (de `raw_pedido_documento_historico`): odooId, pedidoId,
  etapaId, etapaNome, dataEntrada, usuarioId/Nome, (duração calculada na query).
  Campos finais saem da inspeção do raw real (Task 0 do PLAN).
- Builder `fato-pedido-historico.ts` + registry + FATO_FONTE.
- 1 a 2 tools: `pedido_historico_etapas` (histórico/tempo por etapa de um pedido) e
  `pedido_travados_por_etapa` (pedidos parados há > N dias na etapa atual, cruzando
  o último registro do histórico). Escopo final travado na review (overlap vs
  `pedidos-atrasados`/`tempo-medio-fechamento`).
- Vocabulário do Router (histórico de etapa, tempo em etapa, pedido travado).

## 3. Fora de escopo (com justificativa de dado)

- Cotação/proposta/comissão/reajuste/pagamento de pedido: **0 registros**, Balde B
  `sem_sinal`. Onda futura gated pela ativação na Matrix (P8).
- `pedido.documento.historico.tempo`: VIEW sem `id`, não sincronizável (defeito do
  Odoo, já documentado). A duração é calculada na query a partir do histórico.

## 4. Verificação (dado real obrigatório)

- `tsc`/`eslint`/`jest` verdes.
- Migration aplicada (avisada; workaround de drift se preciso). `raw_pedido_documento_historico`
  já é sincronizado (existe no catálogo) , confirmar; senão registrar.
- Builder popula `fato_pedido_historico` contra o raw real; E2E das tools com
  números coerentes (ex.: histórico de um pedido conhecido bate com a sequência de
  etapas; soma das durações ~ tempo total do pedido).
- Painel "Estado da ingestão" reflete o estado (o raw já está lá; o fato é interno).
- Rebuild `worker`+`mcp` (pasta principal). Bateria R-X. Code review.

## 5. Decisões

D1. **O3 = histórico de etapas do pedido** (único gap de Balde A real), não cotação
(0 registros) nem re-cobrir pedido/parcela (F4 já cobre).
D2. **Esforço proporcional**: SPEC v1→v3 + PLAN v1→v3 (é build de fato+tools sobre
dado real, justifica o ciclo completo, diferente do O2).
D3. **Metodologia completa** porque há dado real e código novo (fato + tools).
