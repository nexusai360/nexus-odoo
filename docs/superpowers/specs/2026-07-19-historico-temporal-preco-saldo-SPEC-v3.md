# SPEC v3 (final) , Histórico temporal de preço e de saldo de estoque

**Frente B do PLAN 4/6.** Origem: reunião com o dono em 2026-07-19
(`docs/transcricoes-reunioes/2026-07-19-reuniao-transcricao-BRUTA.md`).
Versão final: passou por duas reviews adversariais sequenciais (R1: 11 achados; R2: 9
achados, um deles impeditivo do bootstrap). Achados marcados `[R1-n]` / `[R2-n]`.

## 1. O pedido, na voz do dono

Guardar, com data e hora, os **preços** e as **quantidades** a cada ciclo de atualização,
para ter **histórico de preço** e **histórico de movimentação de estoque**: "quem saiu, quem
entrou, quando, de quanto era a tabela". Tudo consultável no nosso cache, sem ir ao Odoo.

## 2. Perícia do dado

Medido no cache em 2026-07-19. **O cache está congelado em 2026-07-14 11:43** (worker parado
no dev): os números são reais, mas o teto das séries é 14/07, não hoje `[R1-14]`.

| O que | Estado real | Consequência |
|---|---|---|
| `fato_preco` | 12.009 linhas, 7 tabelas (custo e venda), builder `incremental`, grão = **regra** de preço. `(tabelaId, produtoId)` não é única: 1 par duplicado (tabela 1, produto 15049, `odooId` 22675 e 26299), **byte a byte idêntico exceto o `odooId`**, `quantidadeMinima` zerada nos dois `[R2-1]`. Nenhuma linha com `produtoId` NULL hoje; `dataInicial`/`dataFinal`/`quantidadeMinima` zerados/nulos. | A captura só cobre `dimensao = 'produto'` (§4.8) e **deduplica por chave antes de gravar** (§4.3): sem isso o bootstrap aborta no `@@unique`. |
| `fato_estoque_saldo` | 4.622 linhas, DELETE + INSERT **em transação**, `cycle: snapshot`. Chave `(produtoId, localId)` **sem duplicata e sem nulo** (verificado). `quantidade` escala 4, `vrSaldo` escala **2**. | Não há leitura suja. A comparação usa a escala real de cada coluna `[R2-6]`. |
| `fato_estoque_movimento` | 22.787 linhas de `estoque.extrato`, **espelho do Odoo** (builder `snapshot`, `deleteMany` + reinsert; raw também refetchado inteiro). Cobre **73 de 96 locais com saldo**; 2 físicos e 20 de demonstração têm saldo e zero movimento. 06/01 a 13/07. | Fora do escopo reconstruir, com ressalva escrita: se a Tauga arquivar o extrato, o histórico evapora, e a resposta é vazia para 23 locais `[R1-7]`. |
| `fato_estoque_saldo_snapshot` | Foto diária cheia, **8 fotos em 26 dias** (buraco de 19 dias; cron 09:00 BRT sem backfill). Colunas: produto, local, quantidade, vrSaldo, família, marca. **Não tem `unidade`** `[R2-10]`. | Não é rede de segurança (já falhou 19 dias). A série nova espelha as dimensões de `fato_estoque_saldo`, não do snapshot `[R1-9]`. |
| Volume de mudança | Entre fotos diárias: 0, 12, 69, 86, 223, 660 linhas. Chaves que surgem: até 233; que somem: **1 em todo o período**. | Append por mudança grava ~1-5% da foto cheia. Desaparecimento é raro mas não é zero `[R1-3]`. |
| Cadência | `incremental` 3-10 min (dispara também **sob demanda, a cada clique** da Diretoria via `rodarCicloEscopado`); `snapshot` 30 min. | A captura de preço só corre no ciclo **cron**, nunca no escopado `[R2-3]`. O saldo a 30 min é mais grosso que o "~10 min" do pedido , desvio registrado (§6). |

## 3. Decisão central: append por mudança, com dedup

Foto cheia por ciclo custaria ~197 mil (saldo) + ~1,73 milhão (preço) de linhas/dia, quase
tudo repetição. Gravamos **só a linha que mudou**.

**Antes de comparar, deduplica.** `fato_preco` tem regras idênticas com `odooId` diferente
(o par 15049). Se as duas entrarem na captura, geram duas linhas com a mesma
`(chave, capturadoEm)` e a transação aborta no `@@unique` , o bootstrap **nunca** conclui
`[R2-1]`. A captura colapsa linhas de mesma chave e mesmo valor numa só antes de gravar; se
duas linhas de mesma chave tiverem valores **diferentes** (faixa de quantidade real, no
futuro), a `quantidadeMinima` entra na chave e as separa. O par de hoje é idêntico, então
colapsa para uma.

