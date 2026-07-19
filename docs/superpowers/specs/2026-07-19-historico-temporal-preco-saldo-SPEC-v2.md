# SPEC v2 , Histórico temporal de preço e de saldo de estoque

**Frente B do PLAN 4/6.** Origem: reunião com o dono em 2026-07-19
(`docs/superpowers/research/2026-07-19-reuniao-transcricao-BRUTA.md`).
Esta é a v2: a v1 passou por uma review adversarial que derrubou a justificativa central
do desenho e achou dez outros problemas materiais. Os achados estão aplicados aqui, cada um
marcado com `[R1-n]`.

## 1. O pedido, na voz do dono

Guardar, com data e hora, os **preços** e as **quantidades** a cada ciclo de atualização,
para ter **histórico de preço** e **histórico de movimentação de estoque**: "quem saiu, quem
entrou, quando, de quanto era a tabela". Tudo consultável no nosso cache, sem ir ao Odoo.

## 2. Perícia do dado

Medido no cache em 2026-07-19. **O cache está congelado em 2026-07-14 11:43** (`sync_state`,
worker parado no dev): os números abaixo são reais, mas o teto das séries é 14/07, não hoje
`[R1-14]`.

| O que | Estado real | Consequência para o desenho |
|---|---|---|
| `fato_preco` | 12.009 linhas, 7 tabelas (Custo Padrão, Custo /0,3, Custo /0,95, Venda Padrão /0,3, Venda Smart, Custo Smart, Custo Médio Smart). Builder `incremental`. **`(tabelaId, produtoId)` NÃO é única**: 1 par duplicado hoje (tabela 1, produto 15049, `odooId` 22675 e 26299). O grão é a **regra** de preço, com `quantidadeMinima`, `dataInicial`, `dataFinal` (todos zerados/nulos hoje). | O histórico cobre as 7 tabelas, não só a de venda: o custo é a base do KPI de estoque. E a chave da série precisa da `quantidadeMinima` `[R1-4]`. |
| `fato_estoque_movimento` | 22.787 linhas de `estoque.extrato`, com data, produto, local, quantidade, sentido e origem. **Não é histórico nosso: é espelho do Odoo** , builder `snapshot`, `deleteMany` + reinsert a cada 30 min, sobre um raw que também é apagado e refetchado inteiro. Cobre **73 dos 96 locais com saldo**; 2 locais **físicos** e 20 de demonstração têm saldo e zero movimento. Recorte: 06/01 (corte de ingestão 2026-01-01) a 13/07. | Continua fora do escopo reconstruir a movimentação, mas **com ressalva escrita**: se a Tauga arquivar o extrato, o "histórico" evapora, e a resposta é silenciosamente vazia para 23 locais `[R1-7]`. |
| `fato_estoque_saldo_snapshot` | Foto diária cheia, **8 fotos espalhadas por 26 dias** (19/06 a 14/07), com um buraco de 19 dias , cron de horário fixo (09:00 BRT) sem backfill. Carrega família, marca e unidade desnormalizadas. | Não é rede de segurança: já falhou 19 dias seguidos `[R1-5]`. E as dimensões dele têm de ser espelhadas na série nova `[R1-9]`. |
| `fato_estoque_saldo` | 4.622 linhas, reconstruído por DELETE + INSERT **dentro de transação**. | Não há leitura suja possível. O acoplamento ao ciclo tem outro motivo `[R1-1]`. |
| Volume real de mudança | Entre fotos diárias: 0, 12, 69, 86, 223 e 660 linhas alteradas. Chaves que surgem: até 233 numa transição; que somem: 1 em todo o período. | Append por mudança grava ~1% a 5% do que a foto cheia gravaria. E o desaparecimento é raro, mas **não é zero** `[R1-3]`. |
| Cadência dos ciclos | `incremental` 3-10 min; `snapshot` 30 min; `reconcile` 180 min. O incremental também dispara **sob demanda, a cada clique** na Diretoria (`rodarCicloEscopado`). | "A cada 10 minutos" é a cadência do incremental, e ela não tem piso: a captura precisa ser barata por rodada `[R1-11]`. |

## 3. A decisão central: append por mudança, não foto por ciclo

