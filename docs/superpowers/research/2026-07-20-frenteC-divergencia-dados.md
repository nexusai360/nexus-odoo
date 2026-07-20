# Frente C , Divergência do "Relatório de entregas parciais" (Odoo ID 28) vs nosso cache

Data: 2026-07-20
Objetivo: reproduzir a lógica do relatório oficial de entregas parciais contra o NOSSO cache real
e isolar, com números, POR QUE o nosso resultado diverge do oficial.

Ambiente: container `nexus-odoo-db-1`, Postgres `nexus_odoo_l1`, user `nexus`. Todos os SQL foram
rodados via `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1`.

---

## 0. Números de referência

| Fonte | Pedidos | Linhas | Valor a atender (venda) |
|---|---|---|---|
| Oficial (planilha, orçamento 2019-2030, sem corte) | 377 | 3803 | R$ 60,7 mi |
| Nossa tela (filtro "Tudo" + "Todas as empresas") | 352 | 2731 | R$ 41,8 mi (custo 21,7 mi) |

Status Liberado/Bloqueado do oficial: 3410 / 393 (não é eixo da divergência de volume; não reproduzido aqui).

---

## 1. Schema do cache , os campos do SQL oficial existem?

Os raw espelham o Odoo 1:1 em coluna `data jsonb`.

`raw_pedido_documento.data` (cabeçalho do pedido) tem: `id`, `tipo`, `etapa_id` (array `[id,nome]`),
`operacao_id` (array), `participante_id`, `numero`, `vr_produtos`, `data_orcamento`, `pedido_pai_id`.
NÃO existe `pedido_original_id`; o candidato a "pedido derivado" é `pedido_pai_id`.

`raw_sped_documento_item.data` (item de pedido/nota) tem: `pedido_id` (array), `tipo_item` ('P' peça / 'E'),
`quantidade`, `quantidade_a_atender_pedido`, `quantidade_atendida_pedido`, `quantidade_confirmada`,
`vr_unitario`, `cfop_id`, `pedido_item_id`.

`fato_pedido` (26 colunas): `odoo_id, tipo, etapa_id, etapa_nome, operacao_id, categoria_operacao,
bucket_demanda, ...`.
`fato_pedido_item` (14 colunas): `odoo_id, pedido_id, quantidade, quantidade_a_atender,
quantidade_atendida, vr_produtos, vr_custo, ...`.

Mapeamento do builder (`src/worker/fatos/fato-pedido-item.ts`, linhas 48-51):
- `fato_pedido_item.quantidade_a_atender` = raw `quantidade_a_atender_pedido`
- `fato_pedido_item.quantidade_atendida`  = raw `quantidade_atendida_pedido`

Verificação de NULL (campo poderia estar vazio se o job de atendimento não rodasse):
```sql
select count(*) total, count(quantidade_a_atender) nn,
       count(*) filter (where quantidade_a_atender is null) nulos from fato_pedido_item;
-- total=18708, nn=18708, nulos=0
```
=> O "a atender" está 100% preenchido no cache. **"a atender NULL" NÃO é causa.**

Campos-chave do SQL oficial:
- `tipo` ('venda'): existe. `venda` = 1463 pedidos.
- `etapa_id`: existe (numeração idêntica à do oficial, conferido por nome, ex. 226 = "Nota emitida e não entregue").
- `operacao_id`: existe.
- `tipo_item` ('P'): existe (P=228957, E=2413 linhas).
- `pedido_original_id`: **NÃO existe**. O equivalente `pedido_pai_id` está **vazio** (`jsonb_typeof=boolean` = false em 100% dos 2593 pedidos). => o cache **não materializa o vínculo pai-filho de pedidos derivados**.
- `finaliza_pedido_confirmando/cancelando`: vivem na ETAPA (`raw_pedido_etapa.data`), não no pedido.

---

## 2. SQL oficial reproduzido sobre os RAW do cache

Filtros: `tipo='venda'`, `etapa_id IN (27 do oficial)`, `operacao_id != 67`, item `tipo_item='P'`,
`a_atender > 0`, com `a_atender = quantidade_a_atender_pedido`.

```sql
with ped as (
  select (data->>'id')::int id,(data->'etapa_id'->>0)::int etapa,
         (data->'operacao_id'->>0)::int opid, data->>'tipo' tipo
  from raw_pedido_documento where coalesce(raw_deleted,false)=false),
it as (
  select (data->'pedido_id'->>0)::int pid,
         (data->>'quantidade_a_atender_pedido')::numeric aa,(data->>'vr_unitario')::numeric vu
  from raw_sped_documento_item
  where coalesce(raw_deleted,false)=false and data->>'tipo_item'='P'
    and jsonb_typeof(data->'pedido_id')='array')
select count(distinct p.id) pedidos, count(*) linhas, round(sum(it.aa*it.vu)) valor
from it join ped p on p.id=it.pid
where p.tipo='venda'
  and p.etapa in (130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226)
  and (p.opid is distinct from 67) and it.aa>0;
```
Resultado: **325 pedidos | 3067 linhas | R$ 47,1 mi.**

