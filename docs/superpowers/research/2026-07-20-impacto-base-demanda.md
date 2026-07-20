# Impacto de mudar a base de "demanda em aberto" (regra dinâmica -> lista fixa de 27 etapas)

Data: 2026-07-20. Perícia de engenharia (só leitura). Autor: análise a pedido do dono.

Decisões do dono a implementar:
1. A definição de "demanda em aberto" passa a usar a LISTA FIXA de 27 etapa_ids curada no
   Odoo: `130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226`.
   Isso remove ~17 etapas de cauda longa (Ajuste Fracionado, Preview NF-Peças, Venda direta
   consumidor final, Emite NF Consumidor Final, Correção, FAT Cliente final) que a regra
   dinâmica hoje marca ABERTA mas o oficial não considera demanda.
2. Corrigir o vazamento das etapas "Cancelado" (id 6) e "VF - Cancelado" (id 123), que têm
   `finaliza_pedido_cancelando = false` no dado real e por isso escapam como ABERTA.

---

## 0. Como a definição funciona hoje (a fonte única)

A "demanda em aberto" é materializada UMA vez, na coluna `fato_pedido.bucket_demanda`
(`ABERTA` | `FECHADA` | `IGNORAR`), pelo builder de classificação. Todas as leituras da
plataforma consultam essa coluna: ninguém reclassifica por conta própria. Esse é o design
explícito de fonte única ("a diretoria lê a MESMA verdade da tool", paridade painel==tool
documentada: 395 pedidos / R$ 77,6M, e 337 pedidos / R$ 21,2M a custo).

Peças da definição:
- `src/worker/fatos/fato-pedido-classificacao.ts` (ÚNICO ponto de escrita). Duas funções com
  a MESMA lógica duplicada: `buildFatoPedidoClassificacao` (in-memory, para testes/uso) e
  `rebuildFatoPedidoClassificacao` (persiste no cache). Ambas precisam ser tocadas juntas.
  Regra atual, por pedido:
  - `op = classificaOperacao(...)`. Se `!op.entraDemanda` -> `IGNORAR`.
  - Senão, `bucket = classificaEtapaDemanda(gatilhos da etapa)` (ou `ABERTA` quando a etapa
    não foi encontrada, fallback perigoso).
- `src/lib/fiscal/regras/classifica-operacao.ts` (GATE de OPERAÇÃO). `entraDemanda` = categoria
  em {`venda`, `exportacao`} E não intragrupo. Exclui simples faturamento 5922/6922,
  transferência, remessa, bonificação, demonstração e intragrupo. Peças entram como `venda`
  porque o item carrega CFOP 5102.
- `src/lib/fiscal/regras/classifica-etapa-demanda.ts` (GATE de ETAPA, a regra dinâmica que vai
  mudar). Ordem: `finaliza_pedido_cancelando` -> IGNORAR; exceção "nota emitida e não
  entregue" (por NOME) -> ABERTA; `finaliza_faturamento` OU `finaliza_pedido_confirmando`
  -> FECHADA; **fallback final -> ABERTA**. É esse fallback ABERTA que causa os dois problemas:
  qualquer etapa sem esses três flags cai em ABERTA, incluindo a cauda longa e os cancelados
  com o flag falso.

Ponto arquitetural crítico: os DOIS gates são ortogonais. A lista fixa de 27 é sobre ETAPA,
não sobre OPERAÇÃO. Ela deve substituir `classificaEtapaDemanda`, NÃO `classificaOperacao`. Se
alguém trocar tudo por "etapa in 27" e largar o gate de operação, o intragrupo e o simples
faturamento voltam a contar como demanda. A regra nova correta é:
`op.entraDemanda && ETAPAS_DEMANDA_ABERTA.has(etapa_id) ? ABERTA : não-ABERTA`.

---

## 1. Inventário completo dos consumidores de `bucket_demanda = 'ABERTA'`

Todos leem a coluna materializada. Nenhum reimplementa a regra (bom: a mudança é única).

