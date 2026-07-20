# Review 1 (adversarial) da SPEC v1 , Fase 1: base de cálculo de Entregas Parciais

> Revisor cético, confronto contra o CÓDIGO e o CACHE REAL (`nexus_odoo_l1`, sync de hoje).
> Regra do projeto: sem travessão. Objetivo: achar erro material antes de virar plano.
> Veredito: a spec tem 3 buracos que hoje passam por "detalhe" e são na verdade a diferença
> entre o relatório mostrar os 51 antigos certos ou mostrar header sem valor. Precisa de v2.

---

## Evidências cravadas no cache (base de todos os achados)

Rodado hoje contra `fato_pedido` / `raw_pedido_etapa` / `raw_pedido_documento`:

- **`fato_pedido` NÃO filtra `tipo`.** Materializa TODOS os `raw_pedido_documento` vivos:
  venda 1457, producao 488, transferencia_entrada 182, transferencia_solicitacao 187,
  romaneio 168, inventario 50, compra 36, transferencia_saida 7, requisicao 2, devolucao 1.
  (`src/worker/fatos/fato-pedido.ts` linhas 84-118: `findMany({ where:{rawDeleted:false} })`,
  zero cláusula de tipo).
- **As 27 etapas têm os 3 flags = false** (`finaliza_faturamento`,
  `finaliza_pedido_confirmando`, `finaliza_pedido_cancelando`), inclusive a 226. As etapas 87
  e 226 são de `tipo=romaneio` NO CADASTRO DA ETAPA, mas os pedidos nelas são `tipo=venda`.
- **Pedidos reais nos 27 (com item, categoria=venda, bucket=ABERTA hoje):** 87 (5), 171 (7),
  203 (13, transfer DF x Sergipe passa como venda), 226 (7). Fluxo normal: 167 (128), 132
  (80), 133 (75), 86 (49), 95 (16), 5 (12), 130 (4). Etapas 202/204/205, 180/183/185/186/187,
  103/179/120/121/124/129/4 estão **VAZIAS** hoje.
- **Dentro dos 27 há 1 pedido `tipo=romaneio`** (396 venda + 1 romaneio). O oficial exige
  `pd.tipo='venda'`; nosso builder não filtra tipo. Divergência real de 1 pedido.
- **Cancelado (id 6): 2 pedidos ABERTA, R$ 60.575,89** (+1 IGNORAR). Bug vivo, whitelist remove.
  Id 123 (VF-Cancelado): 0 linhas hoje.
- **min `data_orcamento` de venda = 2026-01-04.** Nenhum pedido pré-2026 no cache (confirma os
  51 ausentes). **Romaneios derivados no cache: min `data_orcamento` = 2026-03-25** (os
  derivados antigos também estão ausentes).
- **`a_atender` vem do campo COMPUTADO do Odoo** `quantidade_a_atender_pedido`
  (`model-catalog` linha 113, `extraFields`), sincronizado pelo job `atendimento.ts`, que
  **importa `CORTE_INGESTAO_ISO` HARDCODED** (linhas 24 e 40) e filtra
  `documento_id.data_emissao >= 2026-01-01`.
- **`fato_pedido_item` deriva de `raw_sped_documento_item`** por `pedido_id`
  (`fato-pedido-item.ts` linha 53-58). Esse modelo NÃO tem corte próprio: herda de
  `sped.documento` via `documento_id.data_emissao` (`model-catalog` linha 113, `cortePai`).

---

## BLOCKERS

### B1. RF6 subestima o "override por-modelo": não é só `corte.ts`, e o modelo de herança impede o recuo cirúrgico como escrito
Evidência: `src/worker/sync/corte.ts` é fonte única, mas o corte de ingestão é lido em VÁRIOS
pontos que a spec não enumera:
- `src/worker/sync/atendimento.ts` (linhas 24, 40) importa `CORTE_INGESTAO_ISO` direto e filtra
  `documento_id.data_emissao >= CONSTANTE`. É o job que mantém o `a_atender` fresco. Se o
  override for um mapa por-modelo e a CONSTANTE global ficar em 2026, este job **nunca relê os
  itens antigos** e o `a_atender` dos 51 pedidos fica congelado/errado (ou NULL).
- `src/worker/sync/reconcile.ts` (linha 61 `corteDomain`, linha 94 `corteDomainHerdado`): quem
  traz os faltantes. Para `sped.documento.item` usa `corteDomainHerdado`, que hoje usa a
  CONSTANTE global e o campo do PAI (`documento_id.data_emissao`).
