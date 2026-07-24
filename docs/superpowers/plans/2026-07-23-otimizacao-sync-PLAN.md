# PLANO , Otimização do ecossistema de sync (v2)

> Branch: `feat/entregas-parciais-base-calculo`. LOCAL. Base: perícia em
> `2026-07-23-otimizacao-sync-PERICIA.md`. v2 = v1 + achados da review adversarial
> (2026-07-23). Implementação frente por frente (TDD + E2E contra cache real).
> Meta: ciclo incremental mais leve/rápido SEM staleness; depois viabilizar 3min.

## Mudanças da v1 -> v2 (achados aplicados da review)
- C1: gate NÃO cobre mudança de LÓGICA em código (whitelists de etapa/grupo/CNPJ). Fix: **full
  incondicional no 1º ciclo após boot do worker** (todo deploy reinicia o container) + `codeVersion`
  por builder como reforço. Nova task F1.
- C2: `reportFreshness` usa MIN(ultimoBuildAt) -> pular congela a freshness na tela. Fix: coluna
  **`ultimoVerificadoAt`** separada (avança ao pular) + migrar freshness. Entra na migration da F0.
- A3: **NÃO há índice em `synced_at`** (o "O(1)" da v1 era falso). Fix: `@@index([rawDeleted, syncedAt])`
  nas raws gated, na migration da F0.
- A4: `rawSources` da classificação inclui `raw_pedido_etapa` + CFOP + grupo; regra: mudança de
  etapa/grupo => **reclassificação TOTAL**, não por id.
- A5: fatos incrementais não rodam no snapshot -> a "rede full" da v1 era ilusória. Fix: **ciclo de
  reconciliação de fatos** periódico (full de segurança) para os fatos convertidos.
- M6: cursor de delta capturado **ANTES** da leitura da raw (promovido de T3.3 para base da F2) +
  confirmar que o write:* direcionado do MCP toma o ciclo-lock.
- M7: T0.2 , `markFatoBuilt` é chamado DENTRO de cada builder; ms/linhas só existem em `runBuilders`
  depois do `run()`. Fix: **update separado** do FatoBuildState em runBuilders (fora da tx do builder).
- M8: shadow-diff com **critério objetivo de saída + kill-switch** e incluindo as colunas
  materializadas nos fatos-PAI (bucket_demanda/is_venda_externa vivem em fato_pedido/fato_nota_fiscal,
  não no item).
- M9: ordem da F2 pelo **ranking de ms (F0)**, não por volume; builders com custo dominado por
  JOIN/UPDATE cruzado (ex. fato_serial) listados à parte.
- Absolvido pela review (NÃO precisa tratar): split de relógio DB/Node (usa new Date() do Node em ambos);
  synced_at bumpa em update; nenhum builder de ciclo computa idade/vencido por relógio (aging é na
  leitura); corte_dados não é lido por builder. reconcile HOJE não bumpa synced_at (T1.4 necessária).

## Princípio de correção (inegociável)
Toda otimização só entra se o fato resultante for **idêntico** ao do full rebuild, e sem introduzir
staleness (dado velho que a tela mostra como fresco). Duas estratégias, por ordem de risco:
1. **Skip-gate:** pular rebuild quando NENHUM insumo mudou (full de insumo inalterado = idêntico).
2. **Incremental real:** nos builders quentes, reconstruir só linhas afetadas, validado por shadow-diff.
Alvo de delta = **`raw.synced_at`** (avança em toda escrita). Deleção via `raw_deleted`. Cursor capturado
ANTES da leitura. Full de segurança periódico. Nunca synced_at como delta para fatos de ciclo snapshot.

---

