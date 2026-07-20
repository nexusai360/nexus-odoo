# Impacto de recuar o corte de INGESTAO para trazer pedidos de 2024/2025

Data: 2026-07-20
Autor: perícia de engenharia de dados (sessão Claude, só leitura)
Motivo: o relatório de entregas parciais precisa mostrar pedidos em aberto desde o mais
antigo. Há 51 pedidos com `data_orcamento` de nov/2024 a dez/2025 que NÃO estão no cache
porque o menor `data_orcamento` ingerido hoje é 2026-01-04. O dono decidiu (2026-07-20)
recuar a "data de start" para acompanhar o pedido em aberto mais antigo, sem limite para
frente.

> TL;DR: existem DOIS cortes independentes e um TERCEIRO ator perigoso (o purge).
> Para os pedidos antigos aparecerem no relatório é preciso mexer nos DOIS cortes
> (ingestão e leitura) e no piso mínimo da tela, nesta ordem, e garantir que o purge
> não seja re-executado contra a nova janela. O corte de ingestão é GLOBAL (uma única
> constante literal): recuá-lo traz de volta TODO o histórico pré-2026 de TODOS os
> domínios, não só os 51 pedidos. Esse é o ponto de decisão principal.

---

## 1. O corte TÉCNICO de ingestão (`src/worker/sync/corte.ts`)

- Valor de hoje: `export const CORTE_INGESTAO_ISO = "2026-01-01"`. É uma **constante
  literal fixa**, deliberadamente NÃO configurável e que NÃO importa nada de
  `corte-dados.ts` (o arquivo documenta que amarrar ingestão à data da tela já foi erro
  duas vezes: o worker para de puxar o que fica fora e a reconciliação marca o histórico
  como removido, o bug do PR #168).
- É **fonte única**. Todo o resto deriva dela:
  - `corteDomain(odooModel)` devolve `[[campoData, ">=", CORTE_INGESTAO_ISO]]` para
    modelos que têm `corte` no catálogo; devolve `[]` para os que não têm.
  - `corteDomainHerdado(odooModel)` faz o mesmo via dot-notation para FILHOS que herdam
    a data do pai/avô (`documento_id.data_emissao`, `item_id.documento_id.data_emissao`),
    porque um filho como `sped.documento.item` não tem data própria.
  - `snapshot.ts` usa `corteDomain` no `searchReadPaged`.
  - `atendimento.ts` importa `CORTE_INGESTAO_ISO` direto (`documento_id.data_emissao >=`).
  - **O PURGE** (`src/worker/limpa/predicados.ts`) usa `CORTE_INGESTAO_ISO` como valor
    padrão em TODOS os predicados (`wherePre2026Raw`, `wherePre2026Filho`,
    `wherePre2026Neto`, `whereTituloQuitadoPre2026Raw/Fato`).
- **Como o worker aplica o corte por domínio:** o corte é **por MODELO**, definido no
  `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`) pelo campo `corte: { odoo, raw }`
  ou `cortePai`. A chave por modelo relevante:
  - `pedido.documento` → corta por **`data_orcamento`** (é exatamente o campo do problema).
  - `pedido.parcela` → `data_vencimento`.
  - `sped.documento` → `data_emissao`; `sped.documento.item` → herda do pai (`cortePai`).
  - `estoque.extrato`, `finan.banco.extrato`, `finan.fluxo.caixa`, `sped.consulta.dfe.item`,
    `sped.apuracao` etc. → cada um com sua própria data.
  - Modelos SEM `corte` (mestres como `res.partner`, `pedido.etapa`, e o título financeiro
    `corteEspecial`) sincronizam sem filtro de data.
- **Não é por `write_date`.** O `write_date` só entra como marca d'água do incremental
  (ver §3). O corte de ingestão é sempre pela **data de negócio** do modelo.

