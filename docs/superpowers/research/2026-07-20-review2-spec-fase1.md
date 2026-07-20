# Review 2 (adversarial, 2x mais profunda) da SPEC v2 , Fase 1: base de cálculo de Entregas Parciais

> Revisor cético sênior. Confronto contra o CÓDIGO real e o CACHE `nexus_odoo_l1` (sync de hoje).
> Regra do projeto: sem travessão. Foco desta review: FACTIBILIDADE TÉCNICA e TESTABILIDADE.
> Método: (a) checar se os achados da Review 1 foram REALMENTE resolvidos na v2 (não só citados);
> (b) caçar o que ainda vai doer na execução.
> Veredito: a v2 fechou a maioria dos buracos conceituais da Review 1, MAS a espinha técnica do
> Bloco B (o "override por-modelo" e o "reconcile dirigido") continua otimista. Dois passos que a
> spec descreve como existentes NÃO existem no código, e a mitigação central do volume de itens é
> FALSA. Precisa de v3 antes do plano.

---

## Parte 1 , Os achados da Review 1 foram resolvidos na v2?

| Achado R1 | Onde na v2 | Resolvido de verdade? |
|---|---|---|
| B1 (override não é só corte.ts) | RF7 (enumera os 4 pontos) | PARCIAL. Enumera os pontos, mas não define o CONTRATO (assinatura) nem a persistência. Ver BLOCKER-3. |
| B2 (item ausente vira IGNORAR) | RF3 aceite item-a-item; R4 | SIM. Critério de aceite agora exige item veio, CFOP saiu, entraDemanda, bucket. |
| B3 (KPI diverge do card) | RF10 | PARCIAL. Trata o comentário de entregas-parciais.ts, mas ignora OUTROS pontos que afirmam a igualdade. Ver IMPORTANT-2. |
| I1 (whitelist autoritativa) | RF2 (ordem cravada, remove ehExcecao) | SIM. Ordem correta, motivo correto (226 in 27, não flag). |
| I2 (gate tipo=venda) | RF3 + Q1 (medir antes) | SIM na decisão. Medição feita nesta review (ver MINOR-1): remove 0 linhas hoje. |
| I3 (o alvo é atendimento.ts, não os derivados) | RF7 item 3 + R3 | SIM no conceito. Falta o detalhe de que o domínio é const de import. Ver MINOR-2. |
| M1 (toggle já existe) | RF9 | SIM. Confirmado: page.tsx:76 já passa `ignorarCorteDados`. |
| M3 (purge vira guard) | RF7 item 4 | SIM como requisito (depende do contrato de BLOCKER-3). |
| M4 (números fixos) | Seção 7 (consultas ao vivo) | SIM. |
| M5 (global vs local) | Seção 1 | SIM. |

Conclusão da Parte 1: os buracos CONCEITUAIS foram fechados. Os buracos de IMPLEMENTAÇÃO do Bloco B
foram apenas nomeados, não resolvidos. É exatamente onde a execução vai travar.

---

## Parte 2 , Novos achados (factibilidade e testabilidade)

### BLOCKER-1 , O "reconcile dirigido" (RF8/Q4) NÃO EXISTE. É um passo mágico.
Evidência: `src/worker/sync/processors.ts:165-201` , `processReconcileCycle` faz `for (const entry of catalog)`
e chama `reconcileModel(ctx.client, rawDelegate(...), model)` (linha 187) para CADA modelo incremental.
`reconcileModel` (`reconcile.ts:51`) recebe só `(client, raw, odooModel)` e reconcilia o MODELO INTEIRO.
Não há assinatura para "reconcilie só estes pedidos" nem para "só estes 2 modelos". O ciclo roda por
timer (`index.ts:388`, `reconcileIntervalMin`, default 1440min). Ou seja: não existe caminho para disparar
um reconcile só de `pedido.documento` + `sped.documento.item`. A spec RF8 diz "reconcile dirigido para
trazer os pedidos antigos + itens" como se fosse um botão pronto.
Recomendação v3: especificar um SCRIPT one-off novo (ex.: `scripts/backfill/entregas-antigas.ts`) que
importa `reconcileModel` e o chama explicitamente para `pedido.documento` e depois `sped.documento.item`,
com o override ativo, e roda `syncAtendimento` na sequência. Dizer que NÃO se apoia no ciclo de 24h.