Foto cheia por ciclo custaria ~197 mil linhas de saldo e ~1,73 milhão de linhas de preço por
dia, quase tudo repetição. Gravamos **só a linha que mudou**.

O núcleo para preço existe e está testado (`src/lib/estoque/historico-preco.ts`), mas **não
está completo**: ele itera só sobre os preços atuais, então não representa desaparecimento
(§4.3) e compara com tolerância em float (§4.6). As duas coisas mudam nesta onda.

Consequência que precisa estar escrita na tela e na doc: **o histórico é uma série de
mudanças, não de amostras.** "Qual era o preço em 3 de julho" se responde pegando o último
registro **até** aquela data. E "não mudou" não é o mesmo que "não observamos" , por isso
existe o registro de rodada (§4.4).

## 4. O que será construído

### 4.1 `fato_preco_historico` e `fato_estoque_saldo_historico`

Nome `historico`, não `snapshot`: snapshot é a foto cheia (a tabela diária que já existe);
estas são séries de mudança `[R1-13]`.

**`fato_preco_historico`**

| Coluna | Tipo | Por quê |
|---|---|---|
| `id` | uuid | PK |
| `rodadaId` | uuid | Lote da captura (§4.4). Permite apagar cirurgicamente uma rodada identificada como falsa, sem violar a regra de nunca apagar histórico legítimo `[R1-2]` |
| `capturadoEm` | timestamp | Quando foi observado |
| `tabelaId` / `tabelaNome` | int / text | Nome desnormalizado: o histórico continua legível se a tabela sumir do Odoo |
| `produtoId` / `produtoNome` | int / text | Idem |
| `quantidadeMinima` | decimal(18,4) | **Faz parte da chave** `[R1-4]` |
| `valor` | decimal(18,4) NULL | NULL = baixa (§4.3) |
| `evento` | text | `mudanca` ou `baixa` |
| `vigente` | boolean | Marca a última linha de cada chave (§4.6) |

**`fato_estoque_saldo_historico`**: mesmas colunas de controle (`id`, `rodadaId`,
`capturadoEm`, `evento`, `vigente`), chave `(produtoId, localId)`, mais `quantidade` e
`vrSaldo` (ambas NULL na baixa) e **as dimensões que o snapshot diário já tem**:
`produtoNome`, `localNome`, `familiaId`, `familiaNome`, `marcaId`, `marcaNome`, `unidade`
`[R1-9]`.

Índices, nas duas:
- `(<chave>, capturadoEm)` , a série de um produto;
- `(capturadoEm)` , varredura por período;
- **índice parcial `WHERE vigente`** , a leitura do "último valor por chave" que a captura
  faz a cada rodada (§4.6);
- `@@unique([<chave>, capturadoEm])` , o banco recusa duas linhas para a mesma chave no
  mesmo instante em vez de contaminar a série em silêncio `[R1-4]`.

### 4.2 `fato_captura_rodada` , o registro de que observamos

Uma linha por rodada de captura, de cada série:

| Coluna | Tipo |
|---|---|
| `id` | uuid (é o `rodadaId` das linhas) |
| `serie` | text (`preco` ou `saldo`) |
| `capturadoEm` | timestamp |
| `linhasObservadas` | int (tamanho do fato lido) |
| `linhasGravadas` | int |
| `status` | text (`ok`, `recusada`) |
| `motivo` | text NULL |

É o que permite responder "**entre 14/07 e 19/07 não houve observação**" em vez de afirmar
estabilidade que ninguém verificou `[R1-5]`. Sem isso, o histórico mente por omissão toda vez
que o worker fica fora do ar , e ele ficou, por 19 dias, no dado real.

### 4.3 Baixa: a linha que sumiu

Chave presente na captura anterior e ausente agora gera uma linha `evento = 'baixa'`, com
`valor`/`quantidade` **NULL** , não zero, porque zero é um estado válido e diferente de
"não existe mais" `[R1-3]`.

Sem isso, um produto que sai da tabela de preço congela no último valor conhecido para
sempre, e a consulta responde "o preço em agosto era R$ 21.900" sobre um preço que não
existe. `precosQueMudaram` ganha esse caso, com teste , hoje ele itera só sobre os atuais e
descarta as chaves órfãs em silêncio.