Consequência dura: **não existe corte de ingestão por-modelo configurável**. A data de
início é a MESMA constante global para todo modelo que tenha `corte`. Só o NOME do campo
muda por modelo. Logo, recuar a constante recua para estoque, financeiro, fiscal, comercial,
tudo de uma vez.

## 2. O corte de LEITURA (`src/lib/corte-dados.ts`)

- É a "data de início das análises", AppSetting `sync.corte_dados`. Padrão
  `CORTE_DADOS_PADRAO = "2026-03-16"`; mínimo escolhível `CORTE_DADOS_MINIMO = "2026-01-01"`.
- `getCorteDados(prisma)` lê o AppSetting (cache de processo de 60s) e alimenta
  `corteAtual()` / `corteAtualDate()` (síncronos, usados no caminho quente das métricas).
- `janelaClampada(de, ate)` é a peça central: sem `de`, o piso é o corte; com `de` anterior
  ao corte, grampeia no corte e marca `cortado`; sem `ate`, fim aberto (`2100-01-01`).
  Também há `clampIsoAoCorte`, `clampDateAoCorte`, `clampMesAoCorte`, `whereData`.
- **Onde é aplicado (leitura de pedidos, o que interessa aqui):**
  - `src/lib/reports/queries/comercial.ts`: a query de demanda em aberto tem piso
    `f.data_orcamento >= ${corteAtualDate()}` (linhas 222, 525, 640) e
    `where: { dataOrcamento: { gte: corteAtualDate() } }`. Testes exigem esse piso
    (`comercial.test.ts`).
  - `src/lib/reports/queries/pedido-historico.ts`: `dataEntrada`/`dataOrcamento` com
    `gte: corteAtualDate()`; descarta pedido com `dataOrcamento < corteAtualDate()`.
  - `src/lib/diretoria/queries/pedidos.ts` e `vendas.ts`: mesma fronteira.
- **Isto é decisivo:** mesmo que os pedidos de 2024/2025 estejam no cache, a query de
  entregas/demanda os **esconde** enquanto `corteAtual()` (2026-03-16 por padrão) for
  posterior a eles. O corte de leitura precisa ser recuado também.

## 3. A RECONCILIAÇÃO (`src/worker/sync/reconcile.ts`) e o que dispara `rawDeleted`

`reconcileModel` converge o cache ao Odoo em três movimentos:

1. **Sumiu do Odoo → marca `rawDeleted = true`.** Monta `vivos = searchIds(odooModel,
   corteDomain(odooModel))` (conjunto AMPLO, com o corte GLOBAL). Tudo que está no cache e
   NÃO está em `vivos` e ainda não estava deletado é marcado `rawDeleted = true` via
   `updateMany`.
2. **Está no Odoo e falta no cache → busca e insere (`rawDeleted = false`).** Usa o
   conjunto RESTRITO (`corteDomainHerdado`) só para filhos sem data própria; para
   `pedido.documento` (que tem `corte` próprio) usa `vivos`. Insere via `upsert` os
   `faltantes`.
3. **Estava morto aqui mas vive lá → ressuscita (`rawDeleted = false`).**

O incremental (`incremental.ts`) é por `write_date`: `domain = [...corteDomain(model),
...(desde ? [["write_date",">",odooDatetime(desde)]] : [])]`. O corte de negócio entra em
AMBOS os ramos (permanente). A marca d'água recua `MARGEM_SEGURANCA_MS` (15min) para não
perder registros na janela de commit do Odoo. O incremental **só pega o que teve
`write_date` recente**; um pedido de 2024 não editado tem `write_date` antigo e **não**
seria pego pelo incremental.

**O gatilho exato do `rawDeleted = true`:** um registro estar no cache e cair FORA do
`vivos` (ou seja, fora de `corteDomain`, o corte global). Aqui está o perigo espelhando o
PR #168:

> Se alguém inserir os pedidos de 2024/2025 no cache SEM mover a constante
> `CORTE_INGESTAO_ISO`, o próximo ciclo de reconcile os verá fora de `vivos`
> (`data_orcamento >= 2026-01-01` os exclui) e os marcará `rawDeleted = true`. O trabalho
> de back-fill é desfeito no dia seguinte, em silêncio.