O núcleo para preço existe (`src/lib/estoque/historico-preco.ts`) mas **está incompleto**:
itera só sobre os atuais (não representa baixa, §4.4), compara em float (§4.7) e não deduplica
(§4.3). As três coisas mudam nesta onda, com teste.

Consequência escrita na tela e na doc: **o histórico é série de mudança, não de amostra.** E
"não mudou" não é "não observamos" , por isso existe o registro de rodada (§4.5).

## 4. O que será construído

### 4.1 `fato_preco_historico` e `fato_estoque_saldo_historico`

Nome `historico`, não `snapshot`: snapshot é a foto cheia; estas são séries de mudança
`[R1-13]`.

**`fato_preco_historico`**: `id` (uuid), `rodadaId` (uuid, §4.5), `capturadoEm` (timestamp),
`tabelaId`/`tabelaNome`, `produtoId`/`produtoNome`, `quantidadeMinima` decimal(18,4),
`valor` decimal(18,4) NULL (NULL = baixa), `evento` (`mudanca`|`baixa`), `vigente` boolean.

**`fato_estoque_saldo_historico`**: `id`, `rodadaId`, `capturadoEm`, `evento`, `vigente`,
chave `(produtoId, localId)`, `quantidade` decimal(18,4) NULL, `vrSaldo` decimal(18,2) NULL,
mais as dimensões de `fato_estoque_saldo`: `produtoNome`, `localNome`, `familiaId`,
`familiaNome`, `marcaId`, `marcaNome`, `unidade` `[R1-9][R2-10]`.

Índices e constraints (as duas), **por SQL cru na migration** , Prisma 7 não expressa índice
parcial no schema, e o projeto nunca fez um `[R2-2]`:

- `@@index([<chave>, capturadoEm])` (declarativo) , a série de um produto;
- `@@index([capturadoEm])` (declarativo) , varredura por período;
- `@@index([rodadaId])` , expurgo cirúrgico de um lote;
- **`CREATE UNIQUE INDEX ... (<chave>) WHERE vigente`** (SQL cru) , faz as duas coisas de uma
  vez: acelera a leitura do "último por chave" (§4.7) **e enforça o invariante de exatamente
  um vigente por chave**, que um índice não-único deixaria escapar `[R2-2]`.

Não há `@@unique([<chave>, capturadoEm])`: ele seria o gatilho que aborta o bootstrap no par
duplicado `[R2-1]`. A dedup da §4.3 e o unique parcial `WHERE vigente` já protegem a
integridade sem esse risco.

### 4.2 Chave

- preço: `(tabelaId, produtoId, quantidadeMinima)`, só `dimensao = 'produto'` `[R2-11]`;
- saldo: `(produtoId, localId)`.

### 4.3 Dedup antes de gravar `[R2-1]`

A captura recebe as linhas atuais do fato e, por chave, colapsa as de mesmo valor numa só.
Duas linhas de mesma chave com valores diferentes são um caso que **não existe hoje** (a
`quantidadeMinima` as separaria); se aparecer, a captura registra o conflito no motivo da
rodada e grava a de menor `odooId` (determinístico), sem abortar. Teste com o par 15049.

### 4.4 Baixa: a linha que sumiu `[R1-3][R2-4]`

Chave presente na captura anterior (a linha vigente) e ausente agora gera uma linha
`evento = 'baixa'`, com valor/quantidade/vrSaldo **NULL** (não zero: zero é estado válido e
diferente de "não existe mais").

**Ressurreição.** Se a linha vigente de uma chave é uma baixa (`valor` NULL) e o produto
reaparece, a comparação trata "vigente é baixa" como **diferente de qualquer valor
presente**: a reaparição sempre gera um `evento = 'mudanca'`. A comparação nunca faz
`.toString()` de um NULL , testa `evento`/nulidade antes. Teste do ciclo
mudança → baixa → ressurreição.

Sem isso, um produto que sai congela no último valor para sempre, e a consulta responde "o
preço em agosto era R$ 21.900" sobre um preço que não existe.

### 4.5 `fato_captura_rodada` , o registro de que observamos

Uma linha por rodada, de cada série: `id` (é o `rodadaId`), `serie` (`preco`|`saldo`),
`capturadoEm`, `linhasObservadas`, `linhasGravadas`, `status` (`ok`|`recusada`|`base`),
`motivo` NULL.

