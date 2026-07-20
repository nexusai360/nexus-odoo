# Review adversarial do PLAN Fase 1B (recuo cirurgico do corte de ingestao)

> Foco: SEGURANCA de dado (anti PR#168). Evidencia no codigo/SQL. Sem travessao.
> Plano: `docs/superpowers/plans/2026-07-20-fase1b-corte-antigos.md`.

## Veredito
O nucleo anti perda de dado esta CORRETO e provado. O caminho feliz nao reintroduz o PR#168.
O risco material remanescente NAO e perda no caminho feliz, e sim: (a) uma mina de rollback que
re-arma o PR#168, (b) o recuo do item ser chaveado por um campo DIFERENTE do que a Task 0 mede,
e (c) a verificacao de vazamento (Aceite F) cobrir 3 arquivos de ~30 consumidores.

## O que VERIFIQUEI e descartei como seguro (nao e falso verde)
- **Item nunca e marcado rawDeleted pelo reconcile.** `corteDomain("sped.documento.item")=[]`
  (so tem `cortePai`, catalog L113), entao `vivos = searchIds(item, [])` = modelo INTEIRO
  (reconcile.ts L61,94-98). Movimento 1 so marca deletado quem some de `vivos`; com `vivos`
  amplo, nenhum item antigo cai. A UNIAO so entra no `universoParaInserir` (L95-98), nao na
  delecao. Confirmado.
- **Header protegido pela ordem.** Override deployado ANTES do back-fill: `vivos(pedido) =
  data_orcamento>=2024-11` ja inclui os antigos, entao movimento 1 nunca os marca. Worker
  parado no runbook = sem reconcile concorrente. Ordem correta.
- **UNIAO de `corteDomainHerdado` nao regride a rede das notas.** Item 2026 (pedido OU nota)
  continua coberto pelo ramo 1 (pedido, doc>=2024-11 ⊇ 2026) ou ramo 2 (nota>=2026). Nada
  perde cobertura. Notacao prefixa `["|","&",A,B,"&",C,D]` e Odoo valida. Troca de tipo de
  retorno e contida: unico call-site e reconcile.ts L94 (via `.length`/`searchIds`).
- **BLOCKER-2 provado por construcao.** Ramo de nota isolado em `pedido_id=false AND >=2026`;
  `item_nota` nao pode crescer. Confirmei no cache: 19.880 itens de pedido, 0 sem `documento_id`.
- **Corretude executavel OK:** `DOMINIO_ATENDIMENTO` so usado em atendimento.ts+test (grep
  limpo). `rebuildFatoPedido/Item/Classificacao`, `markFatoBuilt`, `CHAVE_BUILD_ATENDIMENTO`
  existem. `fato_pedido_item` deriva SO de `raw_sped_documento_item` (nao junta o doc pai).
  Read-side: `janelaClampada` piso 2026 (nao vaza antigos), `janelaDemandaAberta`
  PISO=2000-01-01 (o Goal aparece de fato). Confirmado.

## Achados priorizados

1. **[ALTO , mina de rollback re-arma o PR#168]** A sobrevivencia dos antigos depende 100% do
   literal `OVERRIDE_INGESTAO` continuar em `corte.ts`. Um rollback de imagem (ou revert do
   commit) para uma versao pre-1B faz o proximo reconcile diario ter `vivos(pedido)=
   data_orcamento>=2026-01-01` e marcar TODO pedido 2024-11..2025 como `rawDeleted` (reconcile.ts
   L61,66-73). E exatamente o PR#168, disparado por um rollback inocente. O plano chama o
   override de "PERMANENTE" mas nao ha: (a) teste que trave a presenca/valor do override, (b)
   aviso no runbook de que rollback re-arma o problema para essas linhas. **Correcao:** teste
   asserindo o conteudo de `OVERRIDE_INGESTAO` + secao "HAZARD de rollback" no runbook (Task 6).

2. **[MEDIO , Task 0 mede o campo ERRADO]** O recuo do ITEM e por `documento_id.data_emissao`
   (campo do doc pai), mas a Task 0 so mede `min(data_orcamento)` do pedido. Sao campos de
   modelos diferentes. Medi no cache: o doc pai do item de pedido acompanha a data do pedido
   (2458/2588 no mesmo mes), entao na pratica os itens devem vir; MAS se algum pedido antigo em
   aberto tiver doc pai com `data_emissao` NULL ou < override, seus itens NAO vem (header
   aparece com ZERO itens, em silencio). **Correcao:** a Task 0 tem que medir tambem
   `min(documento_id.data_emissao)` dos itens dos pedidos antigos em aberto, e cravar o override
   pelo MENOR dos dois. Aceite A ja pega o sintoma, mas tarde.

3. **[MEDIO , orfaos por design, nao coberto no plano]** Os itens antigos entram, mas o doc pai
   (`sped.documento`, `data_emissao` ~2024-11) NAO e back-fillado (fica no corte 2026, sem
   override). Logo `documento_id` do item aponta para uma linha ausente em `raw_sped_documento`.
   Verifiquei que `fato_pedido_item` NAO junta o doc pai, entao o builder tolera; e o purge do
   item (`wherePre2026Neto`) so deleta se o pai estiver em `raw_sped_documento WHERE data<corte`,
   e o pai nem existe, entao nao apaga. Sem perda. Mas o plano NAO reconhece o orfao; qualquer
   consulta futura que junte item->doc pai vai quebrar em silencio para os antigos. **Correcao:**
   documentar o orfao esperado no plano/kpis e no Aceite A verificar que o item materializa em
   `fato_pedido_item` (nao so em `fato_pedido`).

4. **[MEDIO , Aceite F incompleto]** Ha ~30 consumidores de `fato_pedido` (suite MCP comercial +
   diretoria + reports); o Aceite F grepa so 3 arquivos. A maioria dos tools MCP e wrapper fino
   de `comercial.ts` (que clampa certo via `janelaClampada`), o que reduz o risco, MAS ficam de
   fora `src/lib/diretoria/queries/vendas.ts`, `entregas-parciais.ts` e o `pedidos-por-vendedor`
   (usa `resolverPeriodoCorte` proprio). Antes de 1B nao havia pedido pre-2026 no fato, entao um
   clamp esquecido nunca vazava; 1B torna o clamp load-bearing. **Correcao:** o grep tem que
   cobrir todos os consumidores de `fato_pedido`, e o check empirico "numeros nao mudam" (o real
   guard) precisa rodar faturamento/a-receber/vendas-por-periodo em TODAS as superficies, nao 3.

5. **[BAIXO , volume do item nao medido antes]** `item_pedido` "PODE crescer" mas nada estima o
   delta; a Task 0 so conta headers. O DRY-RUN (Task 8) e o gate real. Alem disso o insert de
   HEADERS traz TODOS os pedidos 2024-2025 de todos os status/tipos (nao ~51; ~milhares), so ~51
   viram ABERTA. Deixar isso explicito no runbook para o operador nao se assustar com o dry-run.

6. **[MENOR , placeholders no back-fill]** Task 5 deixa em prosa (nao em codigo) a
   `contarFaltantes()` do DRY-RUN (reconcileModel nao tem modo simular) e o wiring do
   `CicloLock.adquirir` (precisa de Redis). Aceitavel porque o runbook para o worker, mas sao os
   2 unicos pontos sem codigo real do plano.

## Caminho
Solido no anti perda de dado; liberar apos: (1) travar/testar o override e avisar do rollback
[ALTO], (2) Task 0 medir tambem `documento_id.data_emissao` dos itens [MEDIO], (3) documentar o
orfao + Aceite A checar `fato_pedido_item` [MEDIO], (4) ampliar o grep/E2E do Aceite F a todos os
consumidores de `fato_pedido` [MEDIO]. Achados 5-6 sao ajustes de runbook/codigo do script.