Por isso a ordem importa: **a constante de ingestão tem que ser recuada ANTES (ou junto)
de qualquer back-fill.** Com a constante recuada, `vivos` passa a incluir os antigos e a
reconciliação não só não os apaga como os traz sozinha (movimento 2).

## 4. O PURGE (`src/worker/limpa/` + `scripts/limpa/purge-pre-2026.ts`) — o terceiro ator

- Existe um purge que **apaga fisicamente** (DELETE em lotes) registros pré-corte no RAW e
  no FATO. Predicados: `wherePre2026Raw/Filho/Neto`, `whereTituloQuitadoPre2026Raw/Fato`,
  todos com padrão de corte = `CORTE_INGESTAO_ISO`.
- **É um script MANUAL, não roda em cron.** O agendador do worker (`src/worker/index.ts`)
  só agenda `incremental`, `snapshot` e `reconcile`. Nenhum job de purge é enfileirado.
  O script exige `--apply --aprovado` (gate humano) e foi rodado uma vez (Limpa 2026+,
  ~923MB removidos, ~172 mil registros pré-corte).
- **Interação com o recuo:** como o purge usa `CORTE_INGESTAO_ISO` como padrão, se a
  constante for recuada, um novo dry-run/apply passaria a considerar somente o que está
  antes da NOVA data. Não re-apagaria 2024/2025 se a constante já estiver em, digamos,
  2024-01-01. **Risco real:** re-rodar o purge com a constante ainda em 2026-01-01 (ou com
  um corte hardcoded) DEPOIS do back-fill apagaria de novo tudo que foi trazido. Enquanto o
  recuo estiver ativo, tratar o purge como congelado.

## 5. O builder de FATO não filtra por data (bom para nós)

`src/worker/fatos/fato-pedido.ts` lê `raw_pedido_documento` com `where: { rawDeleted: false }`
e materializa todas as linhas vivas (sem cláusula de corte). `fato-pedido-item.ts` idem
(`WHERE i.raw_deleted = false`). Ou seja: **assim que o RAW ganhar os pedidos antigos (via
reconcile), o próximo rebuild de fato os materializa automaticamente** em `fato_pedido` /
`fato_pedido_item`. Não há filtro de corte no builder que precise mudar.

## 6. O que EXATAMENTE muda para ingerir 2024/2025 (mínimo necessário)

Para os pedidos antigos aparecerem no relatório de entregas parciais, três alavancas, nesta
ordem:

1. **Recuar o corte de ingestão** (`src/worker/sync/corte.ts`): mudar
   `CORTE_INGESTAO_ISO` de `"2026-01-01"` para a data que cubra o pedido em aberto mais
   antigo (o mais antigo hoje é nov/2024, então algo como `"2024-01-01"` ou `"2024-11-01"`).
   Como é a fonte única, isso reconfigura `corteDomain`, `corteDomainHerdado`, `snapshot`,
   `atendimento` e o padrão do purge de uma vez. Exige rebuild do worker (a imagem
   `nexus-odoo:local` via `docker compose build app`, ver CLAUDE.md; em prod, deploy).
2. **Trazer o histórico para o cache.** Não basta a constante:
   - O **incremental NÃO traz** os antigos (write_date antigo).
   - A **reconciliação traz** (movimento 2: `faltantes = vivos - cache`), no próximo ciclo
     de reconcile (`reconcileIntervalMin`, ~1440min/dia). Pode-se **forçar** um reconcile
     imediato (enfileirar `JOB_RECONCILE`) ou usar o sync **direcionado**
     (`src/worker/sync/directed.ts`) apontando os modelos de pedido para acelerar.
   - Depois, **rebuild dos fatos** de pedido (registry) para materializar.