## FRENTE 0 , Instrumentação, colunas de estado e índices (habilita tudo; risco baixo)
- **T0.1** Migration ADITIVA em `FatoBuildState` (schema.prisma), tudo nullable/retrocompatível:
  - `ultimoVerificadoAt DateTime?` , última vez que o ciclo confirmou o fato como corrente (avança
    mesmo quando pula). Base do freshness pós-gate.
  - `ultimoBuildMs Int?` e `ultimasLinhas Int?` , métrica por builder.
  - `codeVersion String?` , hash/versão da lógica do builder (para o code-version-bust da F1).
- **T0.2** Migration ADITIVA de índice `@@index([rawDeleted, syncedAt])` nas raws que serão gated
  (as lidas pelos 39 builders incrementais; lista fechada em T1.2). Aplicar nos 3 containers (schema
  compartilhado): protocolo de schema + `prisma generate` + rebuild app/mcp/worker.
- **T0.3** Timing por builder em `runBuilders` (registry.ts:153-173): medir `Date.now()` em volta de
  `run()`; após o retorno, gravar `ultimoBuildMs`/`ultimasLinhas` num **update separado** do
  FatoBuildState (fora da tx interna do builder). Log `${nome}: ${n} linhas em ${ms}ms`. Sem mudar
  comportamento de derivação.
- **T0.4** TDD: runBuilders emite timing e grava as métricas; falha de um builder não derruba os demais.
- **Verificação:** rebuild worker (`docker compose build app` + recreate), rodar 1-2 ciclos, coletar
  **ranking real de ms por builder** (do FatoBuildState). Esse ranking DEFINE a ordem da Frente 2.
- **Migração de schema:** avisar (protocolo), `agente schema-changed`. Como é aditiva e nullable, sem
  quebra para app/mcp.

---

## FRENTE 1 , Skip-gate de dirtiness + anti-staleness (maior ROI; correção provada)
- **T1.1** Estender `FatoBuilderEntry` (registry.ts:51-55): `rawSources?: string[]`, `dependsOn?: string[]`,
  `codeVersion?: string`. Sem `rawSources` => **sempre roda** (fail-safe).
- **T1.2** Mapear `rawSources`+`dependsOn` de TODOS os 39 builders, conferido 1:1 lendo o
  `findMany/queryRaw` de cada um (não confiar em suposição). Sub-task por grupo. Casos que a review
  destacou (mapear com cuidado):
  - fato_pedido_item: rawSources [raw_sped_documento_item], dependsOn [fato_produto].
  - fato_pedido_classificacao: rawSources [raw_pedido_etapa, raw_sped_documento_item, raw_pedido_documento,
    <fonte do grupo/participantes>], dependsOn [fato_pedido, fato_nota_fiscal].
  - fato_serial: rawSources [raw_sped_produto_lote_serie, raw_sped_documento_item_rastreabilidade],
    dependsOn [fato_nota_fiscal, fato_nota_fiscal_item].
  - fato_referencia: 15 rawSources (listar todas).
- **T1.3** `codeVersion`: para os builders cuja lógica vive em CÓDIGO (classificação/operação: consomem
  ETAPAS_DEMANDA_ABERTA, whitelist-grupo, raizes-cnpj), definir um `codeVersion` derivado do conteúdo
  dessas regras (ex. hash do módulo). Gate força rebuild quando `FatoBuildState.codeVersion != entry.codeVersion`.
- **T1.4** **Full incondicional no boot:** no primeiro ciclo após restart do worker, ignorar o gate
  (todo deploy reinicia o container -> cobre qualquer mudança de código/dependência não capturada por raw).
  Flag em memória `primeiroCicloAposBoot`.
- **T1.5** `builderEstaSujo(prisma, entry, fatosReconstruidosNesteCiclo, primeiroCicloAposBoot)`:
  roda se: primeiroCicloAposBoot; OU ultimoBuildAt null; OU rawSources undefined; OU codeVersion mudou;
  OU algum dependsOn está em fatosReconstruidosNesteCiclo; OU para algum rawSource
  `EXISTS(SELECT 1 FROM <raw> WHERE synced_at > ultimoBuildAt LIMIT 1)` (usa o índice de T0.2), o que
  inclui linhas raw_deleted recém-marcadas. Senão: **pula** e grava `ultimoVerificadoAt=now` (NÃO mexe
  em ultimoBuildAt), loga "pulado , sem mudança".