### 4.4 Captura acoplada ao ciclo, com guarda de sanidade

- histórico de **preço**: ao fim do ciclo **incremental**, depois de `rebuildFatoPreco`;
- histórico de **saldo**: ao fim do ciclo **snapshot**, depois de `rebuildFatoEstoqueSaldo`.

**O motivo do acoplamento** `[R1-1]`: a captura tem de observar exatamente o estado que o
ciclo acabou de commitar, e na cadência em que aquele dado muda. Um timer independente
capturaria em cadência própria , três vezes o mesmo saldo entre dois ciclos de snapshot, ou
um preço já substituído. (A v1 justificava isto com leitura suja durante o rebuild; isso
**não existe**: os dois rebuilds rodam dentro de `$transaction`, e o snapshot diário já lê
esses fatos de um worker separado há semanas sem nunca capturar zeros.)

**O risco que existe de verdade** `[R1-2]`: `runBuilders` engole a exceção de cada builder e
segue, e `processSnapshotCycle` chama os builders mesmo quando a sincronização falhou. Um
pull parcial do Odoo (timeout no meio da paginação) encolhe o fato legitimamente, e a
captura gravaria centenas de desaparecimentos falsos , permanentes, numa tabela append-only.
A guarda de defesa tem de estar na captura porque é ela que não pode ser desfeita:

1. **Só captura se o builder daquela rodada teve sucesso.** `runBuilders` passa a devolver o
   status por builder (hoje não devolve nada).
2. **Recusa a captura se a contagem cair além do limiar** (queda de mais de 20% no número de
   linhas do fato desde a última rodada `ok`). Nesse caso grava a rodada com
   `status = 'recusada'` e o motivo, e **não grava linha nenhuma** na série. Uma queda real de
   20% de estoque num ciclo é evento de negócio raro; um pull parcial é rotina.
3. **`rodadaId` em cada linha**, para expurgo cirúrgico do lote se algo passar mesmo assim.

### 4.5 Consulta , as pontas

Funções em `src/lib/estoque/` (fonte única, como a classificação de local):

1. `serieDePreco(produtoId, tabelaId, quantidadeMinima?, de, ate)` , a série de mudanças no
   período, mais o **valor vigente no início** (carry-forward, §4.7).
2. `serieDeSaldo(produtoId, localId?, de, ate)` , idem para quantidade e valor.
3. `movimentacao(produtoId, localId?, de, ate)` , lê `fato_estoque_movimento`. Devolve junto
   a indicação de que **aquele local não tem extrato**, senão "zero movimentos" é lido como
   "nada se moveu" quando na verdade é "não sabemos" `[R1-7]`.

As três devolvem também as **lacunas de observação** do período (rodadas ausentes ou
recusadas, de `fato_captura_rodada`).

Consumidores (as 4 pontas `[R1-12]`): Diretoria, Relatórios, tool do Nex e o BI schema do
agente. Todas leem destas funções , nenhuma reimplementa a regra.

### 4.6 Comparação: igualdade exata, não tolerância

`valor` e `quantidade` são `Decimal(18,4)` no Prisma; o dado já chega quantizado em 4 casas.
Comparar com tolerância em `number` **perde mudança real**: `>= 0.0001` é exatamente a menor
unidade representável, e a subtração em float64 cai abaixo dela com frequência `[R1-10]`.
A comparação é feita sobre a **representação decimal em string** (`Decimal.toString()`), que
é exata. Some a conversão `Decimal → string` como passo explícito da captura.

O "último valor por chave" **não** é obtido com `DISTINCT ON` sobre a tabela inteira , isso
percorreria os 12 mil grupos de um histórico que só cresce, a cada rodada, inclusive nas
rodadas disparadas por clique de usuário `[R1-11]`. A captura lê pelo índice parcial
`WHERE vigente` (uma linha por chave) e, ao gravar, desmarca a anterior e marca a nova, na
mesma transação. Custo por rodada O(chaves), constante no tempo.

### 4.7 Data de início das análises: dois usos distintos

