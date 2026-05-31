# SPEC , B4 Comercial: cotação + comissão (pré-build estrutural)

> Onda B4 do Balde B. Metodologia completa: SPEC v1 → review #1 → v2 → review #2
> → v3 (esta versão final). Aterrada no discovery ao vivo
> (`scripts/discovery/b4b7.ts`, 2026-05-31).

## Contexto e discovery (fato real)

Contagem ao vivo (uid 11) dos modelos comerciais complementares do plano-mãe:

| Modelo | Reg | Situação |
|---|---|---|
| `pedido.documento.cotacao` | 0 | existe, não operado |
| `pedido.documento.cotacao.item` | 0 | existe, não operado |
| `pedido.documento.cotacao.analise` | 0 | existe, não operado |
| `pedido.comissao` | 0 | existe, não operado |
| `pedido.documento.reajuste` | 1 | existe, marginal |
| `pedido.documento.reajuste.item` | 0 | existe, não operado |

Conclusão: **todo o comercial complementar está não operado** (0 reg). É um pré-build
estrutural honesto, idêntico ao padrão MDF-e/REINF do B2: fato vazio → tool responde
"não operado" e auto-ativa quando a Matrix começar a operar.

## Objetivo

Cobrir cotação (funil de proposta) e comissão (por pedido/vendedor) com fatos
estruturais + tools honestas, sem fabricar estrutura para modelos que nunca
serão usados, e reusando 100% o padrão do B2/B3.

---

## v1 (rascunho inicial)

Escopo v1: `FatoCotacao` (de `pedido.documento.cotacao`) + `FatoCotacaoItem` +
`FatoComissao` (de `pedido.comissao`) + `FatoReajuste` (de `pedido.documento.reajuste`).
4 fatos, ~5 tools: cotações abertas, cotações convertidas, itens de cotação,
comissão por vendedor, reajustes de contrato.

## Review #1 (adversarial) , achados materiais

1. **Over-modeling de 0 reg.** `FatoCotacaoItem` e `FatoReajuste(.item)` modelam
   tabelas com 0 (ou 1) registro e ~180 colunas que não podemos validar contra
   dado real. Modelar item de cotação agora é adivinhação pura. CORTAR item e
   reajuste-item; reajuste-cabeçalho (1 reg) é marginal demais para fato próprio.
2. **Status semântico desconhecido.** A v1 propunha tools "cotações abertas" vs
   "convertidas" assumindo valores de `status`. Com 0 registros, NÃO sabemos os
   valores do selection. Assumir "convertida" hardcoded é premissa frágil
   (violaria a regra de raiz de não entregar dado não comprovado). A tool deve
   expor `status` como veio e filtrar por `status` genérico, sem rótulo inventado.
3. **Comissão "por vendedor" exige agregação.** Com 0 reg, entregar agregação por
   participante é prematuro; a tool entrega as linhas (pedido, participante, base,
   alíquota, valor) + filtro por participante, e a soma é responsabilidade do
   consumidor. Sem inventar ranking.

Aplicado → v2.

## v2 (revisada)

Escopo v2: `FatoCotacao` + `FatoComissao` (2 fatos). Reajuste e itens cortados
(documentar como "não modelados até operar"). Tools: `comercial_cotacoes`
(lista/filtra por status, sem rótulo inventado) + `comercial_comissoes` (linhas +
filtro por participante/pedido). Ambas honestas (count==0 → "não operado").

## Review #2 (mais profunda) , achados

4. **Campos da cotação: separar negócio de mixin.** O `fields_get` traz o mixin
   gigante (`sistema_*`, `currency_*`). Só entram campos de negócio reais:
   `numero`, `status`, `eh_compra`, `empresa_id`, `operacao_id`(+nome),
   `usuario_aprovador_id`, `centro_resultado_id`. (Mesmo cuidado do B3.)
5. **`eh_compra` é dimensão-chave.** Cotação serve venda E compra (`eh_compra`
   bool). A tool deve permitir filtrar por isso (cotação de venda vs compra),
   senão mistura dois mundos. INCLUIR filtro `ehCompra`.
6. **Freshness e catálogo.** Os 2 fatos entram em `FATO_FONTE`, `FATO_CATALOG`
   (domínio "Comercial"), `MODEL_CATALOG` (2 raws novos) e `BI_SCHEMA_REFERENCE`,
   exatamente como B3 , senão o painel "Estado da ingestão" e o BI ficam furados.
7. **Sem segurança sensível.** Nenhum campo de credencial nestes modelos (ao
   contrário da carteira do B3). Sem allow-list especial necessária.

Aplicado → v3.

---

## v3 (FINAL , vai para o PLAN)

### Fatos (2, estruturais)
- **`FatoCotacao`** (← `pedido.documento.cotacao`, raw novo `raw_pedido_documento_cotacao`):
  `odooId, numero, status, ehCompra, empresaId, operacaoId, operacaoNome,
  usuarioAprovadorId, centroResultadoId`. Índices: status, empresaId.
- **`FatoComissao`** (← `pedido.comissao`, raw novo `raw_pedido_comissao`):
  `odooId, pedidoId, participanteId, participanteNome, bcComissao, alComissao,
  vrComissao`. Índices: pedidoId, participanteId.

### Tools (2, domínio `comercial`, honestas data-driven)
- **`comercial_cotacoes`**: lista cotações; filtros `status`, `ehCompra`, `limite`.
  count==0 → "cotações ainda não operadas no Odoo". Sem rótulo de etapa inventado.
- **`comercial_comissoes`**: lista comissões; filtros `participanteId`/`pedidoId`,
  `limite`. count==0 → "comissões ainda não operadas". Expõe base/alíquota/valor.

### Cortado (documentado, não modelado até operar)
- `pedido.documento.cotacao.item` / `.analise` (0 reg, ~180 colunas não validáveis).
- `pedido.documento.reajuste` (1 reg) / `.reajuste.item` (0). Reavaliar quando
  houver volume real (regra: discovery ao vivo antes de modelar).

### Integração (mesma cadeia do B3)
Schema (2 raw + 2 fato) → migration aditiva via `prisma migrate deploy` (nunca o
resolve manual) → 2 builders + teste de map → `FATO_BUILDERS` (incremental) →
`FATO_FONTE` → `FATO_CATALOG` (Comercial) → `MODEL_CATALOG` (+2) →
`BI_SCHEMA_REFERENCE` (+2) → query layer + 2 tools (factory honesta do B3) →
índice comercial → integration test (COMERCIAL_IDS +2, contagens) → model-catalog
test (+2).

### Verificação
tsc + eslint + jest verdes. E2E: rodar os 2 builders contra o cache (esperado 0
linhas, build_state gravado → tool responde "não operado", não "preparando").
Frontend: nenhum (fatos aparecem no painel via FATO_CATALOG, data-driven).

### Critério de saída
Reviews não acham mais achado material; cada fato tem builder+fonte+catálogo+raw;
tools honestas e auto-ativáveis; suíte verde; E2E confirma 0/0 + build gravado.