Comparado ao oficial real (377 / 3803 / 60,7 mi): faltam **52 pedidos, 736 linhas, R$ 13,6 mi**
mesmo aplicando os filtros oficiais idênticos.

Set completo (mesmos filtros, SEM `a_atender>0`): 395 pedidos | 5557 linhas.

---

## 3. Nossa lógica reproduzida (bucketDemanda ABERTA + a atender > 0)

```sql
select count(distinct p.odoo_id) pedidos, count(*) linhas,
       round(sum(i.quantidade_a_atender * case when i.quantidade>0 then i.vr_produtos/i.quantidade else 0 end)) valor_venda
from fato_pedido p join fato_pedido_item i on i.pedido_id=p.odoo_id
where p.bucket_demanda='ABERTA' and i.quantidade_a_atender>0;
-- 341 pedidos | 3096 linhas | R$ 49,7 mi  (SEM corte de data)
```
Pedidos ABERTA distintos (sem filtro de item): 410.
Nossa tela (com corte de dados + escopo de UF): 2731 linhas | R$ 41,8 mi.

**Nossa lógica no cache (3096 lin / 49,7 mi) é praticamente igual aos filtros oficiais no cache
(3067 lin / 47,1 mi).** A diferença entre as duas é pequena (etapas de cauda longa, seção 5). O
buraco grande está entre "oficial no cache" e "oficial real".

---

## 4. A definição de "a atender" , o eixo dominante

Teste das duas definições no set oficial (etapa∈27, venda, item P):

```sql
-- NOSSO  aa = quantidade_a_atender_pedido
-- OFICIAL aa = quantidade - quantidade_atendida_pedido
```
Resultado: **as duas dão idênticas , 3067 linhas / R$ 47,1 mi.**
Ou seja, no cache `quantidade_a_atender_pedido == quantidade - quantidade_atendida_pedido`
(confirmado também pelos componentes abaixo). A definição não muda nada DENTRO do cache.

Componentes do set oficial no cache:
```sql
select count(*) linhas_P,
  round(sum(q*vu))   valor_qtd_cheia,   -- 81,67 mi
  round(sum(atd*vu)) valor_atendido,    -- 34,56 mi
  round(sum(aa*vu))  valor_a_atender,   -- 47,11 mi  (= 81,67 - 34,56)
  count(*) filter (where aa>0) lin_pendentes  -- 3067
from ...;
-- 5557 | 81.669.242 | 34.560.971 | 47.108.271 | 3067
```

Confronto com o oficial:
- Valor cheio das linhas do set: **R$ 81,67 mi** (piso e teto batem: nosso a_atender está entre 0 e o cheio).
- Oficial a_atender = **R$ 60,7 mi** => o oficial abate só **~R$ 21 mi** de entregas.
- Nosso cache abate **R$ 34,56 mi** de entregas (`quantidade_atendida_pedido`).
- Diferença: **nosso cache considera R$ 13,5 mi A MAIS como já entregue** do que o SQL oficial,
  zerando 736 linhas / 52 pedidos que o oficial mantém pendentes.

**Causa raiz do gap de 13,5 mi:** o SQL oficial calcula "a atender" = quantidade menos a soma
apenas das ENTREGAS DE PEDIDOS DERIVADOS (child orders em etapa não-cancelamento). O nosso
"a atender" usa o campo COMPUTADO do Odoo `quantidade_a_atender_pedido`, que abate mais do que
só as entregas dos derivados (também confirmações/reservas na própria linha). Como o vínculo
`pedido_pai_id` está VAZIO no cache, hoje **não é possível reconstruir o cálculo do oficial** ,
o dado dos pedidos derivados não foi materializado pelo sync. Parte do gap pode também ser
snapshot (a planilha oficial pode ser de outra data, com mais pendente), mas o `pedido_pai_id`
vazio é a causa estrutural comprovada.

---

## 5. Etapas , lista fixa 27 (oficial) vs regra por flags (nosso)

Cruzamento bucket x pertence-aos-27, em pedidos de venda:
```sql
select bucket_demanda,
  (etapa_id in (130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226)) no_oficial27,
  count(distinct odoo_id)
from fato_pedido where tipo='venda' group by 1,2;
-- ABERTA  | true  | 394    <- comum aos dois
-- ABERTA  | false | 16     <- nosso INCLUI a mais (cauda longa)
-- FECHADA | false | 958    <- os dois excluem
-- IGNORAR | false | 87     <- os dois excluem
-- IGNORAR | true  | 2      <- oficial INCLUI, nós jogamos fora
```

- **394 pedidos em comum** (nossa regra por flags ≈ lista fixa oficial).
- **Nosso inclui 16 pedidos A MAIS**, em etapas fora dos 27 que nossa regra (flags
  `finaliza_faturamento/confirmando/cancelando` todos false => ABERTA) deixa entrar:
  3 (Venda direta consumidor final), 6 (Cancelado), 93 (FAT Cliente final), 115 (Retorno
  Demonstração), 154 (CORREÇÃO), 161 (Preview NF Peças), 170 (Ajuste Fracionado), 196
  (Retorno Armazenagem LR), 222/223 (Fracionar retorno).