A regra durável do projeto é que a data configurada **filtra a leitura e nunca apaga**. Aqui
ela tem dois papéis diferentes, e confundi-los quebra a consulta `[R1-6]`:

- **A janela exibida** (`de`, `ate`) é grampeada ao corte com `clampIsoAoCorte`, como em toda
  consulta do projeto.
- **O carry-forward** , a busca do valor vigente no início da janela , é leitura de
  **estado**, não de fato analisado, e **alcança antes do corte por desenho**. Sem isso, todo
  preço estável há meses (a maioria: nenhuma das 12.009 linhas tem `dataInicial`) faria o
  gráfico começar no ar, exatamente o problema que o carry-forward existe para resolver.

Isto vai escrito também em `docs/kpis-diretoria.md`, senão a próxima sessão "corrige" de
volta em nome da regra do corte.

A **captura** não olha para essa data: o histórico acumula, e mover a data para trás faz o
passado reaparecer.

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Pull parcial gravar desaparecimentos falsos, para sempre | Guarda de sanidade da §4.4 (status do builder + limiar de queda + `rodadaId` para expurgo do lote) |
| Worker fora do ar (aconteceu: 19 dias) confundido com estabilidade | `fato_captura_rodada` (§4.2); as consultas devolvem as lacunas |
| Chave duplicada no `fato_preco` gerando gravação a cada ciclo | `quantidadeMinima` na chave + `@@unique` no banco (§4.1) |
| Custo da captura crescer com o histórico | Índice parcial `WHERE vigente` (§4.6) |
| Primeira captura gravar 12 mil + 4,6 mil linhas | É a linha de base, uma vez só. A rodada fica registrada como tal |
| Série lida como amostragem | Documentado em `docs/kpis-diretoria.md`; as consultas devolvem carry-forward e lacunas |
| Extrato do Odoo arquivado ou local sem extrato | Ressalva escrita (§2) e sinalização por local na `movimentacao` (§4.5) |
| Container velho validar a entrega com código antigo | Critério de aceite 7 (§7), com a armadilha do `build worker` no-op |

## 6. Fora de escopo

- Telas novas de gráfico de série (esta onda entrega o dado e as funções de consulta).
- Política de retenção/expurgo por idade. O `rodadaId` cobre o expurgo **cirúrgico** de uma
  captura comprovadamente falsa, que é outra coisa.
- Backfill do buraco de 19 dias no snapshot diário (o dado passado não existe mais no Odoo).
- Histórico de preço por participante: as 7 tabelas são `dimensao = produto`.
- Investigar por que 2 locais físicos com saldo não têm movimento no extrato , fica
  registrado no RADAR, não bloqueia esta onda.

## 7. Critérios de aceite

1. Migration **aditiva** aplicada (`prisma migrate deploy` limpo, nenhuma coluna existente
   alterada), seguida de `agente schema-changed` , o Postgres é compartilhado entre as
   worktrees vivas `[R1-8]`.
2. Rodar a captura duas vezes seguidas sem mudança no Odoo grava linhas na primeira e
   **zero** na segunda, e registra **duas** rodadas `ok`.
3. Alterar o valor de um preço **no raw** (`raw_sped_tabela_preco_regra`) e reconstruir o fato
   faz aparecer **uma** linha nova, com o valor novo. (Escrever no Odoo não é executável: a
   escrita só existe pelas tools `write:*` do MCP, e a tabela de preço não está entre elas
   `[R1-16]`.)
4. Remover uma chave do fato e capturar grava uma linha `evento = 'baixa'` com valor NULL.
5. Simular queda de 30% no número de linhas faz a rodada ser **recusada**, com motivo, e
   **nenhuma** linha da série gravada.
6. `serieDePreco` devolve o valor vigente no início do período mesmo quando a última mudança
   é **anterior ao corte de dados**, e a janela exibida continua grampeada ao corte.
7. `docker compose build app` + `up -d --force-recreate worker mcp app`, conferindo
   `docker image inspect nexus-odoo:local --format '{{.Created}}'` , `build worker` é no-op e
   deixaria o worker com o código velho.
8. `tsc` e a suíte inteira verdes; E2E contra o cache real, com número conferido.
