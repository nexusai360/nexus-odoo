# Perícia da reunião (dono × logística) , transcrição destrinchada + comprovação no sistema

> Resumo dos pontos da reunião transcrita, com foco em KITS e VALORES, cada afirmação do colega
> confrontada com o dado real em `nexus_odoo_l1` (2026-07-19). Serve de base para a Fase 2 (rateio
> de valor) sem precisar perguntar nada ao dono: **está tudo no sistema**.

## 1. Como o SISTEMA identifica o que é KIT (comprovado)
Três sinais, do mais forte ao de apoio:
- **Unidade de medida = "kit"** (`fato_produto.unidade_nome ~ '^kit'`) , 129 produtos. É o sinal
  usado no código. (`tipo_kit_produto` do Odoo é inútil: só 3 marcados.)
- **Tipo "produto acabado"** (`fato_produto.tipo`) , o colega citou; secundário.
- **Tem Lista de Material (BOM)** , `fato_lista_material_item.produto_pai_id`. 135 kits têm
  componentes. Ligação pelo pai direto (`produto_produzido_id`).
- **Componente** = "mercadoria para revenda" + unidade "unidade" (o oposto do kit).

## 2. Matrix × Acessório (comprovado , pela FAMÍLIA/MARCA do kit pai)
- **Matrix / equipamento**: `familia_nome = 'JOHNSON'` (marca MATRIX/VISION) , **84 kits**.
  Ex.: CS LED, TS LED, esteiras, elípticos. 2 a 4 componentes (estrutura + painel).
- **Acessório**: `familia_nome = 'ACESSÓRIOS'` (marcas AHEAD, ZIVAROPPEEVERLAST, ROTHA, etc.) ,
  ~30 kits. Ex.: kit dumbbell, halter, anilha. 5 a 12 componentes.
- (LIFE FITNESS = 20 kits, outra marca de equipamento.)

## 3. VALOR , a chave que o colega não sabia que o sistema já tem (comprovado)
Na reunião o colega disse que ratear valor "é complexo" e descreveu um método MANUAL (Matrix: joga
tudo na estrutura; acessório: divide por quilo). **Isso era contorno de Excel. O sistema já resolve:**
- **CUSTO unitário de cada componente JÁ EXISTE** em `fato_produto.preco_custo`, diferenciado.
  Medido no kit halter (pai 157): dumbbell 12kg=R$473, 14=R$552, 16=R$631, 18=R$710, 20=R$789,
  22=R$887. Ou seja, **não precisa ratear por quilo para o custo**: cada peça tem o seu.
  → A **necessidade de compra (Fase 1, já entregue) usa esse custo por componente. Correto.**
- **PREÇO DE VENDA DE TABELA**: `fato_preco` (12.009 linhas, dimensao "produto", tabela "Venda
  Padrão /0,3", `valor` = preço fixo por produto). Existe por componente também.
- **PESO por componente**: `fato_produto.peso_liquido` está **ZERADO** no cache (não confiável). O
  peso está embutido no nome ("DUMBBELL 12", "14"...) e, na prática, **já refletido no custo**. Por
  isso o rateio por quilo é desnecessário , o custo por peça é a fonte melhor.

### Consequência para a Fase 2 (rateio do VALOR DE VENDA do kit aos componentes)
O valor de venda do kit no pedido (`vr_produtos` do item) é por desconto (variável). Para atribuí-lo
aos componentes, a proporção honesta e automática é **proporcional ao CUSTO de cada componente**
(que existe e já distingue estrutura cara de painel barato, e dumbbell pesado de leve). Isso
reproduz a intenção do colega ("estrutura leva o valor, painel ~zero") SEM regra manual, e cobre
Matrix e acessório com a mesma lógica. Alternativa: proporção pelo preço de tabela (`fato_preco`).
**Decisão de produto para a Fase 2, mas o dado para as duas está no sistema , nada a perguntar.**

## 4. Kits citados na reunião (para validar contra o cache)
- **CS LED** (produto 28) = estrutura **CSF** + painel LED (componentes 1451 e 1464). Matrix.
- **TS LED / TS Touch XL** (TSF estrutura + painel LED + painel Touch). Matrix.
- **Power carry**. Matrix.
- **Kit dumbbell** 12-30 / 12-20 / 1-10; **kit halter**; **kit anilha**. Acessório (por peça).

## 5. Como CHEGAR em cada coisa (Odoo → cache)
| Quero | Odoo | Cache |
|---|---|---|
| O que é kit | cadastro produto: unidade "kit" / tipo acabado | `fato_produto.unidade_nome`, `tipo` |
| Componentes do kit | Produção > Lista de material e produtos | `fato_lista_material_item` (pai→componentes+qtd) |
| Matrix × acessório | família/marca do produto | `fato_produto.familia_nome`/`marca_nome` |
| Custo por componente | tabela de custo | `fato_produto.preco_custo` (existe, diferenciado) |
| Preço de venda de tabela | tabela de preço | `fato_preco.valor` (dimensao "produto") |
| Venda real (com desconto) | linha do pedido | `fato_pedido_item.vr_produtos / quantidade` |

## 6. Estado
Fase 1 (necessidade de compra desmembrada em componentes, a custo) **já entregue e correta** , usa
o custo por componente. Fase 2 (desmembrar o VALOR DE VENDA do kit) é implementável com o dado
acima; a única decisão é a base da proporção (custo × preço de tabela), e ambas existem no cache.