### BLOCKER-2 , A mitigação do volume de itens (RF7/R2) é FALSA. Recuar o item inunda com as notas.
Evidência de código: `corteDomainHerdado("sped.documento.item")` (`corte.ts:56-83`) devolve
`["documento_id.data_emissao", ">=", X]` , filtra pela DATA DO PAI, SEM cláusula de `pedido_id`.
Evidência de cache (medido hoje):
```
raw_sped_documento_item vivos: sem_pedido(nota) = 211.579 | com_pedido = 19.798
```
91% dos itens são itens de NOTA (pedido_id ausente). O reconcile de `sped.documento.item` (reconcile.ts:94-99)
usa esse domínio herdado; recuar `X` traz TODOS os itens de nota antigos, exatamente o volume (~172 mil)
que a spec diz evitar. A frase da RF7/R2 "aplicar o override no campo do pai SEM recuar o pai inteiro
(evita os 172 mil itens)" é incorreta: NÃO recuar o corte próprio de `sped.documento` não impede a inundação,
porque o filtro do ITEM é sobre a data do pai, não sobre `pedido_id`. Para restringir aos itens de pedido é
preciso ADICIONAR `["pedido_id", "!=", false]` ao domínio de reconcile do item , algo que `corteDomainHerdado`
e `reconcileModel` não suportam hoje.
Recomendação v3: cravar que o back-fill do item usa um domínio `[pedido_id != false] + [documento_id.data_emissao >= X]`
(o mesmo shape que `atendimento.ts` já usa em `DOMINIO_ATENDIMENTO`, linhas 38-41), e dizer QUEM constrói
esse domínio (não é o `corteDomainHerdado` atual). Sem isso, R2 promete uma coisa que o código faz ao contrário.

