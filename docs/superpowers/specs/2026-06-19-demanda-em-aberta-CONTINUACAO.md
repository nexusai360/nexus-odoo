# CONTINUAÇÃO , Tool de "demanda em aberta" (comercial) , AGUARDANDO RESPOSTAS DA MARIANE

> **Status: STANDBY.** As perguntas foram enviadas à Mariane (admin comercial).
> Quando ela responder, o usuário aciona e ESTE doc diz exatamente o que fazer.
> Origem: conversa `d08c6323` (Mariane) , ela pediu o total de pedidos em
> "demanda aberta" e o produto de maior demanda; o agente não soube calcular
> (registrou lacuna, turno [15]) porque NÃO existe critério/tool para isso.

## 1. As perguntas enviadas (o que esperamos receber)

1. **Definição:** "demanda em aberta" = pedido **aprovado + com financeiro lançado + ainda não carregado (sem NF)**? Confirmar/ajustar.
2. **Mapa de etapas** (ela vai listar os nomes como aparecem no sistema):
   - (a) quais `etapa_nome` indicam **aprovado**;
   - (b) quais indicam **financeiro lançado**;
   - (c) quais indicam **carregado/faturado/saiu** (= NÃO conta como demanda em aberta).
3. **A NF é emitida no carregamento?** (confirmar que `vr_nf = 0` ⇒ "ainda não carregado").
4. **Quais etapas IGNORAR** (Cancelado, Pedido demonstração, Bonificação, Transferência entre empresas, Remessa, Reserva...).
5. **"Demanda" é em valor (R$) ou quantidade?** E "produto com mais demanda" = maior **quantidade** somada ou maior **valor** nos pedidos em aberto?
6. **Foto de agora** (todos os pedidos abertos hoje) **ou por período** (criados em X)?
7. **Grupo todo ou por empresa?**

## 2. O DADO (já investigado , fonte da verdade)

Tabela **`fato_pedido`** (`@@map`), campos relevantes:
- `etapaNome` (`etapa_nome`) , nome da etapa (texto).
- `etapaFinaliza` (`etapa_finaliza`) , bool, etapa terminal.
- `dataAprovacao` (`data_aprovacao`) , quando aprovado (proxy de "aprovado").
- `vrProdutos` (`vr_produtos`) , valor de produtos do pedido (base de "demanda").
- `vrNf` (`vr_nf`) , **0 enquanto não faturado/carregado**; > 0 após carregamento (proxy de "carregado/sem NF").
- `vendedorNome`, `empresaNome`, `participanteNome`, `operacaoNome`, `dataPrevista`.
- Itens por produto vivem em outra granularidade (pedido tem itens) , para "produto
  com mais demanda" pode ser necessário cruzar com os itens do pedido (verificar
  se há `fato_pedido_item` ou similar; senão, usar a quebra disponível).

**Taxonomia de etapas é HETEROGÊNEA (customização Tauga)** , por isso precisamos do
mapa da Mariane. Amostra real (nome | finaliza | qtd | comNF):
```
Fracionamento concluído|t   | VF - Emite NF|t            | Cancelado|f
Em contagem|f               | Emite NF - SIMPLES REMESSA|t| Aguardando Autorização|f (comNF=0)
Em trânsito|f (comNF=0)      | Nota emitida e não entregue.|f | Venda direta consumidor final|f
Reserva de Estoque|f        | Pedido demonstração|f       | Em conferência|f
Em cotação/provisório|f     | Pedido Transferência|f      | REMESSA DE BONIFICAÇÃO|f
```
(São ~40 etapas distintas. A Mariane deve dizer quais entram em cada bucket.)

## 3. O QUE CONSTRUIR quando ela responder

### 3.1 Critério de classificação (a partir do mapa dela)
Criar uma constante/helper que classifica `etapa_nome` em buckets:
`APROVADO_FINANCEIRO` (entra em demanda) vs `CARREGADO_OU_FATURADO` (sai) vs
`IGNORAR` (cancelado/demonstração/bonificação/transferência/remessa). Demanda em
aberta = etapas do bucket de entrada **E** (provavelmente) `vr_nf = 0`
(confirmar regra 3). NÃO cravar antes das respostas , é o erro a evitar.

### 3.2 Query `queryDemandaEmAberta` em `src/lib/reports/queries/comercial.ts`
- Filtra `fato_pedido` pelas etapas de demanda + `vr_nf = 0` (conforme respostas).
- Retorna: `totalValor` (SUM vrProdutos), `totalPedidos`, e a quebra por etapa.
- "Produto com mais demanda": se houver itens de pedido, somar quantidade/valor por
  produto nos pedidos filtrados; senão, declarar a limitação (honesto).
- Aceita filtro de empresa (se resposta 7 pedir por empresa) e período (resposta 6).

### 3.3 Tool `comercial_demanda_em_aberta` em `mcp/tools/comercial/`
- Espelhar o padrão (escopo empresa + período + paginação + freshness + responder).
- `descricao` clara ("demanda em aberta = pedidos aprovados, financeiro lançado, ainda
  sem carregamento/NF"). Formatador real em `mcp/lib/responder.ts`.
- Registrar em `mcp/tools/comercial/index.ts` + `npm run gen:mcp-catalog`.
- Atualizar contagens em `mcp/__tests__/integration.test.ts` (COMERCIAL_IDS + +1 nos
  totais 114→115 read / 123→124 raw / e os por-domínio de comercial) + golden `cov-`.

### 3.4 Regra de prompt (identity-base.ts)
Quando o usuário falar "demanda em aberta / demanda aberta / carteira pronta pra
carregar", usar `comercial_demanda_em_aberta` (não `pedidos_por_etapa` cru). E o
agente deve poder responder o "produto com mais demanda" DENTRO desse recorte.

### 3.5 Verificação
TDD + tsc + jest + **E2E contra o cache real** (somar os pedidos das etapas de
demanda e bater com um SELECT manual) + rebuild mcp + deploy (ship.py +
deploy-portainer.py) + /api/health. NÃO entregar número sem conferir contra o dado.

## 4. Personalização adaptativa por usuário (SEPARADO, só a comando)
Spec pronta em `docs/superpowers/specs/2026-06-19-agente-personalizacao-por-usuario-SPEC-v1-DRAFT.md`.
NÃO iniciar sem comando explícito do usuário.
