# PLAN v1 , Lote 2: Desmembramento de Kits (BOM) para análise de compra

> Continuação da frente da reunião (mesma branch `feat/diretoria-entregas-estoque`, sem PR/merge
> até o dono liberar). Investigação da BOM já feita contra `nexus_odoo_l1` (2026-07-18).

## 1. Objetivo
Quando um KIT é vendido, desmembrá-lo nos seus componentes para a **análise de compra**: a
demanda de um kit vira demanda dos componentes, que se subtrai do estoque dos componentes para
achar a **necessidade de compra por componente** (o "estoque menos demanda, no unitário" que o
dono descreveu).

## 2. Investigação (medido no cache)
- **Kit = unidade de medida "kit"** (129 produtos). O campo `tipo_kit_produto` é inútil (só 3
  marcados). O `tipo` (produto acabado) é secundário; a unidade é o sinal forte.
- **BOM já ingerida como raw**: `raw_sped_produto_lista_material` (140 cabeçalhos) +
  `raw_sped_produto_lista_material_item` (475 componentes, média 3,4 por kit). Ligação:
  `raw_sped_produto.lista_material_id` → `lista_material_item.lista_id`.
- **Linha da BOM** (`data`): `produto_id` [id,nome] = componente, `produto_produzido_id` = pai,
  `lista_id` [id,nome] = cabeçalho, `quantidade` (número), `tipo_item` ("P"/"PRD-R"...).
- **Cobertura**: 116 produtos têm `lista_material_id`; **34 dos 38 kits vendidos em aberto têm BOM
  ligável (89%)**. 4 kits sem BOM (tratar com honestidade: não desmembra, avisa).
- Não há `fato_lista_material` nem lógica de "kit" no código (só o raw).

### Achados K0 (medidos, simplificam a implementação)
- **`tipo_item`**: `"P"` = 473 (componente real), `"PRD-R"` = 2 (refugo). **Filtrar `tipo_item='P'`.**
- **BOM NÃO é aninhada**: 0 componentes que são cabeçalho de outra BOM → **desmembramento de 1 nível
  só** (não recursivo). Simplifica K3.
- **Componentes têm estoque próprio**: 148 dos 168 componentes (88%) com saldo em `fato_estoque_saldo`.
  A necessidade de compra por componente FECHA (há saldo próprio para subtrair). Os sem saldo =
  necessidade cheia (honesto).
- **Ligação**: `produto.lista_material_id` → `lista_material_item.lista_id` (139 listas, 135 pais).

## 3. Decisões de produto PENDENTES do dono (não bloqueiam a Fase 1)
- **Rateio de VALOR** (Matrix: valor todo na estrutura, zero no painel; acessórios: por quilo, com
  a "torre" à parte). É a Fase 2. A Fase 1 trabalha em **QUANTIDADE**, que é o que a necessidade de
  compra precisa, e independe do rateio.
- Identificação Matrix × acessório (família Johnson/marca Matrix × família acessórios): usada só no
  rateio (Fase 2).

## 4. Fases

### FASE 1 , Infraestrutura + desmembramento em QUANTIDADE (determinística, esta entrega)
- **K0 , Investigação de detalhe**: valores de `tipo_item` (quais entram como componente real vs
  refugo/serviço); confirmar unidade dos componentes; medir necessidade de compra por componente
  para 1 kit real (validar o de-para).
- **K1 , Fato da BOM** (migration aditiva): `model FatoListaMaterialItem` (`produto_pai_id`,
  `componente_produto_id`, `componente_nome`, `quantidade`, `tipo_item`, `lista_id`). Builder
  `fato-lista-material.ts` no padrão de `fato-pedido-item.ts` (lê raw JSONB, resolve m2o). Registrar
  em `FATO_BUILDERS`. Aparecer no painel "Estado da ingestão".
- **K2 , Expor kit no `fato_produto`**: adicionar `ehKit` (unidade == kit) e `listaMaterialId` ao
  `fato_produto` + builder `fato-produto.ts`. Migration aditiva.
- **K3 , Função de desmembramento** (pura, testada): `desmembrarKit(produtoId, qtd, bom): Linha[]`
  → para cada componente, `qtd × quantidade_bom`. Produto que não é kit ou sem BOM: retorna ele
  mesmo (fallback honesto). TDD.
- **K4 , Aplicar na necessidade de compra**: `queryNecessidadeCompra` passa a desmembrar os kits da
  demanda em componentes antes de subtrair o estoque (dos componentes). Nova opção/coluna que
  mostra a necessidade **por componente**. TDD + E2E real.
- **K5 , UI**: bloco/coluna na aba de Compras (Estoque) mostrando a necessidade por componente,
  com aviso para os kits sem BOM. Perícia de UI.
- **K6 , Verificação**: rebuild do worker (fato novo), E2E contra o cache, tsc/jest verdes, docs.

### FASE 2 , Rateio de VALOR (pendente do dono)
- Regras de rateio Matrix (valor na estrutura) e acessórios (por quilo + torre). Parametrizável.
  Só depois que o dono definir as regras com todas as letras.

## 5. Riscos/invariantes
- **Migration aditiva** em banco compartilhado: seguir protocolo de schema (só a main como worktree
  hoje; sem outros agentes). Rebuild do worker via `app` (não `worker`).
- **Fallback honesto**: kit sem BOM não some nem vira zero , aparece como ele mesmo, com aviso.
- **Corte de dados**: a necessidade de compra já respeita; o desmembramento herda.
- Não amarrar ingestão à data da tela.