### BLOCKER-3 , O contrato do override e sua PERSISTÊNCIA não estão definidos. Sem isso, RF7 é placeholder.
Evidência: `corteDomain(odooModel)` e `corteDomainHerdado(odooModel)` (`corte.ts:35,56`) recebem SÓ o modelo e
leem a constante de módulo `CORTE_INGESTAO_ISO`. `atendimento.ts:38-41` monta `DOMINIO_ATENDIMENTO` como
CONSTANTE DE MÓDULO congelada no import. Introduzir um `Map<odooModel,dataISO>` exige:
(a) mudar a assinatura de `corteDomain`, `corteDomainHerdado` e `reconcileModel` para receber o override, propagando
por todos os call sites (reconcile.ts:61,94,96; processors.ts:187); (b) transformar `DOMINIO_ATENDIMENTO` de const em
função. A spec não especifica nem a assinatura nem ONDE o override vive (constante hardcoded em corte.ts? AppSetting
em runtime?). Isso importa: se o override não for PERSISTENTE, o próximo ciclo de reconcile/purge com o global 2026
re-remove os antigos (a classe exata do PR #168). RF7 diz "recuar antes do back-fill" mas não diz que ele fica
ligado para sempre nem onde esse estado mora.
Recomendação v3: decidir e escrever , override é constante literal em `corte.ts` (ex.:
`const OVERRIDE_INGESTAO = new Map([["pedido.documento","2025-06-01"], ...])`), deployada com o código, lida por
corteDomain/corteDomainHerdado/atendimento/purge. Dizer que é permanente. Listar cada assinatura que muda.

### IMPORTANT-1 , O recuo NÃO é "dirigido": traz o window inteiro de pedidos para o fato GLOBAL.
Evidência: `pedido.documento` TEM corte próprio (`model-catalog.ts:83`, `data_orcamento`). Recuar o override
dele faz o reconcile trazer TODOS os pedidos vivos daquela janela (todos os tipos, abertos e fechados), não só
os 51 em aberto. E `fato_pedido` materializa TODO o raw vivo, sem filtro de corte (Review 1). Logo os antigos
entram em `fato_pedido` GLOBALMENTE. A promessa "antigos só neste relatório" depende 100% de CADA consumidor de
`bucket=ABERTA` grampear `dataOrcamento >= corte`. Verifiquei os consumidores:
- `pedidos.ts:78-80` clampa. `comercial.ts:60,74,93,111,222` clampa. `entregas-parciais.ts:159` usa a janela própria.
- MCP `comercial_demanda_em_aberta` reusa `queryDemandaEmAberta` (comercial.ts), que clampa , NÃO vaza (ver Parte 3).
- `estoque.ts:925-928` usa `periodoWhere(...,"dataOrcamento")` com bucket ABERTA , o default de `periodoWhere` PRECISA
  cair no corte; confirmar no aceite.
Recomendação v3: elevar isto a INVARIANTE explícito ("nenhum consumidor de fato_pedido ABERTA pode ler sem clamp de
corte") e adicionar um critério de aceite que rode um grep/teste de que todo consumidor clampa. O isolamento do
Bloco B é uma propriedade EMERGENTE do read-side, não uma garantia do write-side.

### IMPORTANT-2 , RF10 conserta um comentário e esquece os outros lugares que afirmam KPI==card.
Evidência (grep): além de `entregas-parciais.ts:8-9`, afirmam a igualdade:
- `src/components/diretoria/blocos/blocos-pedidos.tsx:163` , hint do KPI: "Saldo a atender, a custo (bate com o card)".
- `src/lib/diretoria/atendimento-item.ts:3` , comentário "peça compartilhada entre o card ... e ...".
Quando o toggle de antigos estiver ligado, esses textos ficam FALSOS (a tabela e os KPIs incluem +antigos; o card
segue 2026). RF10 fala em "rótulo de janela na UI" mas não enumera os hints a corrigir.
Recomendação v3: RF10 deve listar `blocos-pedidos.tsx:163` (hint) e o comentário de `atendimento-item.ts`, e cravar
que a UI mostra o rótulo de janela SEMPRE que o toggle diverge. Testável: com toggle on, o rótulo aparece.

### IMPORTANT-3 , Ordem/atomicidade: o ciclo incremental de 3min pode correr contra o back-fill.
Evidência: `fato-pedido-classificacao.ts` é o builder de POS-PASSO do ciclo "incremental" (roda a cada ~3min) e faz
truncate/insert + reclassifica. `syncAtendimento` roda 1x/dia. Se, entre o reconcile (itens entram) e o `syncAtendimento`
manual, um ciclo incremental rebuildar os fatos, os itens antigos entram com `quantidade_a_atender` NULL e o
`aAtenderDoItem` cai na quantidade cheia , a view com toggle mostra a_atender inflado até o atendimento rodar; pior,
se os itens chegarem depois do pedido num rebuild intermediário, o pedido antigo aparece como IGNORAR (R4) por uma janela.
RF8 lista a ordem (reconcile -> atendimento -> rebuild) mas não exige rodar a sequência como uma OPERAÇÃO ATÔMICA
(pausar o ciclo incremental, ou rodar tudo e só então soltar o ciclo).
Recomendação v3: RF8 deve mandar pausar/segurar o ciclo incremental durante o back-fill, ou rodar
reconcile+atendimento+rebuild numa janela em que o incremental não dispare, e verificar a_atender dos antigos ANTES de
liberar. Sem isso, o E2E vai pegar números inflados intermitentes e ninguém vai saber por quê.

### MINOR-1 , RF3 muda a query do builder (não dito) e hoje remove 0 linhas (medição de Q1).
Medição pedida em Q1, feita agora: `select tipo, count(*) from fato_pedido join raw_pedido_documento where bucket='ABERTA'`
retorna `venda | 410` , ZERO pedidos não-venda estão ABERTA hoje. RF3 é uma salvaguarda de FUTURO, não uma correção
de número atual (o gate de operação já mata o romaneio da Review 1 antes do bucket). Além disso, as duas queries gêmeas
(`classificarPedidosDoRaw` L100-117 e `rebuildFatoPedidoClassificacao` L190-202) NÃO selecionam `tipo`; adicionar o gate
exige `substring`/`data->>'tipo'` nas duas + passar ao `classificaEtapaDemanda`. `tipo` existe no raw (2595/2595).
Recomendação v3: escrever que RF3 (a) altera as duas queries para trazer `tipo`, (b) remove 0 hoje e serve de guard.

### MINOR-2 , I3 residual: o domínio do atendimento é const de import, não função.
Evidência: `atendimento.ts:38` `export const DOMINIO_ATENDIMENTO = [...]` , congelado com `CORTE_INGESTAO_ISO`
no momento do import. RF7 item 3 diz que o job "tem que enxergar o override" mas não flagra que a const precisa virar
função (ou ler o override em runtime). Pequeno, mas se esquecido, o override não chega ao atendimento e o a_atender dos
antigos nunca atualiza (o bug I3 volta).
Recomendação v3: item explícito , `DOMINIO_ATENDIMENTO` vira função que consulta o override.

### MINOR-3 , RF9 já está pronto (confirmação, não trabalho).
Evidência: `page.tsx:67,76` , `const incluiAntigos = param("entregas_todos") === "1"` e
`queryEntregasParciais(..., { ignorarCorteDados: incluiAntigos })`. O toggle, o param de URL e o piso 2000
(`entregas-parciais.ts:149-153`) já existem e já estão fiados na UI. RF9 é verificação, não construção.

---

## Parte 3 , O que verifiquei e DESCARTEI como falso positivo
- "O Nex/MCP vaza os pedidos antigos": FALSO. `comercial_demanda_em_aberta` (mcp/tools/comercial/demanda-em-aberta.ts:9,120)
  reusa `queryDemandaEmAberta` de `comercial.ts`, que clampa `dataOrcamento >= corteAtualDate()` (linhas 60,222). O toggle
  de janela ampla existe SÓ em entregas-parciais.ts e SÓ page.tsx o aciona. Isolamento do MCP confirmado.
- "pedido.documento também precisa de herança de corte": FALSO. Tem corte próprio (`data_orcamento`, catalog:83); o reconcile
  recua direto via `corteDomain`. Só o ITEM (`sped.documento.item`) tem o problema de herança (BLOCKER-2).
- "as duas funções gêmeas do builder divergiram": FALSO. `classificarPedidosDoRaw` e `rebuildFatoPedidoClassificacao` têm a
  MESMA lógica de bucket (L120-148 e L206-234); RF2 acerta ao mandar tocar as duas.
- "fato_pedido tem corte e protege as demais telas": FALSO (e é por isso que IMPORTANT-1 importa). `fato_pedido` materializa
  todo o raw vivo sem corte; a proteção é 100% no read-side de cada consumidor.

---

## Veredito e caminho para a v3
A v2 está boa no conceito e fraca na engenharia do Bloco B. Para a v3:
1. BLOCKER-1: especificar o script de back-fill dirigido (o reconcile por-modelo não existe pronto).
2. BLOCKER-2: corrigir a premissa do volume , o item precisa de `pedido_id != false`, senão inunda com 211k notas.
3. BLOCKER-3: definir contrato (assinaturas que mudam) e persistência do override (constante literal, permanente).
4. IMPORTANT-1/2/3: invariante de clamp em todo consumidor + enumerar os hints de UI + atomicidade do back-fill vs ciclo 3min.
5. MINOR-1/2/3: RF3 mexe nas 2 queries e remove 0 hoje; DOMINIO_ATENDIMENTO vira função; RF9 é só verificar.
