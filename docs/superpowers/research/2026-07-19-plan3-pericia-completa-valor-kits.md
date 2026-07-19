# PLAN 3 , Perícia completa: dá para cruzar o valor dos kits? (2026-07-19)

> O dono pediu, com todas as letras, uma **perícia completa** antes de construir o painel de
> composição de valor dos kits, para garantir que dá para cruzar os dados. Aqui está o veredito,
> tudo medido no cache real `nexus_odoo_l1` (3 frentes de perícia em paralelo). Honesto sobre o
> que dá e o que NÃO dá.

## Resposta curta ao dono

**DÁ para fazer o painel de composição de valor dos kits**, ratear o valor de venda entre os
componentes e mostrar as tabelas de preço. **MAS** duas das três variações que você citou não estão
no cache hoje (é preciso decidir se vamos ingerir do Odoo):

| O que você pediu | Está no cache? | Observação |
|---|---|---|
| Varia por **tabela de preço** (Padrão × Smart) | ✅ SIM | 7 tabelas (2 de venda: "Venda Padrão /0,3" e "Venda Smart"). Valores realmente diferentes. |
| Varia por **venda** (desconto/promoção) | ✅ SIM | O valor REAL de cada venda está no pedido (`vr_produtos`), varia 4-6x entre vendas do mesmo kit. |
| Varia por **cliente** | ❌ NÃO | `fato_preco.participante_id` é 100% nulo. O cache não tem preço por cliente. Gap de ingestão. |
| Varia por **período / câmbio** | ⚠️ PARCIAL | As TABELAS não têm data (snapshot, sem vigência). Mas o valor REAL por venda tem a data do pedido, então dá para ver a variação no tempo pelo histórico de vendas, só não "a tabela vigente naquela data". |
| Puxar valor pelo **número de série** | ❌ NÃO | Os campos de valor/venda/NFe do mestre da série existem no Odoo mas estão **100% vazios** na Tauga. A série não sabe por quanto a unidade foi vendida. O valor sempre volta ao pedido. |

## O desenho técnico que funciona (validado)

**Total a ratear** = `vr_produtos` do item de pedido do kit (o valor comercial REAL daquela venda; filtrar `vr_produtos=0`, que é bonificação). É a fonte mais limpa (a NF mistura frete/parciais/entrada-saída).

**Pesos por componente** = `quantidade × preco_custo` do componente (custo diferenciado por peça: estrutura cara vs painel barato). Fallback quando o componente não tem custo: preço de venda de tabela (`fato_preco` Venda Padrão) → depois `fato_produto.preco_venda`.

**Rateio**: componente recebe `total × peso_componente / Σ pesos`, com fechamento por **maior resto** (soma dos rateados = total exato, em centavos).

Caminho de dados:
```
fato_pedido_item (kit vendido, vr_produtos)         -- total real da venda
fato_lista_material_item (BOM: pai -> componentes)  -- de que o kit é feito
fato_produto.preco_custo (peso) + fato_preco (venda/tabela, para exibir e fallback)
```

## Cobertura medida

- **Kits com BOM:** 135. Destes, **118 (87,4%) têm todos os componentes com preço de venda**; 17 têm ao menos um componente sem preço.
- **Componentes:** 277. **246 com preço (88,8%)**, **225 com preço de venda (81,2%)**. **52 (18,8%) sem preço de venda** , famílias inteiras zeradas (halteres HSE, dumbbells DBCROSS, esteiras/elípticos LIFESTYLE). Kit com um desses não fecha o rateio 100%; o painel mostra o buraco em vez de inventar.
- **Kits precificados:** 122/129 (94,6%) têm preço; 117 (90,7%) preço de venda.

## Buracos que o dono precisa decidir (gap de INGESTÃO, não de query)

1. **Preço por cliente:** `product.pricelist` por parceiro não está no `fato_preco` (participante_id nulo). Para ter "vende mais barato pro cliente X" é preciso o builder passar a ingerir as regras por parceiro do Odoo. **Decisão de escopo/infra.**
2. **Vigência / período nas tabelas:** `data_inicial`/`data_final` 100% nulas. Para "preço da tabela na data Y" é preciso ingerir as vigências. **Decisão de escopo/infra.**
3. **Custo histórico:** NÃO existe (o `vr_custo` do item é cópia do valor de venda, lixo). Só há o `preco_custo` snapshot de hoje. Então **margem exata por componente é impossível**; só dá margem aproximada (venda real da data × custo de hoje), que não deve ser vendida como exata.

## Achado colateral , BOMs múltiplas (afeta a Fase 1 já entregue)

- **4 kits têm mais de uma lista de material** (431, 607, 1281 são "kit"; 21287 é "unid" e escapa). A Fase 1 (`desmembrarDemanda`) hoje soma as linhas de TODAS as listas, **duplicando componentes compartilhados** (medido: componentes 273, 667, 1267, 1268 contados 2x).
- **Impacto vivo:** só o **1281 (POWERMILL Escada)** está em demanda ABERTA e é kit; a duplicação é latente (só aparece quando o atendimento não está sincronizado). Os outros são irrelevantes hoje.
- **Correção:** escolher UMA lista por `data_ativacao IS NOT NULL AND data_inativacao vazia`, desempate pela mais recente. `data_ativacao` já resolve 2 dos 4 sozinha (607 e 1281 têm lista nunca ativada). **Bloqueio:** `fato_lista_material_item` NÃO carrega `data_ativacao`/`data_inativacao` , é preciso o builder trazer esses campos do raw (mini-infra).
- **Gap secundário:** 11 produtos têm BOM mas são "unid" (não "kit"), então nunca desmembram , classificação a revisar (fora do escopo do PLAN 3, registrado).

## Recomendação de escopo do PLAN 3 (para o dono decidir)

**Núcleo entregável agora (sem novo sync, dado já no cache):**
1. Função pura `desmembrarValor` (rateio por custo, fallback tabela, maior resto).
2. Resolver a BOM correta (traz `data_ativacao` do raw p/ o fato , corrige a Fase 1 de quebra).
3. `queryComposicaoKit`: dado um kit, componentes com custo, preço de venda (Padrão e Smart) e o valor rateado; mostra a % de cada componente (estrutura vs painel) e sinaliza componente sem preço.
4. Painel na Diretoria (composição de valor dos kits) + tool(s) do Nex.

**Depende de decisão do dono (infra maior, pode virar PLAN próprio):**
- Ingerir preço por cliente (participante) e vigências/período das pricelists do Odoo. Sem isso, o painel roda por TABELA e por VENDA REAL, não por cliente nem por data-de-tabela.