- Herança: `sped.documento.item` NÃO tem data própria; seu corte É `documento_id.data_emissao`
  (o corte do PAI `sped.documento`). "Recuar só `sped.documento.item`" é incoerente com o
  modelo, porque o filtro do item é sobre a data do documento pai. Ou se recua `sped.documento`
  (traz TODAS as notas antigas, ~172 mil itens, exatamente o volume que o "cirúrgico" queria
  evitar), ou se reescreve `corteDomainHerdado` para aceitar uma data de override por-modelo
  aplicada ao campo do pai sem recuar o pai inteiro. A spec RF6 ("Override por-modelo em
  `corte.ts`") vende isso como mudança pequena; é uma mudança que atravessa `corte.ts`,
  `corteDomain`, `corteDomainHerdado`, `atendimento.ts` e o purge.
Recomendação v2: RF6 tem que LISTAR todos os pontos de leitura do corte e definir o contrato do
override (um `Map<odooModel, dataOverride>` consumido por `corteDomain`, `corteDomainHerdado` E
`atendimento.ts`), e resolver explicitamente a herança do item (documentar se traz `sped.documento`
antigo ou aplica o override no campo do pai). Sem isso, RF6 é um placeholder.

### B2. Cadeia de falha RF6 -> RF3: pedido antigo sem item vira IGNORAR e some do relatório
Evidência: a classificação depende do CFOP do ITEM (`fato-pedido-classificacao.ts` linha 121:
`classificaOperacao({ cfop: p.cfop, ... })`). Se o item não vier, `cfop=null` ->
`classificarCfop` retorna `sem_cfop` (`classificar.ts` linha 16) -> `entraDemanda=false`
(`classifica-operacao.ts` linha 61) -> `bucket=IGNORAR` (`fato-pedido-classificacao.ts` linha
127). Ou seja: trazer só o HEADER (`pedido.documento`) sem os ITENS certos (`sped.documento.item`,
que é o ponto frágil de B1) faz os 51 antigos entrarem no cache como IGNORAR e **não aparecerem
no relatório**, contradizendo o critério de aceite "os 51 antigos aparecem". A spec trata header
e item como se recuar o header bastasse.
Recomendação v2: o critério de aceite tem que exigir, para os 51, que (a) o item veio, (b) o CFOP
representativo saiu do item, (c) `entraDemanda=true` e (d) `bucket=ABERTA`. Verificar item a item,
não só "apareceu o pedido".

### B3. Contradição INV2 (4 pontas idênticas) x D6b/RF7 (antigos só aqui): os KPIs deste relatório vão DIVERGIR do card
Evidência: `entregas-parciais.ts` garante por construção que "no mesmo escopo (corte + empresa +
UF) o KPI de custo daqui é idêntico ao card 'Demandas a entregar'" (comentário linhas 8-9 e a
lógica de `aAtenderDoItem`). RF7/D6b dá a este relatório uma janela PRÓPRIA que ignora o corte e
mostra +51 pedidos / +R$ 13,4 mi. Resultado inevitável: os KPIs deste relatório passam a NÃO
bater com o card da diretoria nem com o Nex, que seguem no corte 2026. A spec afirma INV2 ("Painel
= Relatórios = Nex") e ao mesmo tempo D6b ("antigos só neste relatório"). As duas coisas não
convivem sem uma decisão explícita.
Recomendação v2: declarar que os KPIs de Entregas Parciais DIVERGEM do card por janela (e o quanto),
reescrever o comentário-invariante de `entregas-parciais.ts`, e decidir se os 51 antigos entram
também nos KPIs (topo) ou só na TABELA. Sem isso, vira bug reportado ("os números não batem").

---

## IMPORTANTES

### I1. RF2 "salvaguarda redundante" é ambígua e pode reintroduzir o bug da 226
Hoje é comprovadamente redundante (as 27 etapas têm os 3 flags false no cache). MAS se a v2
implementar a salvaguarda como `if (finalizaFaturamento || finalizaConfirmando) return FECHADA`
ANTES de checar o whitelist, e o Odoo religar `finaliza_faturamento` na 226 (a exceção "nota
emitida e não entregue" existe justamente porque essa etapa TEM nota emitida), a 226 volta a
FECHADA e a exceção da Mariane quebra em silêncio. A whitelist precisa ser AUTORITATIVA:
`bucket = op.entraDemanda && ETAPAS_DEMANDA_ABERTA.has(etapaId) ? ABERTA : (resto)`; nenhum flag
pode sobrepor a pertença ao conjunto. RF2 hoje diz "respeitadas as regras ... como salvaguarda
redundante", o que abre a porta para a ordem errada.
Recomendação v2: cravar a ordem (whitelist vence flags) e dizer explicitamente que a função
`ehExcecaoNotaEmitidaNaoEntregue` pode ser removida SÓ porque a 226 está no conjunto (não porque
o flag mudou). Responde o Q1: a exceção some sem quebrar PORQUE 226 in 27, não porque era inócua.

### I2. A spec omite o gate `tipo='venda'` do SQL oficial (que ela promete replicar 1:1)
O WHERE oficial tem `pd.tipo='venda'`; nosso builder não filtra tipo. Medido: 1 pedido
`tipo=romaneio` dentro dos 27 que nós marcaríamos ABERTA e o oficial exclui. Pequeno hoje, mas é
divergência estrutural (qualquer não-venda numa das 27 etapas que passe o gate de operação entra
indevidamente). A spec afirma "reproduzir o filtro oficial" no critério de aceite mas não menciona
`tipo` em lugar nenhum.
Recomendação v2: decidir e escrever: ou adicionar `tipo='venda'` ao gate de demanda (é mudança
GLOBAL, pode mexer em outras pontas que hoje contam não-venda como ABERTA , medir antes), ou
documentar a diferença de 1 e assumir. Não deixar implícito.

### I3. Q3 está mal formulado (mas a resposta é favorável) , o risco real é outro
A spec (Q3, RF6) teme que os romaneios DERIVADOS antigos não venham e o "a atender" fique errado.
Confrontado com o código: `a_atender` NÃO é calculado dos derivados no cache; vem do campo
COMPUTADO do Odoo (`quantidade_a_atender_pedido`, `atendimento.ts`). Logo os derivados antigos NÃO
precisam estar no cache para o `a_atender` bater. O risco REAL não é o derivado, é o job
`atendimento.ts` reler os ITENS antigos , e ele está preso ao corte 2026 hardcoded (ver B1). A
spec está mirando no alvo errado.
Recomendação v2: reescrever Q3/RF6 para: o `a_atender` dos antigos depende de `atendimento.ts`
reprocessar os itens antigos; portanto o override tem que alcançar esse job, não trazer romaneios
derivados.

---

## MENORES

### M1. RF7/Q4 já está implementado , a spec trata como incógnita
`entregas-parciais.ts` linhas 26-31 e 149-153: o toggle `ignorarCorteDados` já dá janela própria
(piso `2000-01-01` via `janelaClampada`). Q4 ("mecanismo exato da janela própria") está resolvido:
usar o toggle. Cuidar só de não regredir o default (que hoje bate com o card, ver B3).

### M2. A prova "gate de operação não barra os 27" só vale para as etapas que têm pedido hoje
202/204/205 (transfers), 180/183/185/186/187 (V.O 5923/6923) e 103/179/120/121/124/129/4 (VF)
estão VAZIAS. Se amanhã um pedido cair em 202 com CFOP de transferência,
`classificaOperacao` retorna `transferencia` -> `entraDemanda=false` -> IGNORAR, mesmo estando no
whitelist. A spec (RF3, D5) crava "não barra nenhum dos 27" como fato geral; é fato só do snapshot
atual. Registrar como risco latente, não como garantia.

### M3. "Congelar o purge" (R2) precisa virar guard no código, não recomendação
`scripts/limpa/purge-pre-2026.ts` usa `CORTE_INGESTAO_ISO` como padrão dos predicados. Se o
override for por-modelo (constante global segue 2026), um `--apply` futuro apaga os antigos
trazidos (padrão 2026 os considera pré-corte). "Congelar" por disciplina humana repete a classe do
PR #168. A v2 deve exigir que o purge respeite o MESMO override por-modelo (ou um guard que aborte
se detectar override ativo).

### M4. Critérios de aceite com números absolutos vão variar por sync
"51 pedidos", "R$ 13,4 mi", "324 de 325", "17 a mais" já drift: hoje o cache mostra 16 extras (6
etapas: 170, 3, 161, 6, 154, 93) e a research listava "Emite NF Consumidor Final" que sumiu.
Escrever os critérios como consultas ao vivo com tolerância, não como contagem fixa.

### M5. Escopo GLOBAL x relatório específico está misturado na seção 3
A seção 3 diz "a lista de 27, mudança GLOBAL" e a correção do Cancelado é global (4 pontas), mas o
Objetivo (seção 1) fala em "não alterar as demais telas". A mudança de bucket É global; o que é
local é só a JANELA de data (D6b). A spec conflaria "definição global" com "janela local". Deixar
explícito: definição de ABERTA muda para todos; janela ampla é só deste relatório.

---

## O que verifiquei e DESCARTEI como falso positivo
- **"87 e 226 são ids mortos no whitelist" (Q2): FALSO.** Têm pedidos `tipo=venda` reais (5 e 7),
  categoria=venda, ABERTA. Materializados no `fato_pedido` (que não filtra tipo). Não são mortos.
- **"as duas funções gêmeas do builder existem e são simétricas" (RF2): VERDADEIRO.**
  `classificarPedidosDoRaw` e `rebuildFatoPedidoClassificacao` em `fato-pedido-classificacao.ts`
  têm a MESMA lógica (linhas 120-148 e 206-234). RF2 acerta ao exigir tocar as duas.
- **"a exceção da 226 quebra ao virar whitelist" (Q1): NÃO, se a ordem for whitelist-autoritativa**
  (ver I1). Como 226 está no conjunto, vira ABERTA de graça; a função de exceção pode sair.
- **"Cancelado 6/123 sai sozinho": VERDADEIRO.** Não estão nos 27; whitelist elimina. Confirmado:
  6 tem 2 ABERTA hoje, some.
- **`a_atender` quebrado/NULL: SUPERADO.** Vem do campo computado do Odoo; premissa antiga morta.