3. **Recuar o corte de LEITURA e o piso mínimo:**
   - AppSetting `sync.corte_dados` → mover para <= data do pedido mais antigo (via tela
     Configuração ou direto no AppSetting).
   - `CORTE_DADOS_MINIMO` em `corte-dados.ts` (hoje `"2026-01-01"`) precisa ser baixado
     junto, senão a validação `src/lib/validations/sync-config.ts` (`v >= CORTE_DADOS_MINIMO`)
     e o `minIso` do calendário em `configuracao-content.tsx` **impedem** escolher a data
     antiga. O próprio comentário do código diz: "Se um dia a ingestão passar a puxar mais
     histórico, os dois andam juntos."

**Snapshot completo x incremental:** o `snapshot` (30min) usa `corteDomain` e faz
`searchReadPaged` do universo do corte; ele também repovoaria os antigos, mas snapshot só
existe para modelos `mode: "snapshot"` (ex.: `estoque.extrato`). Para `pedido.documento`
(`incremental`), quem repõe o histórico é a **reconciliação**, não o incremental.

**Volume estimado:** os 51 pedidos em aberto são `pedido.documento`. Mas recuar a constante
GLOBAL traz TODOS os pedidos da janela (não só os 51 em aberto) e, junto, todo o pré-2026 de
TODOS os domínios com `corte`. O purge Limpa 2026+ removeu ~172 mil registros / ~923MB
pré-2026 no total; recuar a constante para 2024 tende a repor grande parte disso ao longo dos
ciclos de reconcile (estoque, financeiro, fiscal, notas, itens). Só de itens de nota
(`sped.documento.item`) o Odoo tem 233.563 no total contra 59.804 dentro do corte atual, ou
seja ~174 mil itens pré-corte a mais só nesse modelo. Isso é volume de banco e de sync
relevante (memória do worker, tempo de reconcile, tamanho das tabelas raw/fato).

## 7. RISCOS e mitigação (passo a passo seguro)

Riscos principais:

- **R1 (o bug do PR #168, repetido):** inserir os antigos no cache sem mover a constante →
  reconcile marca `rawDeleted = true` no dia seguinte. Mitigação: mover
  `CORTE_INGESTAO_ISO` ANTES/junto do back-fill; nunca inserir "por fora" contra um corte
  global que ainda os exclua.
- **R2 (purge re-executado):** rodar `purge-pre-2026.ts --apply` com a constante ainda em
  2026-01-01 (ou corte hardcoded) apaga o que foi trazido. Mitigação: congelar o purge
  enquanto o recuo estiver ativo; se um dia rodar, conferir que usa a nova constante.
- **R3 (leitura ainda esconde):** mexer só na ingestão e esquecer `sync.corte_dados` +
  `CORTE_DADOS_MINIMO` → dado no cache, invisível no relatório. Mitigação: recuar os dois.
- **R4 (volume/performance):** recuo global traz ~pré-2026 inteiro de todos os domínios;
  risco de OOM no worker durante reconcile em lote e inchaço de disco. Mitigação: back-fill
  direcionado por modelo de pedido primeiro; monitorar memória; considerar reconcile fora do
  horário de pico. `corteDomainHerdado` já existe justamente para não despejar o modelo
  inteiro de filhos sem data; confiar nele.
- **R5 (tensão global x cirúrgico):** o dono quer "os pedidos em aberto antigos", mas a
  alavanca disponível é global. Não há hoje corte de ingestão por-modelo. Trazer só pedidos
  sem trazer o resto exigiria introduzir um override por-modelo no catálogo/`corte.ts` (e
  então o reconcile de pedido usaria esse override no `vivos`, evitando R1). Isso é uma
  mudança de arquitetura pequena mas real, e é a única forma de limitar o volume mantendo o
  reconcile seguro.

**Passo a passo seguro recomendado (recuo global, alinhado à filosofia "filtro, nunca
faxina"):**

1. Congelar o purge (não rodar `scripts/limpa/purge-pre-2026.ts --apply` até segunda ordem).
2. Recuar `CORTE_INGESTAO_ISO` em `corte.ts` para a data alvo (ex.: `2024-01-01`).
3. Baixar `CORTE_DADOS_MINIMO` em `corte-dados.ts` para a mesma data (mantê-los juntos).
4. Rebuild/deploy do worker (imagem via `app`) e do app.
5. Forçar um reconcile (ou sync direcionado dos modelos de pedido) e, em seguida, rebuild
   dos fatos de pedido. Monitorar memória e tamanho das tabelas.
6. Recuar o AppSetting `sync.corte_dados` na tela para a data alvo.
7. Validar E2E contra o cache real: conferir que os 51 pedidos em aberto de 2024/2025
   aparecem no relatório de entregas parciais e que os números batem.
8. Observar 1 a 2 ciclos de reconcile para garantir que nada dos antigos é marcado
   `rawDeleted` (prova de que R1 não ocorreu).

**Alternativa cirúrgica (se o volume global for inaceitável):** introduzir override de
corte por-modelo (só `pedido.documento` e filhos diretos com data antiga), garantindo que o
`vivos` do reconcile desses modelos use o corte antigo. Mais trabalho, menos volume, mesmo
resultado para o relatório. Decisão de produto do dono.

## 8. Resposta à decisão de negócio

- "Sem limite para frente" já é o comportamento atual: `janelaClampada` usa `FIM_ABERTO`
  (2100) quando não há `ate`. Nada a fazer nesse eixo.
- "Do pedido mais antigo em aberto para frente": recuar o corte técnico traz TODOS os
  pedidos da janela (e todo o pré-2026 dos demais domínios), não só os 51 em aberto. Isso é
  aceitável do ponto de vista de correção (o cache é histórico, filtro é na leitura), mas
  tem custo de volume (R4). Se o dono quer só os pedidos antigos e não o resto, é o caso da
  alternativa cirúrgica (§7).
- O relatório de entregas parciais NÃO tem janela própria hoje: ele lê pela
  `corteAtualDate()` global. Para mostrar os antigos, ou (a) recua-se o corte de leitura
  global (afeta toda a plataforma) ou (b) dá-se a este relatório uma janela própria que
  ignore `corteAtual()` para o piso (mudança nas queries de `comercial.ts`/`pedidos.ts` e
  seus testes que hoje EXIGEM o piso no corte). A opção (a) é a mais simples e coerente com
  a regra durável; a (b) isola o impacto mas contraria a premissa de que "toda leitura
  respeita a data de início das análises".

---

### Arquivos-chave citados
- `src/worker/sync/corte.ts` — constante `CORTE_INGESTAO_ISO`, `corteDomain`, `corteDomainHerdado`.
- `src/lib/corte-dados.ts` — corte de leitura, `janelaClampada`, `CORTE_DADOS_MINIMO`.
- `src/worker/sync/reconcile.ts` — convergência bidirecional, gatilho de `rawDeleted`.
- `src/worker/sync/incremental.ts` — marca d'água por `write_date`, `MARGEM_SEGURANCA_MS`.
- `src/worker/sync/snapshot.ts`, `src/worker/sync/atendimento.ts`, `src/worker/sync/directed.ts`.
- `src/worker/catalog/model-catalog.ts` — corte por modelo (`pedido.documento` → `data_orcamento`).
- `src/worker/limpa/predicados.ts` + `scripts/limpa/purge-pre-2026.ts` — o purge manual.
- `src/worker/fatos/fato-pedido.ts`, `fato-pedido-item.ts` — builders (só `rawDeleted = false`).
- `src/lib/reports/queries/comercial.ts`, `pedido-historico.ts`; `src/lib/diretoria/queries/pedidos.ts` — leitura clampada.
- `src/lib/validations/sync-config.ts`, `src/app/(protected)/configuracao/configuracao-content.tsx` — piso mínimo da tela.
- `src/worker/index.ts` — agenda incremental/snapshot/reconcile (purge NÃO agendado).
