# SPEC v1 , Histórico temporal de preço e de saldo de estoque

**Frente B do PLAN 4/6.** Origem: reunião com o dono em 2026-07-19
(`docs/transcricoes-reunioes/2026-07-19-reuniao-transcricao-BRUTA.md`).

## 1. O pedido, na voz do dono

Guardar, com data e hora, os **preços** e as **quantidades** a cada ciclo de atualização,
para ter **histórico de preço** e **histórico de movimentação de estoque**: "quem saiu, quem
entrou, quando, de quanto era a tabela". Tudo consultável no nosso cache, sem ir ao Odoo.

## 2. Perícia do dado (medida no cache em 2026-07-19, não presumida)

| O que | Estado real | Consequência para o desenho |
|---|---|---|
| `fato_preco` | 12.009 linhas, 7 tabelas (Custo Padrão, Custo /0,3, Custo /0,95, Venda Padrão /0,3, Venda Smart, Custo Smart, Custo Médio Smart). Builder `incremental`. | O histórico cobre as **7 tabelas**, não só a de venda. O custo é a base do KPI de estoque; sem o histórico dele não se explica a variação do valor de estoque. |
| `fato_estoque_movimento` | **Já existe**: 22.787 linhas vindas de `estoque.extrato`, com data, produto, local, quantidade, sentido (entrada/saída) e origem (NF-e, PV, INV, TRANSF). Cobre 06/01 a 13/07. | "Quem entrou, quem saiu, quando, com qual documento" **já está no cache**. A Frente B **não** reconstrói isso. Cai o item "avaliar ingerir o extrato" da perícia anterior: está ingerido. |
| `fato_estoque_saldo_snapshot` | Foto **diária** cheia: 32.849 linhas em 8 dias (~4,1 mil/dia). Idempotente por dia. | O que falta é **granularidade**, não a série. |
| `fato_estoque_saldo` | 4.622 linhas, reconstruído por DELETE + INSERT a cada ciclo de snapshot. | O histórico tem de ser capturado **acoplado ao ciclo**, nunca por um timer solto (ver §5). |
| Cadência real dos ciclos | `incremental` 3-10 min; `snapshot` 30 min; `reconcile` 180 min. `estoque.saldo.hoje` e `fato_preco` são modelos de ciclos diferentes. | "A cada 10 minutos" é a cadência do **incremental**. O saldo só muda no ciclo de **snapshot**: capturá-lo a cada 10 min gravaria três vezes o mesmo dado. |

## 3. A decisão central: append por mudança, não foto por ciclo

Foto cheia por ciclo custaria ~4,1 mil linhas de saldo × 48 ciclos/dia (~197 mil/dia) e
~12 mil linhas de preço × 144 ciclos/dia (~1,7 milhão/dia), quase tudo repetição do valor
anterior. Gravamos **só a linha que mudou** desde o último registro dela.

O núcleo dessa decisão para preço já existe e está testado:
`src/lib/estoque/historico-preco.ts` (`precosQueMudaram`, tolerância de um centavo).

Consequência que precisa estar escrita na tela e na doc: **o histórico é uma série de
mudanças, não de amostras**. "Qual era o preço em 3 de julho" se responde pegando o último
registro **até** aquela data, não procurando um registro **daquela** data.

## 4. O que será construído

### 4.1 `fato_preco_snapshot` , histórico de preço

Tabela nova, append-only:

| Coluna | Tipo | Por quê |
|---|---|---|
| `id` | uuid | PK |
| `capturadoEm` | timestamp | Quando o valor foi observado. Data e hora, como o dono pediu. |
| `tabelaId` / `tabelaNome` | int / text | A tabela de preço. Nome desnormalizado: o histórico tem de continuar legível se a tabela for renomeada ou apagada no Odoo. |
| `produtoId` / `produtoNome` | int / text | Idem. |
| `valor` | decimal(18,4) | O preço observado. |

Índices: `(tabelaId, produtoId, capturadoEm)` para a série de um produto, e `(capturadoEm)`
para varredura por período.

### 4.2 `fato_estoque_saldo_historico` , histórico de saldo por ciclo

Mesma forma, chave `(produtoId, localId)`:

| Coluna | Tipo |
|---|---|
| `id` | uuid |
| `capturadoEm` | timestamp |
| `produtoId` / `produtoNome` | int / text |
| `localId` / `localNome` | int / text |
| `quantidade` | decimal(18,4) |
| `vrSaldo` | decimal(18,2) |

Grava quando **quantidade ou vrSaldo** mudam (tolerância: 0,0001 na quantidade, um centavo
no valor). Índices `(produtoId, localId, capturadoEm)` e `(capturadoEm)`.

O snapshot diário existente **continua como está**: ele responde "estoque no fim do dia X"
sem varrer a série, e é a rede de segurança se a série de mudanças tiver um buraco.

### 4.3 Captura acoplada ao ciclo, não por timer próprio

- histórico de **preço**: capturado ao fim do ciclo **incremental**, logo depois de
  `rebuildFatoPreco`;
- histórico de **saldo**: capturado ao fim do ciclo **snapshot**, logo depois de
  `rebuildFatoEstoqueSaldo`.

Motivo: os fatos são reconstruídos por DELETE + INSERT. Um job independente que acordasse no
meio de um rebuild leria uma tabela em transição e registraria "todo o estoque virou zero" ,
um evento falso que ficaria no histórico para sempre, porque a tabela é append-only.
Capturar depois do rebuild, no mesmo ciclo, elimina a corrida em vez de torcer contra ela.

### 4.4 Consulta , as 4 pontas

Funções em `src/lib/estoque/` (fonte única, como a classificação de local):

1. `serieDePreco(produtoId, tabelaId, de, ate)` , a série de mudanças, mais o valor vigente
   no início do período (o último registro **antes** de `de`), senão o gráfico começa no ar.
2. `serieDeSaldo(produtoId, localId?, de, ate)` , idem para quantidade e valor.
3. `movimentacao(produtoId, localId?, de, ate)` , lê `fato_estoque_movimento` (já existe);
   é a resposta de "quem entrou e quem saiu, com qual documento".

Consumidores: Diretoria (variação de preço e de saldo), Relatórios, tool do Nex. Todas leem
das mesmas funções , nenhuma reimplementa a regra.

### 4.5 Data de início das análises

Regra durável do projeto: a data configurada **filtra a leitura, nunca apaga**. As três
funções de consulta aplicam `clampIsoAoCorte` na data inicial. A **captura** não olha para
essa data: o histórico acumula, e mover a data para trás faz o passado reaparecer.

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Job capturar durante o rebuild e gravar zeros | Captura acoplada ao ciclo, depois do rebuild (§4.3) |
| Crescimento sem controle | Append por mudança. Medir o volume real do primeiro dia antes de considerar retenção. Sem política de expurgo nesta onda: apagar histórico contraria a regra durável do projeto |
| Primeira captura gravar as 12 mil linhas de preço e as 4,6 mil de saldo | É o esperado: a linha de base. Acontece uma vez |
| Série interpretada como amostragem | Documentado em `docs/kpis-diretoria.md` e nas funções de consulta, que devolvem o valor vigente no início do período |
| Produto ou local apagado no Odoo | Nome desnormalizado na própria linha do histórico |

## 6. Fora de escopo

- Telas novas de gráfico de série (esta onda entrega o dado e as funções de consulta).
- Política de retenção/expurgo.
- Histórico de preço por participante (`fato_preco.participante_id`): as 7 tabelas são
  `dimensao = produto`; preço negociado por cliente não está em uso hoje.

## 7. Critérios de aceite

1. Migration aditiva aplicada; `npx prisma migrate deploy` limpo, nenhuma coluna existente alterada.
2. Rodar a captura duas vezes seguidas sem mudança no Odoo grava linhas na primeira e **zero** na segunda.
3. Mudar um preço no Odoo (ou simular no raw) faz aparecer **uma** linha nova, com o valor novo.
4. `serieDePreco` de um produto com histórico devolve o valor vigente no início do período mesmo sem registro dentro dele.
5. As três funções respeitam a data de início das análises.
6. `tsc` e a suíte inteira verdes; E2E contra o cache real, com número conferido.