**Cadência esperada** (necessária para definir "lacuna" `[R2-7]`): a série tem um intervalo
nominal , preço = intervalo do ciclo cron incremental; saldo = 30 min. Uma **lacuna de
observação** é, sem ambiguidade:
- **recusada**: linha com `status = 'recusada'` (enumerável diretamente);
- **ausência**: intervalo entre dois `capturadoEm` `ok` consecutivos **maior que 2× o
  intervalo nominal** da série (inferida do gap, porque um worker fora do ar não deixa
  linha). É assim que se responde "entre 14/07 e 19/07 não houve observação".

### 4.6 Captura acoplada ao ciclo cron, com guarda de sanidade

- preço: ao fim do ciclo incremental **cron**, depois de `rebuildFatoPreco`. **Nunca** no
  ciclo escopado (clique da Diretoria): `processIncrementalCycle` recebe
  `origem: 'cron' | 'ondemand'` e a captura só corre quando `cron` `[R2-3]`. Sem esse gate,
  cada clique de cada diretor geraria uma rodada;
- saldo: ao fim do ciclo **snapshot**, depois de `rebuildFatoEstoqueSaldo` (o snapshot nunca
  roda sob demanda).

**Motivo do acoplamento** `[R1-1]`: a captura tem de observar exatamente o estado que o ciclo
acabou de commitar, na cadência em que aquele dado muda. (A v1 justificava com leitura suja
durante o rebuild; isso **não existe** , os rebuilds rodam em `$transaction`.)

**Guarda de sanidade** `[R1-2][R2-5]`. O risco real é um pull parcial do Odoo que encolhe o
fato: o builder desse fato **tem sucesso** a partir do raw menor (ele só lança se a transação
falha), então "só capturar se o builder teve sucesso" **não** protege , a defesa é o limiar:

1. **Limiar absoluto de sumiço.** Se o número de chaves que sumiriam nesta rodada passa de um
   teto (a ser fixado à variância real: o desaparecimento observado é ~1 chave em todo o
   período, então um teto na casa de dezenas já é folgado), a rodada é **recusada**: grava a
   rodada com `status = 'recusada'` e o motivo, e **nenhuma** linha da série. Limiar absoluto,
   não percentual: casa com a variância ~0 do dado, onde 20% seriam ~920 chaves de folga
   `[R2-5]`.
2. **Rota de saída do dead-state.** Se K rodadas consecutivas forem recusadas com a contagem
   **estável** (a queda é real e persistente, não um glitch), a rodada seguinte é **aceita**
   como nova base (`status = 'base'`) , senão uma baixa legítima de estoque travaria a série
   para sempre `[R2-5]`.
3. **Primeira captura**: sem rodada `ok`/`base` anterior, a guarda é ignorada e a rodada é a
   linha de base (`status = 'base'`) `[R2-9]`.
4. **`rodadaId` em cada linha**, para expurgo cirúrgico do lote se algo passar mesmo assim.

### 4.7 Comparação: igualdade exata, leitura pelo vigente

`valor`/`quantidade`/`vrSaldo` são `Decimal` no Prisma, já quantizados na origem (escala 4,
4 e **2**). Comparar com tolerância em `number` perde mudança real (`>= 0.0001` é a menor
unidade representável, e o float64 cai abaixo dela) `[R1-10]`. Compara-se pela representação
decimal em **string** (`Decimal.toString()`), exata, **cada coluna na sua escala** `[R2-6]`.

- preço grava quando `valor` muda;
- saldo grava quando **`quantidade` OU `vrSaldo`** mudam (uma reavaliação de custo com a mesma
  quantidade é uma mudança que o dono quer ver) `[R2-6]`.

O "último valor por chave" **não** sai de `DISTINCT ON` sobre a tabela inteira (percorreria
os 12 mil grupos a cada rodada, inclusive nas disparadas por clique) `[R1-11]`. Lê-se pelo
índice único parcial `WHERE vigente` (uma linha por chave) e, ao gravar, desmarca a anterior
e marca a nova **na mesma transação**. Sob READ COMMITTED nenhum leitor concorrente vê zero
nem dois vigentes. Custo O(chaves), constante no tempo.

### 4.8 Filtro de dimensão `[R2-11]`

A captura de preço filtra `dimensao = 'produto'`. Regras `familia`/`participante`/`geral` têm
`produtoId` NULL e colapsariam sob uma chave `(tabela, null, qtd)`. Não existem hoje, mas o
filtro fecha a landmine e é coerente com o fora-de-escopo (§6).

### 4.9 Consulta , as 4 pontas

Funções em `src/lib/estoque/` (fonte única):

1. `serieDePreco(produtoId, tabelaId, quantidadeMinima?, de, ate)` , série de mudanças no
   período + o **valor vigente no início** (carry-forward, §4.10).
