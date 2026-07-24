# Perícia , Otimização do ecossistema de sync (worker)

> Branch: `feat/entregas-parciais-base-calculo`. Trabalho autônomo, LOCAL.
> Objetivo do dono: deixar as rotinas de atualização da base mais LEVES e RÁPIDAS,
> sem perder correção; depois viabilizar baixar o incremental de 10min para 3min.
> Fluxo pedido: perícia profunda -> PLANO v1 -> review pente-fino -> PLANO v2 ->
> implementação frente por frente (skip spec).

## Achado central (medido no worker em produção-local, 2026-07-23 ~21:40)

Todo ciclo **incremental (10 min)** reconstrói **~40 tabelas `fato_*` POR INTEIRO**
(DELETE/TRUNCATE + INSERT..SELECT lendo a raw inteira), **independente do que mudou**.
Total do ciclo: **~102 segundos** (`ciclo "incremental" concluído em 101712ms`).

O log lista "fato_X reconstruído: N linhas" para cada fato, sempre o total completo.

### Heavy hitters por volume (refeitos a cada 10 min)
| Fato | Linhas | Cycle |
|---|---:|---|
| fato_nota_fiscal_item | 232.761 | incremental |
| fato_financeiro_movimento | 34.207 | incremental |
| fato_referencia | 22.290 | incremental |
| fato_pedido_item | 19.191 | incremental |
| fato_financeiro_lancamento_item | 16.858 | incremental |
| fato_pedido_historico | 16.260 | incremental |
| fato_dfe | 14.788 | incremental |
| fato_nota_fiscal | 14.307 | incremental |
| fato_preco | 12.011 | incremental |
| fato_serial | 8.950 | incremental |
| fato_financeiro_titulo | 8.759 | incremental |
| fato_parceiro | 7.396 | incremental |
| (+ ~28 fatos menores, muitos com 0-50 linhas) | | |

Raw maior: `raw_sped_documento_item` = 238.779 linhas (fonte do nota_fiscal_item e pedido_item).

## Camada de ingestão (raw) , JÁ é incremental ✅
- `src/worker/sync/incremental.ts`: filtra Odoo por `write_date > watermark`
  (margem de segurança de 15min), faz `upsert` só do que mudou. NÃO rebaixa tudo.
- Backfill (full) só quando `since === null` (primeira vez).
- Snapshot/completa (30min) e reconcile (180min): a investigar custo (agentes).

## Infra que a otimização pode usar (delta já disponível)
- Cada linha `raw_*` tem: `synced_at`, `odoo_write_date`, `raw_deleted`, `odoo_id`.
  -> dá pra saber "o que mudou desde o último build" por tabela raw.
- `fato_build_state` tem `ultimo_build_at` por fato (mas NÃO guarda duração).
- Padrões incrementais que JÁ existem no repo (modelos a seguir):
  `captura-pedido-valor.ts` (append-por-mudança), `fato_*_historico`.

## Hipótese de otimização (a validar no plano)
Trocar FULL REBUILD por **build incremental por delta**: em cada ciclo, descobrir
os `odoo_id` cujo raw mudou desde `ultimo_build_at` (via `synced_at`/`odoo_write_date`)
e reconstruir **só essas linhas** do fato (upsert), tratando deleções via `raw_deleted`.
Priorizar por custo: `fato_nota_fiscal_item` primeiro.

### Riscos a endereçar (por que hoje é full, e não é desleixo)
- Full rebuild = simples e sem drift. Incremental precisa cuidar de:
  1. Propagação pai->filho (mudou o pedido, precisa refletir nos itens).
  2. Deleção (linha some do Odoo -> reconcile marca `raw_deleted`; o fato precisa remover).
  3. Joins entre fatos (ex.: fato_pedido_item faz LEFT JOIN fato_produto p/ familia/marca:
     se o produto mudou, os itens daquele produto precisam recomputar).
  4. Freshness/build-state coerente (só avança no commit).
- Regra de raiz do projeto: E2E contra dado real; o número incremental TEM que bater
  1:1 com o full rebuild antes de trocar.

## Síntese final (3 agentes concluídos)