### Ponta 1, Menu Diretoria
- `src/lib/diretoria/queries/pedidos.ts` , universo único do módulo "Pedidos & Entregas".
  `carregarAbertas()` filtra `bucketDemanda: "ABERTA"` (+ corte + empresa) e alimenta:
  - `queryIndicadoresDemandas` (B6): `totalPendentes`, `valorAEntregar`, `atrasadas`. Vai para
    o card "Demandas a entregar" e para a Visão Geral (`demandasTotal`, `demandasAtrasadas`).
  - `queryDemandasPendentes` (B2): lista cliente/UF/etapa/prazo/valor.
  - `queryDemandasPorUf` (B4): mapa de demanda por estado.
  - `queryDemandaPorEtapa` (B6b): quebra por etapa (aqui uma etapa "Cancelado" apareceria como
    linha).
  Páginas: `src/app/(protected)/diretoria/pedidos/page.tsx`,
  `.../diretoria/visao-geral/page.tsx`; componente `components/diretoria/pedidos/pedidos-screen.tsx`.
- `src/lib/diretoria/queries/entregas-parciais.ts` , relatório "Entregas Parciais" (sub-aba de
  Pedidos & Entregas). `queryEntregasParciais` filtra `bucketDemanda: "ABERTA"`; KPIs
  `qtdPedidos`, `aAtenderVenda`, `aAtenderCusto` e tabela por item. É o relatório que motivou a
  discussão.
- `src/lib/diretoria/queries/estoque.ts` , A12 `queryEstoqueDisponivelDiretoria` e a
  necessidade de compra. A demanda comprometida = itens de pedidos `bucketDemanda: "ABERTA"`
  (mais `categoriaOperacao='simples_faturamento'` se a política de venda futura estiver
  ligada). Subtrai do saldo físico: erra a demanda, erra o "disponível negativo" e as
  "unidades a comprar". Página `.../diretoria/estoque/page.tsx`.

### Pontas 2 e 3, Relatórios 1.0 e 2.0 (mesma fonte compartilhada)
- `src/lib/reports/queries/comercial.ts` é a fonte das duas versões de relatório E das tools
  MCP comerciais. Três funções leem `bucket_demanda = 'ABERTA'`:
  - `queryDemandaEmAberta`: `WHERE f.bucket_demanda = 'ABERTA' AND data_orcamento >= corte`.
    Total de pedidos, valor a venda/custo, `porEtapa`, lista das mais paradas.
  - `queryDemandaPorProduto`: soma itens de pedidos `bucket_demanda = 'ABERTA'` por produto.
  - `queryEstoqueDisponivel`: saldo menos demanda (`bucket_demanda = 'ABERTA'`
    OR simples faturamento se venda futura), por produto.

### Ponta 4, Agente Nex / MCP
Tools que leem a definição (via `comercial.ts`):
- `mcp/tools/comercial/demanda-em-aberta.ts` (`comercial_demanda_em_aberta`) -> `queryDemandaEmAberta`.
  A descrição da tool mapeia inclusive "carteira a faturar" e "pedidos parados", e faz DRILL
  por etapa (uma etapa "Cancelado" seria drillável).
- `mcp/tools/comercial/demanda-por-produto.ts` (`comercial_demanda_por_produto`) -> `queryDemandaPorProduto`.
- `mcp/tools/comercial/estoque-disponivel.ts` (`comercial_estoque_disponivel`) -> `queryEstoqueDisponivel`.
- `mcp/tools/comercial/pedido-situacao.ts` referencia `bucket_demanda` (apresenta a situação do
  pedido consultado).
- Nex BI / Caminho 3c: `src/lib/agent/bi-schema-reference.ts` (linhas 332-334) INSTRUI o agente
  a montar SQL com `bucket_demanda='ABERTA'` para "produto com mais demanda" e "estoque
  disponível". Ou seja, o text-to-SQL do BI reproduz a definição na mão; se a coluna mudar de
  significado, o BI acompanha de graça, mas o COMENTÁRIO do schema precisa ser reescrito para
  documentar que ABERTA agora é a whitelist de 27.

### Definição (a corrigir)
- `src/worker/fatos/fato-pedido-classificacao.ts`, `src/lib/fiscal/regras/classifica-etapa-demanda.ts`,
  `src/lib/fiscal/regras/classifica-operacao.ts`, `src/lib/fiscal/regras/index.ts` (API pública).

---

## 2. O que NÃO depende da definição de demanda (achado importante)

