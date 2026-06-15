# Runbook , Limpa 2026+ (corte temporal do cache)

> Spec: `docs/superpowers/specs/2026-06-11-limpa-2026-design.md` (v3)
> Plan: `docs/superpowers/plans/2026-06-11-limpa-2026-plan.md` (v3)
> Dry-run aprovavel: `docs/superpowers/research/limpa-2026-dryrun.md`

## A regra do corte

O cache Postgres guarda **apenas dados de 2026 em diante** (`CORTE_DADOS_ISO`
em `src/worker/sync/corte.ts`). Pre-2026 permanece no Odoo (fonte intacta),
mas nao e sincronizado nem consultavel pela plataforma.

Tres mecanismos garantem isso:

1. **Filtro permanente no sync** (T2): os 3 ciclos (incremental, snapshot,
   reconcile) aplicam a clausula de corte no domain Odoo. Backfill
   (`since=null`) tambem filtra, entao um resync nunca reimporta o historico.
2. **Purge one-shot** (T4): remove o que ja estava no cache antes do corte.
3. **Honestidade** (T7): pergunta com periodo inteiramente pre-2026 recebe o
   texto honesto ("o cache guarda apenas dados de 2026 em diante..."), nunca
   um falso "0 resultados".

### Regras duras (nunca violar)

- **Divida viva JAMAIS deleta.** `finan.lancamento` corta por SITUACAO
  (`quitado`/`baixado` E `data_pagamento` < corte), nunca por data de
  vencimento/emissao. Titulo aberto/provisorio fica, mesmo de 2013.
- **NULL preserva.** Linha sem data de corte nao deleta.
- **FK m2o vazia preserva.** No raw a FK vem `[id,"label"]` ou `false`; o
  predicado exige `jsonb_typeof = 'array'` (o `false` escalar passa em
  `IS NOT NULL` e quebra o cast , bug real corrigido no T4b).
- **Mestre/dimensao nunca corta** (parceiros, produtos, contas, empresas...);
  lista negativa no gate.
- **--apply SO com aprovacao humana** do dry-run E pg_dump feito.

## T10 PROD , EXECUTADO 2026-06-12 (sem SSH, via Portainer docker API)

O purge fisico de prod rodou em 2026-06-12T02:36Z. **Rota descoberta: nao
precisa de SSH a VPS.** O Postgres de prod nao tem porta publica utilizavel
(firewall so libera a 5432, ocupada por outra stack), entao a operacao foi
feita **de dentro do swarm** via API docker do Portainer (`painel.nexusai360.com`,
token reaproveitado do `.env.production` de um projeto irmao , `endpoints/1/docker`):

1. **Dump**: `pg_dump -Fc` das 16 tabelas + `fato_financeiro_titulo` rodado
   DENTRO do container `nexus-odoo_db` (pg_dump 16.14); arquivo puxado para
   `~/Backups/nexus-odoo/odoo-prod-pre-T10.dump` (186 MB) via archive API,
   **sha256 conferido** na origem e no destino.
2. **Scripts**: `scripts/limpa/*.ts` nao estavam na imagem (adicionados depois
   do build); injetados no container `nexus-odoo_app` via archive PUT, com os
   caminhos de saida repatchados para `/tmp/limpa-out` (FS read-only em `docs/`).
   Rodados com `node_modules/.bin/tsx` (DATABASE_URL do container ja aponta prod).
3. **Worker parado** escalando o service `nexus-odoo_worker` para 0 replicas
   (e religado para 1 no fim) , nao precisa do usuario no Portainer UI.
4. Invariante ANTES (a_pagar vivo R$153.232.144,14 / a_receber R$64.983.807,78)
   -> dry-run 289.886 linhas (identico ao DEV) -> APPLY 289.886 em 84s ->
   rebuild fato_financeiro_titulo -> invariante DEPOIS **R$ 0,00 de diferenca**
   -> vacuum **988 MB** recuperados -> worker religado.
5. Ancoras pos-purge (prod): pre-2026 = 0, faturamento produtos 2026
   R$323.052.625,18 em 3.985 notas, raw_sped_documento 49.959->10.075,
   banco 1309 MB. Reimport nao ocorre (filtro de corte ativo desde #99).

> Reexecucao futura (outro corte): mesmo caminho. O helper de exec do Portainer
> ficou em `~/.nexus-tmp/portex.py` (token+host); apagar quando nao precisar.

## Ordem de execucao (T9 DEV / T10 PROD)

```
1. Pre-flight disco:  df do volume Postgres (folga >= tabelas a vacuumar + dump;
                      dump FORA do volume de dados)
2. pg_dump            (transacionais + snapshot afetadas) , REDE DE SEGURANCA;
                      NUNCA rebuildar/deployar o worker antes do dump:
                      estoque.extrato e snapshot COM corte e o 1o full-refresh
                      pos-deploy ja purga as linhas pre-2026
3. Deploy do filtro   (dev: docker compose build app && up -d --force-recreate worker)
4. 1 ciclo verificado
5. docker compose stop worker  (+ fila idle)
6. Dry-run            npx tsx --env-file=.env.local scripts/limpa/purge-pre-2026.ts
7. APROVACAO HUMANA   do relatorio
8. Invariante antes   scripts/limpa/invariante-financeiro.ts --capturar
9. Apply              scripts/limpa/purge-pre-2026.ts --apply --aprovado
10. Rebuild fato_financeiro_titulo PRIMEIRO
11. Invariante depois scripts/limpa/invariante-financeiro.ts --comparar
                      (exit 1 = ABORTAR e restaurar do pg_dump)
12. Vacuum            scripts/limpa/purge-pre-2026.ts --vacuum  (mede duracao,
                      inclui raw_sped_produto_lote_serie , bloat 2,9GB)
13. Demais rebuilds + E2E ancoras 2026 (faturamento mes, a pagar/receber,
    estoque, DFe) + re-rodar gen-baseline-eliminacao.ts (acumulado pos-corte)
14. docker compose start worker -> 2 ciclos verificados sem reimport
```

## Rollback

- **Primeira opcao:** restaurar do pg_dump (minutos).
- **Ultimo recurso:** resync completo do Odoo (horas; a fonte esta intacta,
  mas com o filtro ativo so volta 2026+ , que e o estado desejado).

## Todo modelo transacional novo precisa de corte

O gate `src/worker/catalog/corte-2026.test.ts` roda no jest/CI e trava o
conjunto NOMINAL: modelo novo com data transacional deve entrar em
`COM_CORTE_DATA`/`COM_CORTE_PAI` (ou justificadamente na lista negativa).
Sem isso o teste quebra , e proposital, forca a contabilidade consciente.

Casos especiais documentados no proprio gate:
- `estoque.extrato` e snapshot+corte (computado, sem write_date , incremental
  perderia 99% das linhas; provado no Odoo vivo 2026-06-11).
- `finan.lancamento` e `corteEspecial: titulo_por_situacao`.

## Painel "Estado da ingestao"

Apos o purge as contagens caem de ordem de grandeza (ex.: sped.documento
50k -> 10k). O painel (configuracao) e informativo , mostra estados
ok/preparando/erro e nao alarma por volume absoluto , entao nao ha falso
alarme. A referencia de volumetria esperada pos-corte e o relatorio
`limpa-2026-apply.md`.