- **Oficial inclui 2 pedidos que nós marcamos IGNORAR** (∈27 mas categoria de operação não é
  demanda, ex. etapa 103 "VF 5922/6922 PDV" ou bonificação).

**Bug menor confirmado:** a etapa 6 "Cancelado" tem `finaliza_pedido_cancelando = FALSE` no cache,
então nossa regra a classifica ABERTA (deveria ir para IGNORAR). Impacto: 3 pedidos.

Impacto líquido das etapas: pequeno (+16 / -2 pedidos), e várias dessas etapas de cauda longa
caem depois por CFOP/`a_atender`. Não explica o gap de linhas/R$.

---

## 6. Operação 67 e CFOP 5922/6922 , impacto quase nulo

- **Operação 67:** nenhum pedido de venda usa `operacao_id=67` (os operacao_id usados são
  13, 31, 168, 14, 183, ...). O id 67 nem existe em `raw_pedido_operacao`. **Filtro irrelevante
  no nosso dado (0 pedidos).**
- **CFOP 5922/6922 (simples faturamento) + intragrupo:** o oficial não filtra CFOP nem intragrupo;
  nós excluímos ambos da demanda. No nível de pedido isso só derruba os **2 pedidos** ∈27 que
  aparecem como `IGNORAR` acima. Impacto marginal neste relatório específico.

---

## 7. Decomposição final da divergência

Oficial 377 / 3803 / R$ 60,7 mi  vs  Nossa tela 352 / 2731 / R$ 41,8 mi.

| Causa | Direção | Impacto quantificado |
|---|---|---|
| **1. "a atender" (dado de entregas dos derivados)** | oficial > nosso | **+52 pedidos, +736 linhas, +R$ 13,5 mi.** Nosso cache abate R$ 34,56 mi de entregas via `quantidade_atendida_pedido`; o oficial abate só ~R$ 21 mi (só entregas de pedidos derivados). `pedido_pai_id` vazio no cache impede reconstruir o cálculo oficial. **Causa dominante.** |
| **2. Corte de dados (data do orçamento) na tela** | nosso menor | Nossa lógica sem corte = 3096 lin / 49,7 mi; tela = 2731 lin / 41,8 mi. Corte + escopo remove ~365 linhas / ~R$ 7,9 mi. |
| **3. Etapas (flags vs lista fixa 27)** | quase neutro | 394 em comum; +16 pedidos nossos (cauda longa) / -2 do oficial. Bug etapa 6 "Cancelado" (flag canc=false) = 3 pedidos. |
| **4. Operação 67** | neutro | 0 pedidos. Filtro sem efeito. |
| **5. CFOP 5922/6922 + intragrupo** | oficial > nosso | ~2 pedidos. Marginal. |

Observação sobre custo: o valor de custo da tela (21,7 mi) vem do custo do PRODUTO (`custoDe`),
não de `fato_pedido_item.vr_custo` (majoritariamente zero); não foi reproduzido aqui e não é eixo
da divergência de volume.

---

## 8. Conclusão , para bater 1:1 com o oficial NESTE relatório

Cirurgicamente, em ordem de impacto:

1. **"A atender" (resolve ~R$ 13,5 mi, 736 linhas, 52 pedidos , o grosso do gap):** parar de usar
   o campo Odoo `quantidade_a_atender_pedido` e calcular `a_atender = quantidade - Σ(entregas de
   pedidos DERIVADOS em etapa não-cancelamento, mesmo produto/tipo_item)`. Isso EXIGE materializar
   no sync o vínculo de pedido derivado (`pedido_pai_id`/`pedido_original_id`), que hoje vem VAZIO.
   Sem esse dado no cache o oficial não é reproduzível , é o bloqueio real.

2. **Etapas (alinha a contagem de pedidos):** trocar a regra por flags pela **lista fixa dos 27
   etapa_ids** do oficial. Remove os 16 pedidos de cauda longa e adiciona os 2 que hoje caem em
   IGNORAR. (Alternativa mínima: pelo menos corrigir a etapa 6 "Cancelado", que tem o flag
   `finaliza_pedido_cancelando=false` no dado e por isso escapa como ABERTA.)

3. **Parar de excluir 5922/6922 e operação 67:** para casar o critério do oficial (que não filtra
   nenhum dos dois). Impacto real aqui é ínfimo (op 67 = 0; 5922/6922 = ~2 pedidos), mas é o que
   fecha a definição.

4. **Corte de dados:** usar "Tudo" / `ignorarCorteDados` para abrir a janela (o oficial usa
   orçamento 2019-2030). Aproxima a tela da lógica plena (+~R$ 7,9 mi / +365 linhas).

O item 1 é o que importa e o que está travado: **enquanto o cache não materializar as entregas dos
pedidos derivados, ficaremos estruturalmente ~R$ 13,5 mi / ~736 linhas abaixo do oficial**, mesmo
com etapas, CFOP e operação idênticos.