- **T1.6** `reconcile.ts` (l.69-83): bumpar `synced_at=now()` ao marcar `raw_deleted=true` e ao
  ressuscitar (senão o gate não vê deleção entre builds). Confirmado pela review que hoje não bumpa.
- **T1.7** Migrar `reportFreshness` (src/lib/reports/freshness.ts:30) para usar `ultimoVerificadoAt`
  (fallback para ultimoBuildAt se null). Teste garante que ciclo que pula NÃO envelhece a freshness.
- **T1.8** Integrar em `runBuilders` preservando ordem e grupos colados; montar
  `fatosReconstruidosNesteCiclo` conforme roda.
- **T1.9** TDD (tabela-verdade): (a) sem mudança => pula + ultimoVerificadoAt avança; (b) raw mudou => roda;
  (c) dependsOn reconstruído => roda; (d) rawSources undefined => sempre roda; (e) raw_deleted novo => roda;
  (f) ultimoBuildAt null => roda; (g) codeVersion mudou => roda; (h) primeiroCicloAposBoot => roda tudo;
  (i) freshness não envelhece ao pular.
- **Verificação E2E:** 2 ciclos seguidos sem atividade no Odoo: o 2º PULA a maioria e cai de ~102s para
  poucos s. Forçar mudança (ondemand/atendimento/deleção): só o afetado + cascata roda, e os números
  batem com full rebuild forçado. Conferir na tela que "atualizado há Xs" continua fresco.

---

## FRENTE 2 , Incremental real nos builders quentes (o elefante) , ordem pelo ms da F0
Ataca os fatos que mudam quase todo ciclo (o gate não os pula). **Ordem = ranking de ms da Frente 0**
(não por volume). Suspeitos de custo por JOIN/UPDATE cruzado (não por nº de inserts): fato_serial
(UPDATE cruzando 232k), fato_referencia (15 raws), classificacao (varre 100%). Uma sub-onda por builder.

- **T2.0 (base, feito uma vez):** helper de build incremental com **cursor capturado ANTES da leitura**
  (espelha incremental.ts:82): lê `cursor = agora()` no início, seleciona delta por
  `synced_at > ultimoBuildAt(anterior)`, e só grava `ultimoBuildAt = cursor` no fim. Confirmar que o
  sync direcionado do write:* do MCP (src/worker/sync/directed.ts) toma o mesmo ciclo-lock; se não tomar,
  tratar (senão escrita entre leitura e markFatoBuilt se perderia).
- Padrão por builder (T2.x):
  - **a** Extrair projeção pura "1 linha raw -> 1 linha fato" (reuso + teste isolado).
  - **b** Incremental: upsert por `odoo_id` dos deltas; delete no fato dos `odoo_id` com `raw_deleted=true`
    no delta; idempotente (cobre sobreposição de 15min). ultimoBuildAt = cursor pré-leitura.
  - **c** Cascata: pai mudou => recomputar filhos afetados (pelos ids do pai). Preservar grupo colado
    produto->item->classificacao. **Classificação:** mudança em `raw_pedido_etapa`/grupo => reclassificação
    TOTAL (não por id); mudança só na raw do pedido => por id. Materializar bucket_demanda/is_venda_externa
    coerente em fato_pedido/fato_nota_fiscal.
  - **d** SHADOW-DIFF com critério de saída: rodar incremental + full numa temp, `EXCEPT` nos dois sentidos
    **incluindo as colunas materializadas dos fatos-pai**; sair do shadow só após **N ciclos com diff vazio
    E tendo observado ao menos 1 deleção e 1 mudança de pai**; kill-switch por flag. Não deixar o shadow
    rodando indefinidamente (custa mais que o full).
  - **e** TDD: insert novo, update, delete de raw_deleted, no-op, cascata de pai, reclassificação por etapa.
  - **Verificação E2E por builder:** incremental == full (contagem, somas-chave, amostras) inclusive após
    deleção e mudança de pai, contra o cache real.