Não confundir "carteira a faturar" / "a receber" com demanda: elas NÃO leem `bucket_demanda`.
- `src/lib/reports/queries/financeiro.ts` (`queryContasAReceber`): `carteiraAFaturar` e
  `totalAReceber` vêm de `fato_financeiro_titulo`, decididos pelos flags `pedidoFaturado` e
  `notaFiscalId` (título de pedido ainda sem NF = carteira; duplicata ou pedido já faturado =
  a receber). Documentado em `docs/kpis-diretoria.md` §3: "Carteira a faturar = pedido sem
  nenhuma nota", R$ 31,3M, base diferente da demanda. Logo, a troca da definição de demanda
  NÃO mexe nesses dois KPIs financeiros.
- Tools MCP comerciais que usam lógica PRÓPRIA de etapa (não `bucket_demanda`), portanto
  imunes à mudança de definição de demanda: `pedidos-por-etapa.ts` (classifica cancelado por
  regex `/cancel/i` no nome, não pelo flag), `pedidos-listar-top-valor.ts`
  (`etapa_finaliza = false`), `detalhar-pedido.ts`, `tempo-medio-fechamento.ts`,
  `pedidos-por-uf.ts`. Curiosidade útil: `pedidos-por-etapa` já trata cancelado pelo NOME, o
  que confirma que a regra por flag é frágil e que o nome/id é o critério confiável.

---

## 3. Impacto, consumidor a consumidor, da troca por lista fixa de 27

Efeito geral: a whitelist REMOVE do bucket ABERTA (a) as ~17 etapas de cauda longa e (b) os
cancelados (6, 123, não estão na lista). Logo, todos os números de demanda CAEM e ficam
alinhados ao "oficial" do dono. Não há consumidor que fique com número MAIOR.

| Consumidor | O que produz | Muda? | Melhora ou risca? |
|---|---|---|---|
| Diretoria `queryIndicadoresDemandas` | totalPendentes, valorAEntregar, atrasadas | Cai (menos pedidos/valor) | Melhora: sai a cauda longa e o cancelado. `atrasadas` deixa de contar cancelado velho com data vencida. |
| Diretoria `queryDemandasPorUf` / `PorEtapa` / `Pendentes` | mapa, quebra por etapa, lista | Cai; some a linha "Cancelado" e as etapas de cauda | Melhora, consistência com o oficial |
| Diretoria `entregas-parciais` | qtdPedidos + a-atender venda/custo + tabela | Cai | Melhora: itens de pedido cancelado/cauda saem do "a atender" |
| Diretoria `estoque` (A12 + necessidade de compra) | disponível, negativos, unidades a comprar | Demanda comprometida cai -> disponível SOBE, "a comprar" DIMINUI | Melhora se a cauda não era demanda real. RISCO se peças (Preview NF-Peças/NF-Peças) deviam reservar estoque, ver §5. |
| Relatórios 1.0/2.0 `queryDemandaEmAberta` | total, valor, porEtapa, lista | Cai | Melhora, paridade com painel e Nex |
| Relatórios `queryDemandaPorProduto` | ranking por quantidade a entregar | Cai (menos itens) | Melhora |
| Relatórios `queryEstoqueDisponivel` | saldo menos demanda | Igual ao estoque da diretoria | idem estoque |
| Nex `comercial_demanda_em_aberta` | "quanto de demanda", drill por etapa | Cai | Melhora: o Nex para de reportar cancelado/cauda como demanda |
| Nex `comercial_demanda_por_produto` | produto com mais demanda | Cai | Melhora |
| Nex `comercial_estoque_disponivel` | disponível/comprar | idem estoque | idem estoque |
| Nex BI (3c) | SQL livre com `bucket_demanda='ABERTA'` | Segue a coluna automaticamente | Melhora, mas ATUALIZAR o comentário do schema |
| financeiro `carteiraAFaturar` / `aReceber` | R$ carteira, R$ a receber | NÃO muda | Não lê bucket |