2. `serieDeSaldo(produtoId, localId?, de, ate)` , idem para quantidade e valor.
3. `movimentacao(produtoId, localId?, de, ate)` , lê `fato_estoque_movimento`; devolve a
   marca de que **aquele local não tem extrato**, senão "zero movimentos" é lido como "nada se
   moveu" quando é "não sabemos" `[R1-7]`.

As três devolvem as **lacunas de observação** do período (recusadas + ausências, §4.5).

Consumidores (4 pontas `[R1-12]`): Diretoria, Relatórios, tool do Nex, BI schema. Todas leem
destas funções.

### 4.10 Data de início: dois usos distintos `[R1-6]`

A data configurada **filtra a leitura e nunca apaga**. Aqui tem dois papéis:

- **janela exibida** (`de`, `ate`): grampeada ao corte com `clampIsoAoCorte`;
- **carry-forward** (valor vigente no início da janela): leitura de **estado**, não de fato
  analisado, e **alcança antes do corte por desenho**. Sem isso, todo preço estável há meses
  (a maioria: nenhuma linha tem `dataInicial`) faria o gráfico começar no ar.

Escrito também em `docs/kpis-diretoria.md`, senão a próxima sessão "corrige" de volta.
A **captura** não olha para essa data: o histórico acumula.

## 5. Mudança de assinatura , `runBuilders`

`runBuilders` passa a devolver o status por builder (hoje devolve `void`). Só **2 call-sites
de produção** (`processIncrementalCycle`, `processSnapshotCycle`) + `f4l-build-fatos` + testes
`[R2-4-descartado]`. O snapshot diário e o atendimento não chamam `runBuilders`. A captura lê
esse status para saber se o builder da sua série teve sucesso na rodada.

## 6. Fora de escopo

- Telas novas de gráfico (esta onda entrega o dado e as funções).
- Retenção/expurgo por idade (o `rodadaId` cobre o expurgo cirúrgico de captura falsa).
- Backfill do buraco de 19 dias (o passado não existe mais no Odoo).
- Histórico de preço por participante/família (só `dimensao = 'produto'`).
- Consulta cruzando as duas séries (valor de estoque = custo × quantidade no tempo): as
  cadências diferem (preço 3-10 min, saldo 30 min); o carry-forward por eixo resolveria, mas
  a spec não promete essa consulta.
- Elevar o saldo à cadência de ~10 min do pedido: fica em 30 min (a do snapshot) nesta onda;
  registrado como desvio consciente do requisito, revisitável se o dono cobrar.
- Investigar os 2 locais físicos com saldo e sem extrato , vai para o RADAR.

## 7. Critérios de aceite

1. Migration **aditiva** (`prisma migrate deploy` limpo, nenhuma coluna existente alterada),
   **incluindo a etapa de SQL cru** dos índices únicos parciais `WHERE vigente` `[R2-2]`,
   seguida de `agente schema-changed` (Postgres compartilhado entre worktrees) `[R1-8]`.
2. Rodar a captura duas vezes sem mudança grava linhas na primeira (`status = 'base'`) e
   **zero** na segunda (`status = 'ok'`), e registra as duas rodadas.
3. Alterar um preço no raw, reconstruir o fato **e chamar a função de captura** faz aparecer
   **uma** linha nova com o valor novo em `fato_preco_historico` `[R2-8]`. (Escrever no Odoo
   não é executável: a escrita só existe pelas tools `write:*` do MCP `[R1-16]`.)
4. Remover uma chave do fato e capturar grava **uma** linha `evento = 'baixa'` (valor NULL);
   reinserir a chave e capturar grava **uma** `evento = 'mudanca'` (ressurreição) `[R2-4]`.
5. Bootstrap com o par duplicado 15049 presente **não aborta**: grava **uma** linha para a
   chave `[R2-1]`.
6. Simular sumiço acima do teto faz a rodada ser **recusada**, com motivo, e **nenhuma** linha
   gravada; K rodadas recusadas com contagem estável destravam numa nova `base` `[R2-5]`.
7. Uma captura de preço no ciclo **escopado** (clique) **não** roda; só no cron `[R2-3]`.
8. `serieDePreco` devolve o vigente no início mesmo quando a última mudança é **anterior ao
   corte**, e a janela exibida continua grampeada ao corte `[R1-6]`.
9. `docker compose build app` + `up -d --force-recreate worker mcp app`, conferindo
   `docker image inspect nexus-odoo:local --format '{{.Created}}'` (`build worker` é no-op)
   `[R1-8]`.
10. `tsc` e a suíte inteira verdes; E2E contra o cache real, com número conferido.