### Orquestração (confirmado)
- Ciclo incremental = Fase A (pull raw: 119 modelos, concorrência 5, JÁ incremental por
  write_date+15min) + Fase B (`runBuilders(prisma,"incremental")` = 39 builders SEQUENCIAIS,
  cada um full DELETE+INSERT). registry.ts:153-173 é o ponto único.
- Serialização por ciclo-lock (Redis) + Worker concurrency:1. Ondemand e atendimento pegam
  o lock do incremental (sem escrita concorrente na raw durante um ciclo).
- Timing só POR CICLO (index.ts:483), nunca por builder. Precisa instrumentar em runBuilders.

### Invariantes que NÃO podem quebrar
- Grupo colado produto→pedido_item→classificacao (registry.ts:76-84): reordenar/afastar
  gera janela de `bucket_demanda` NULL (tela mostra 0 demandas). "NAO afastar."
- `classificarPedidosDoRaw` roda DENTRO do rebuild de fato_pedido (fato-pedido.ts:28);
  classificacao materializa bucket_demanda/is_venda_externa em fato_pedido e fato_nota_fiscal.
- MARCADOR_CICLO `__ciclo__` (registry.ts:132-139) é a barreira de leitura da tela.
- Filtro `raw_deleted=false` é o que hoje remove linhas mortas (incidente 1.007 fantasmas).
- Margem de 15min no watermark → upsert idempotente obrigatório (skipDuplicates não basta).

### Sinal de delta correto = `raw.synced_at` (não write_date)
- Campos computados (quantidade_a_atender_pedido) NÃO mudam write_date; o job de atendimento
  reescreve a raw setando synced_at=agora (atendimento.ts:104). Logo synced_at capta TUDO.
- Deleção: reconcile faz updateMany(raw_deleted=true) mas (a confirmar) pode não bumpar
  synced_at → o gate precisa tratar raw_deleted à parte OU reconcile passa a bumpar synced_at.
- CUIDADO snapshot: os 5 modelos foto-atual reescrevem synced_at de TODAS as linhas a cada
  30min → não usar synced_at como delta para os fatos snapshot (não são alvo do incremental).

### Dependências que exigem CASCATA (não basta olhar a raw própria)
- fato_pedido_item JOIN fato_produto (familia/marca): se o produto muda, os itens do produto
  precisam recomputar. → o gate precisa de `dependsOn` entre fatos, não só rawSources.
- fato_serial UPDATE cruzando fato_nota_fiscal[_item]; fato_serial_saldo JOIN fato_estoque_local
  +fato_produto; fato_contabil_lancamento_item JOIN outros fatos; classificacao atualiza
  fato_pedido+fato_nota_fiscal.

### Modelos BONS a replicar (já são incrementais/append)
- captura-pedido-valor.ts / captura-preco.ts / captura-saldo.ts: append-por-delta (calcularDelta,
  só grava linha nova quando o núcleo muda). Rodam FORA do FATO_BUILDERS.
- fato_pedido_classificacao: set-based sem delete (updateMany), mas ainda varre 100%.
- snapshot-estoque-diario: deleteMany COM filtro por dia (escopo já delimitado).

### Alvos primários (full rebuild + alto volume, todo ciclo)
fato_nota_fiscal_item (232k), fato_nota_fiscal (14k), fato_pedido (2,7k)+fato_pedido_item (19k),
fato_financeiro_titulo (8,7k), fato_financeiro_movimento (34k), fato_financeiro_lancamento_item
(16k), fato_produto (3,8k), fato_parceiro (7,4k), fato_serial (8,9k), fato_referencia (15 raws),
fato_pedido_historico (16k), fato_dfe (14k).

## Status da perícia
- [x] Custo do ciclo (102s, 39 builders full) + orquestração + invariantes.
- [x] Auditoria por builder (padrão + dependências + modelos bons).
- [x] Ingestão/config/freshness/corte + infra de delta (synced_at indexado, ultimoBuildAt).
- [x] Sinal de delta decidido (synced_at) + tratamento de deleção/cascata mapeado.
- Próximo: PLANO v1 (2026-07-23-otimizacao-sync-PLAN.md) -> review -> PLANO v2 -> implementação.