Consumidor que precisaria da regra AMPLA: nenhum de forma inequívoca. O único candidato é a
demanda de PEÇAS e de VENDA A CONSUMIDOR FINAL (as etapas "Preview NF-Peças", "Venda direta
consumidor final", "Emite NF Consumidor Final", "FAT Cliente final" saem da lista de 27). Se o
negócio considera que peças/consumidor final geram entrega física pendente que deve (i) contar
como demanda a entregar e (ii) reservar estoque, a whitelist as descarta. Como a curadoria de
27 foi feita pelo dono no Odoo (é o "oficial"), essa é uma decisão de negócio já tomada; o
alerta técnico é só garantir que a queda no estoque comprometido de peças é intencional.

---

## 4. O vazamento do "Cancelado" (id 6 e 123), onde contamina e quanto pesa

Mecânica do bug: a regra só marca IGNORAR quando `finaliza_pedido_cancelando = true`. As etapas
6 ("Cancelado") e 123 ("VF - Cancelado") têm esse flag FALSO no dado. Elas também não têm
`finaliza_faturamento` nem `finaliza_pedido_confirmando`. Portanto caem no fallback final ->
ABERTA. Um pedido cancelado nessas etapas é contado como demanda em aberto.

Onde contamina hoje (TODA leitura de `bucket_demanda='ABERTA'`):
- Diretoria: infla `totalPendentes` e `valorAEntregar`; pior, um cancelado antigo com
  `data_prevista` vencida entra em `atrasadas` (distorce o indicador de atraso); vira linha
  "Cancelado"/"VF - Cancelado" na quebra por etapa e no mapa por UF; os itens do pedido
  cancelado aparecem como "a atender" em Entregas Parciais; e a quantidade cancelada subtrai
  saldo em Estoque Disponível, fabricando "disponível negativo" e "unidades a comprar" que não
  existem (compra fantasma).
- Relatórios 1.0/2.0: o pedido cancelado aparece na lista de demanda e no ranking por produto;
  `porEtapa` mostra "Cancelado" como se fosse uma fila de trabalho.
- Nex/MCP: `comercial_demanda_em_aberta` reporta o valor inflado e permite DRILL na etapa
  "Cancelado" como se fossem pedidos vivos; o agente afirmaria um total de demanda maior que o
  real; `comercial_demanda_por_produto` e `comercial_estoque_disponivel` herdam o erro.
- NÃO contamina `carteiraAFaturar`/`aReceber` (financeiro.ts não lê bucket). Observação lateral
  (fora do escopo bucket, mas vale registrar): um pedido cancelado pode ainda ter título aberto
  (`pedidoFaturado=false`) e, se `financeiro.ts` não filtra cancelamento no título, entraria na
  carteira a faturar por OUTRA via. Recomendo checar `queryContasAReceber` num passo separado.

Quantificação conceitual: o dano é proporcional ao número e valor de pedidos parados em 6/123.
Não medi contra o banco nesta perícia (só leitura de código), então recomendo um
`SELECT count(*), sum(vr_produtos) FROM fato_pedido WHERE bucket_demanda='ABERTA' AND etapa_id IN (6,123)`
antes de fechar, para dimensionar. O ponto forte: como 6 e 123 NÃO estão na lista de 27, adotar
a whitelist ELIMINA o vazamento automaticamente. A correção do Cancelado é um subconjunto da
migração para lista fixa.

---

## 5. Recomendação (com os dois lados)

### 5.1 Lista fixa de 27: GLOBAL, não local

Argumento LOCAL (só Entregas Parciais, mantendo a regra dinâmica nas demais): mudança
cirúrgica, menor risco de mexer em KPIs já validados em produção (77,6M, paridade painel==tool).

Argumento GLOBAL: a arquitetura JÁ é de fonte única. As 4 pontas leem a MESMA coluna
`bucket_demanda`, e o projeto pagou caro por essa paridade (painel == tool == Nex, documentada).
Aplicar a lista de 27 só num relatório QUEBRARIA essa paridade: o painel diria um número, a tool
outro, o Nex um terceiro, para a mesma pergunta. Isso viola o princípio "a UI/tool pergunta ao
domínio, não reimplementa". Além disso, a lista de 27 é o "oficial" do dono; não faz sentido o
oficial valer só numa tela. E o vazamento do Cancelado só é resolvido em todas as pontas se a
correção for na fonte.

Recomendação: GLOBAL, na fonte única. Redefinir COMO `bucket_demanda` é calculado no builder;
todas as pontas herdam sem tocar em cada consumidor. Trocar o gate de ETAPA por whitelist de id
(mais robusto que flags mal preenchidos, que são a causa raiz do bug do Cancelado), preservando
o gate de OPERAÇÃO:

```
bucket = op.entraDemanda && ETAPAS_DEMANDA_ABERTA.has(etapaId) ? "ABERTA" : (cancelamento/fechada)
```

Onde centralizar: uma constante compartilhada, ex. `ETAPAS_DEMANDA_ABERTA: ReadonlySet<number>`
com os 27 ids, em `src/lib/fiscal/regras/etapas-demanda-aberta.ts`, exportada por
`src/lib/fiscal/regras/index.ts` (mesmo lar das outras regras fiscais). O builder importa daí.
O `bi-schema-reference.ts` continua usando a coluna, mas o comentário precisa ser atualizado
para dizer que ABERTA = whitelist de 27 etapas (não mais "etapa sem finaliza").

Cuidados de execução:
- Tocar as DUAS funções em `fato-pedido-classificacao.ts` (build e rebuild), ou refatorar a
  lógica para uma só, evitando divergência.
- Reconciliar a exceção "nota emitida e não entregue": verificar se o etapa_id dessa etapa está
  entre os 27. Se estiver, a exceção é preservada de graça; se NÃO estiver, ela some ao migrar
  para whitelist. Confirmar com o dono antes.
- Manter `classificaOperacao` intacta (intragrupo, simples faturamento 5922/6922, CFOP não
  venda continuam fora). A whitelist NÃO substitui esse gate.
- Manter o piso `data_orcamento >= corte` nas leituras (é filtro de janela, ortogonal).
- Após mudar o builder, RECONSTRUIR os fatos e rebuildar `worker`/`app`/`mcp` (a coluna é
  materializada; sem rebuild + reprocessamento, as telas mostram o bucket velho). E rodar E2E
  contra o cache real conferindo os novos totais.
- Atualizar `docs/kpis-diretoria.md` §6 no MESMO commit (a regra de KPI mudou).

### 5.2 Correção do Cancelado: GLOBAL, e sai junto com a whitelist

A correção deve ser GLOBAL pela mesma razão (fonte única). Na prática ela é gratuita: ao adotar
a whitelist de 27, os cancelados 6/123 deixam de ser ABERTA em todas as pontas de uma vez. Não
faz sentido tirar o cancelado de um relatório e deixar o Nex e a diretoria contando cancelado.

Se por algum motivo a whitelist NÃO for adotada agora, a correção mínima paliativa é tratar
cancelamento por id (6, 123) OU por nome (`/cancel/i`) como IGNORAR dentro de
`classificaEtapaDemanda`, já que o flag `finaliza_pedido_cancelando` não é confiável no dado da
Tauga. Mas isso é remendo; a whitelist é a solução limpa e definitiva.

---

## 6. Resumo executivo

- A definição é fonte única (`fato_pedido.bucket_demanda`), lida por 4 pontas sem reimplementação.
- Consumidores: Diretoria (pedidos.ts B2/B4/B6/B6b, entregas-parciais, estoque A12/compras),
  Relatórios 1.0/2.0 (comercial.ts: demanda em aberta, por produto, estoque disponível), Nex/MCP
  (`comercial_demanda_em_aberta`, `_por_produto`, `_estoque_disponivel`, `pedido_situacao`, BI 3c).
- `carteira a faturar` e `a receber` NÃO dependem de bucket (vêm de `fato_financeiro_titulo`):
  imunes à mudança.
- Lista fixa de 27 reduz todos os números de demanda e os alinha ao oficial; único alerta é a
  demanda de peças/consumidor final e sua reserva de estoque.
- Cancelado (6/123) vaza como ABERTA por flag falso; contamina toda leitura de demanda (inclui
  "atrasadas", estoque disponível e compra fantasma); some sozinho ao adotar a whitelist.
- Recomendação: GLOBAL nas duas mudanças, na fonte única, com constante compartilhada
  `ETAPAS_DEMANDA_ABERTA` (27 ids), preservando o gate de operação e a exceção "nota emitida e
  não entregue" (conferir se seu id está nos 27).