- **T2.SAFETY , rede de segurança full periódica:** criar um **ciclo de reconciliação de fatos** (ou
  piggyback no reconcile de 180min / job diário) que roda o full rebuild dos fatos JÁ convertidos a
  incremental, para corrigir qualquer drift/fantasma. Sem isso os fatos incrementais ficam sem safety net
  (eles não rodam no snapshot de 30min). Frequência a definir pela medição (ex. 1x/dia madrugada).

---

## FRENTE 3 , Ganhos estruturais (após 1 e 2, se o ranking justificar)
- **T3.1** Paralelizar builders independentes (hoje 100% sequencial), respeitando grupos colados e limite
  de memória (OOM histórico com concorrência 10). Ganho de wall-clock.
- **T3.2** Reavaliar custo do snapshot (30min, 5 modelos foto-atual full) , medir; provavelmente manter.

---

## FRENTE FINAL , Viabilizar 3 minutos
- **TF.1** Medir novo tempo de ciclo (ocioso e com mudança típica) após F0-F2.
- **TF.2** Recomendar 3min só quando o ciclo "com mudança típica" couber com folga em 3min (margem p/ lock
  de 90s e hard-timeout de 10min). Troca é só config (`app_settings` `sync.incremental_interval_min`),
  aplicada em ~1min pelo config-check , respeita a variável do dono.
- **TF.3** Apresentar a medição; a decisão do intervalo é do dono.

---

## Ordem e gates entre frentes
F0 (instrumentar+índices+colunas) -> medir -> F1 (skip-gate+anti-staleness) -> medir -> F2 (incremental
nos quentes, um por vez com shadow-diff + safety net) -> medir -> F3 (estrutural, se valer) -> FINAL.
Perícia obrigatória ao fim de cada frente. Rebuild do worker após cada frente que toca `src/worker/**`
ou `prisma/schema.prisma` (schema => rebuild app+mcp+worker + prisma generate). Nada vai para main sem o dono.

## Métricas de sucesso (objetivas)
- F1: ciclo ocioso cai de ~102s para < ~10s; freshness na tela permanece fresca; contagem de cada fato
  pulado == full rebuild forçado.
- F2: por builder convertido, N ciclos de shadow-diff vazio (inclusa 1 deleção + 1 mudança de pai);
  ms do builder cai proporcional ao delta.
- FINAL: ciclo "com mudança típica" < ~60s (folga p/ 3min) antes de recomendar a troca.

## Riscos globais e mitigações (consolidado pós-review)
- Mapa rawSources/dependsOn errado => fato velho. Mit: default "sempre roda" + conferência 1:1 + E2E vs full.
- Deploy de código não visto pelo gate => staleness. Mit: full-no-boot (T1.4) + codeVersion (T1.3).
- Freshness congelada => tela "velha". Mit: ultimoVerificadoAt (T0.1/T1.5/T1.7).
- Gate custoso sem índice => seq scan. Mit: índice [raw_deleted, synced_at] (T0.2).
- Deleção não capturada => fantasma. Mit: reconcile bumpa synced_at (T1.6) + delta de raw_deleted (T2.b)
  + safety net full periódico (T2.SAFETY).
- Cursor read-then-highwater => perda de escrita concorrente. Mit: cursor antes da leitura (T2.0) +
  confirmar lock do write:* direcionado.
- Quebra do grupo colado => bucket_demanda NULL. Mit: preservar ordem/transação; reclassificação total em
  mudança de etapa/grupo; testes.
