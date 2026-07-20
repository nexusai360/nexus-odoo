# PLAN , Fase 1B: recuo cirúrgico da ingestão para trazer os pedidos antigos em aberto

> Spec: `docs/superpowers/specs/2026-07-20-fase1-base-calculo-entregas-parciais.md` (seção 4).
> Reviews: `2026-07-20-review1-spec-fase1.md`, `2026-07-20-review2-spec-fase1.md`.
> Impacto do corte: `docs/superpowers/research/2026-07-20-impacto-corte-ingestao.md`.
> Decisões: D6, D6b (superseded), D8, D9 em `2026-07-20-entregas-parciais-repaginacao-pesquisa.md`.
> Regra do projeto: sem travessão (em dash). Base de partida: branch
> `feat/entregas-parciais-base-calculo`, Fase 1A já implementada e validada (whitelist de 27
> autoritativa, demanda respeita a pílula de período, não o corte de leitura global).

---

## Goal

Trazer para o cache os pedidos de venda em aberto anteriores a 2026 (o mais antigo em aberto
tem `data_orcamento` de ~nov/2024) para que apareçam na métrica "Demanda a entregar", SEM
apagar histórico e SEM inundar o cache com as ~211 mil linhas de itens de NOTA pré-2026 que a
limpeza (Limpa 2026+) já removeu. O erro a evitar é o do PR #168: inserir registros fora do
corte de ingestão vigente e ver a reconciliação marcá-los `rawDeleted=true` no dia seguinte.

Ao fim desta fase:
- Os pedidos antigos em aberto (etapa nos 27, `tipo=venda`) estão em `raw_pedido_documento` +
  `raw_sped_documento_item` (só os itens de pedido, `pedido_id != false`), materializados em
  `fato_pedido`/`fato_pedido_item` com `bucket_demanda='ABERTA'`, e sobrevivem a ciclos de
  reconcile e a uma re-execução do purge.
- A pílula "Tudo" em Pedidos & Entregas e o card "Demandas a entregar" passam a incluir esses
  antigos (~R$ 13,4 mi a mais), pareados em todas as pontas (herança direta da Fase 1A).
- As demais métricas (faturamento, a receber) continuam clampando em 2026 e NÃO mudam.

## Architecture

**Fonte única do recuo: um `OVERRIDE_INGESTAO` literal em `corte.ts`.** Hoje o corte de
ingestão é a constante global `CORTE_INGESTAO_ISO = "2026-01-01"`, lida por `corteDomain`,
`corteDomainHerdado` (reconcile), `DOMINIO_ATENDIMENTO` (atendimento) e o purge (predicados).
Introduzimos um mapa literal, deployado com o código e PERMANENTE (resolve BLOCKER-3):

```
OVERRIDE_INGESTAO = Map {
  "pedido.documento"     -> "2024-11-01",
  "sped.documento.item"  -> "2024-11-01",
}
```

Todo consumidor do corte passa a perguntar `corteIngestaoDe(model)` (override se houver, senão
o global). Assim o recuo tem UM lugar só, lido de forma idêntica por reconcile, atendimento e
purge (RF-B1, RF-B4, R1).

**Como cada modelo é trazido, e por que é seguro:**

- `pedido.documento` TEM corte próprio (`data_orcamento`, catalog L83). Com o override,
  `corteDomain("pedido.documento") = [["data_orcamento",">=","2024-11-01"]]`. O reconcile passa
  a incluir os pedidos antigos no conjunto `vivos`, então (a) NUNCA os marca `rawDeleted`
  (estão em `vivos`) e (b) os TRAZ sozinho no movimento 2 (`faltantes = vivos - cache`). O
  recuo é por DATA, nunca por etapa: filtrar `etapa in 27` no corte faria o reconcile marcar
  como deletado todo pedido 2026+ fora dos 27 (catástrofe). Trazer os pedidos antigos de TODOS
  os status (só os em aberto viram ABERTA; o resto vira FECHADA/IGNORAR e some pela whitelist e
  pelo clamp de leitura) é o preço aceito e documentado do recuo por data. Pedido é linha leve.

- `sped.documento.item` NÃO tem corte próprio: herda do pai via `documento_id.data_emissao`
  (`cortePai`, catalog L113). 91% dos itens são de NOTA (`pedido_id=false`): medido hoje
  `item_nota=211.626` contra `item_pedido=19.880`. Recuar a data do pai SEM gate de `pedido_id`
  reinundaria com as notas (BLOCKER-2). Solução: `corteDomainHerdado("sped.documento.item")`,
  com o override ativo, devolve um domínio Odoo em UNIÃO:
  `(pedido_id != false AND documento_id.data_emissao >= 2024-11-01) OR (pedido_id = false AND documento_id.data_emissao >= 2026-01-01)`.
  O ramo de pedido recua e traz só os itens de pedido antigos; o ramo de nota FICA em 2026 e
  preserva a rede de segurança do reconcile de notas (os 158 itens de nota perdidos, R$ 493k,
  que motivaram o reconcile bidirecional). Isso resolve BLOCKER-2 sem regredir a proteção das
  notas, que uma leitura literal de "filtrar pedido_id != false" quebraria.

- `atendimento.ts` mantém `a_atender` fresco relendo os itens de pedido 1x/dia. Sua const
  `DOMINIO_ATENDIMENTO` (congelada com `CORTE_INGESTAO_ISO` no import) vira a FUNÇÃO
  `dominioAtendimento()`, que lê `corteIngestaoDe("sped.documento.item")`. Como o domínio já
  tem `["pedido_id","!=",false]`, o recuo NÃO traz notas; apenas passa a reler os itens de
  pedido antigos, para o `a_atender` deles não ficar congelado/NULL (resolve I3/B1).

- O purge (`scripts/limpa/purge-pre-2026.ts` via `montaAlvosPurge`/predicados) passa a usar
  `corteIngestaoDe(model)` como limiar por modelo. Assim, se rodado de novo, ele NÃO apaga os
  antigos trazidos (o limiar do item e do pedido é 2024-11-01; o da nota segue 2026-01-01).
  Resolve R2/M3 por CÓDIGO, não por disciplina humana.

**O back-fill inicial é um script one-off dirigido** (`scripts/backfill/entregas-antigas.ts`),
porque não existe reconcile por-modelo dirigido (`processReconcileCycle` roda o catálogo inteiro
por timer; resolve BLOCKER-1). O script chama `reconcileModel` explicitamente para
`pedido.documento` e depois `sped.documento.item` (com o override já no código), roda
`syncAtendimento`, rebuilda os fatos. Usar `reconcileModel` (e não um domínio one-off próprio)
garante que o cache pós-script seja IDÊNTICO ao estado de convergência que o reconcile diário
manteria: zero divergência, idempotente por construção (resolve IMPORTANT-3 no eixo da
consistência; o eixo de corrida com o ciclo de 3min é resolvido no runbook, pausando o worker).

## Tech Stack

TypeScript, Node, `tsx --env-file=.env.local` para scripts one-off (padrão do repo, ver
`purge-pre-2026.ts`). Prisma v7 (`src/generated/prisma`). Jest para testes. Cliente Odoo
JSON-RPC (`src/worker/odoo/client.ts`, `clientFromEnv`). Postgres cache `nexus_odoo_l1`
(`docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1`). Rebuild de worker via `docker
compose build app` (o worker reusa a imagem `nexus-odoo:local`; `build worker` é no-op, ver
CLAUDE.md).

## Global Constraints

1. **NÃO baixar `sync.corte_dados` nem `CORTE_DADOS_MINIMO`.** A pesquisa de impacto (§6.3)
   mandava baixá-los, mas ela é ANTERIOR a D8/D9. Com a Fase 1A, a demanda a entregar já usa a
   PÍLULA de período ("Tudo" = piso na data do pedido), não o corte de leitura global. Baixar o
   corte de leitura VAZARIA os antigos para faturamento/a-receber (métricas que devem ficar em
   2026). O corte de leitura fica em 2026; o recuo é só de INGESTÃO.
2. **Override é literal e permanente** (não AppSetting, não runtime). Vive em `corte.ts`,
   deployado com o código. Nunca ler `corte-dados.ts` aqui (amarrar ingestão à tela já foi erro
   2x).
3. **Ordem de runtime inegociável (R1/PR#168):** deploy do código COM o override -> parar o
   ciclo incremental/worker -> back-fill -> rebuild fatos -> rebuild imagem -> subir worker ->
   verificar -> observar 1 ciclo de reconcile. Nunca inserir antigos contra um corte global que
   ainda os exclua. Purge congelado durante tudo.
4. **Nenhuma métrica NÃO-demanda pode passar a incluir os antigos.** `fato_pedido` materializa
   todo o raw vivo sem corte; a proteção é 100% no read-side de cada consumidor (clamp por
   `data_orcamento >= corteAtualDate()`), exceto o caminho de demanda a entregar, que usa a
   pílula (Fase 1A). Verificado por grep + E2E (Task 9).
5. **TDD:** teste primeiro, vermelho, implementação, verde. Commit atômico por task. `tsc` +
   `jest` verdes antes de avançar.
6. **Data do override (2024-11-01) é confirmada ao vivo na Task 0.** Se o pedido em aberto mais
   antigo for anterior, recuar o literal para o primeiro dia do mês daquele pedido. Sem limite
   para frente (comportamento atual do `janelaClampada`, nada a fazer nesse eixo).

## Baseline medido no cache hoje (para os critérios de aceite, com tolerância)

- `item_nota` (pedido_id ausente): **211.626** , NÃO pode crescer materialmente (RF-B2).
- `item_pedido` (pedido_id presente): **19.880** , PODE crescer (entram os itens antigos).
- `min(data_orcamento)` em `raw_pedido_documento`: **2026-01-04** , cai para ~2024-11 pós-fase.
- `raw_pedido_documento` vivos: **2606**.
- `fato_pedido` com `bucket_demanda='ABERTA'`: **398** , sobe com os antigos em aberto.
- Whitelist `ETAPAS_DEMANDA_ABERTA` (27): `130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226`.

---

## Task 0 , Confirmar ao vivo a data de start do override (RF-B5)

**Objetivo:** cravar o literal do override no pedido em aberto mais antigo real, não num chute.
Não escreve código de produção; produz o número para a Task 1.

**Files:** nenhum (consulta ao vivo). Registrar o resultado no corpo do commit da Task 1.

**Steps:**
1. Escrever um script efêmero (ou usar `tsx -e`) que autentica no Odoo e busca a menor
   `data_orcamento` entre os pedidos de venda em aberto:
   ```bash
   npx tsx --env-file=.env.local -e "
   import('./src/worker/odoo/client').then(async ({ clientFromEnv }) => {
     const c = clientFromEnv(); await c.authenticate();
     const etapas = [130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226];
     const rows = await c.searchRead('pedido.documento',
       [['tipo','=','venda'],['etapa_id','in',etapas],['data_orcamento','<','2026-01-01']],
       ['data_orcamento','etapa_id','tipo'], { order: 'data_orcamento asc', limit: 5 });
     console.log(JSON.stringify(rows, null, 2));
   });"
   ```
2. Ler a menor `data_orcamento`. Definir o literal do override como o PRIMEIRO DIA DO MÊS dessa
   data (piso seguro; ex.: pedido em `2024-11-14` -> override `2024-11-01`).
3. Se o resultado divergir de `2024-11-01`, usar o valor apurado em todas as tasks abaixo.

**Verificação:** o comando imprime ao menos 1 linha `tipo=venda`, etapa nos 27,
`data_orcamento < 2026-01-01`. Registrar a data no commit da Task 1.

---

## Task 1 , Fonte única do override em `corte.ts` (`OVERRIDE_INGESTAO` + `corteIngestaoDe`) e refactor de `corteDomain`

**Files:**
- `src/worker/sync/corte.ts` (edit)
- `src/worker/sync/corte.test.ts` (edit)

**Interfaces:**
```ts
export const OVERRIDE_INGESTAO: ReadonlyMap<string, string>;
export function corteIngestaoDe(odooModel: string): string;
```

**Steps (TDD):**
1. Em `corte.test.ts`, adicionar testes (vermelho):
   ```ts
   import { corteDomain, corteDomainHerdado, corteIngestaoDe, OVERRIDE_INGESTAO, CORTE_INGESTAO_ISO } from "./corte";

   describe("OVERRIDE_INGESTAO , recuo cirurgico por-modelo (fonte unica)", () => {
     it("recua pedido.documento e sped.documento.item para 2024-11-01", () => {
       expect(OVERRIDE_INGESTAO.get("pedido.documento")).toBe("2024-11-01");
       expect(OVERRIDE_INGESTAO.get("sped.documento.item")).toBe("2024-11-01");
     });
     it("corteIngestaoDe devolve o override quando existe, senao o global", () => {
       expect(corteIngestaoDe("pedido.documento")).toBe("2024-11-01");
       expect(corteIngestaoDe("sped.documento")).toBe(CORTE_INGESTAO_ISO);
       expect(corteIngestaoDe("res.partner")).toBe(CORTE_INGESTAO_ISO);
     });
   });
   ```
   E ATUALIZAR o teste existente de `corteDomain` que hoje afirma
   `corteDomain("pedido.documento")` implicitamente em 2026: cravar que agora o pedido usa o
   override:
   ```ts
   it("pedido.documento usa o override (recuo cirurgico), nao o global", () => {
     expect(corteDomain("pedido.documento")).toEqual([["data_orcamento", ">=", "2024-11-01"]]);
   });
   it("modelo sem override continua no corte global 2026", () => {
     expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", CORTE_INGESTAO_ISO]]);
   });
   ```
2. Implementar em `corte.ts`, logo após a declaração de `CORTE_INGESTAO_ISO`:
   ```ts
   /**
    * Recuo cirurgico do corte de ingestao POR MODELO. Fonte unica, literal e PERMANENTE
    * (deployada com o codigo, nunca configuravel na tela). Lida de forma IDENTICA por
    * corteDomain, corteDomainHerdado, dominioAtendimento e o purge, para que reconcile,
    * atendimento e limpeza nunca divirjam sobre ate onde o cache guarda cada modelo.
    *
    * So `pedido.documento` (header do pedido) e `sped.documento.item` (itens de pedido) recuam,
    * para trazer os pedidos em aberto anteriores a 2026 SEM repor o historico de notas/financeiro.
    * A data e a do pedido em aberto mais antigo (Task 0, ~nov/2024). Ver PLAN Fase 1B.
    */
   export const OVERRIDE_INGESTAO: ReadonlyMap<string, string> = new Map([
     ["pedido.documento", "2024-11-01"],
     ["sped.documento.item", "2024-11-01"],
   ]);

   /** Data de corte de ingestao efetiva do modelo: override se houver, senao o global. */
   export function corteIngestaoDe(odooModel: string): string {
     return OVERRIDE_INGESTAO.get(odooModel) ?? CORTE_INGESTAO_ISO;
   }
   ```
3. Refatorar `corteDomain` para usar o helper (troca literal, sem mudar assinatura):
   ```ts
   export function corteDomain(odooModel: string): Array<[string, string, string]> {
     const entry = POR_MODELO.get(odooModel);
     if (!entry?.corte) return [];
     return [[entry.corte.odoo, ">=", corteIngestaoDe(odooModel)]];
   }
   ```

**Verificação:** `npx jest src/worker/sync/corte.test.ts` verde. `npx tsc --noEmit`.

---

## Task 2 , `corteDomainHerdado` consome o override em UNIÃO (pedido recua, nota fica em 2026)

**Files:**
- `src/worker/sync/corte.ts` (edit)
- `src/worker/sync/corte.test.ts` (edit)

**Interfaces:** o retorno de `corteDomainHerdado` deixa de ser `Array<[string,string,string]>`
e passa a ser um domínio Odoo genérico (pode conter operadores `"|"`/`"&"`):
```ts
export type OdooDomain = Array<string | [string, string, unknown]>;
export function corteDomainHerdado(odooModel: string): OdooDomain;
```
`reconcile.ts` já usa o retorno só via `.length` e `client.searchIds(model, herdado)`
(`unknown[]`), então a troca de tipo é contida.

**Steps (TDD):**
1. Atualizar os testes existentes de `corteDomainHerdado`. O teste que hoje afirma
   `corteDomainHerdado("sped.documento.item") == [["documento_id.data_emissao",">=","2026-01-01"]]`
   passa a refletir o override em união (vermelho):
   ```ts
   it("sped.documento.item COM override: uniao pedido>=override OR nota>=global (nao inunda com notas)", () => {
     // Pedido recua para 2024-11; nota FICA em 2026 (preserva a rede de seguranca do reconcile de notas).
     expect(corteDomainHerdado("sped.documento.item")).toEqual([
       "|",
       "&", ["pedido_id", "!=", false], ["documento_id.data_emissao", ">=", "2024-11-01"],
       "&", ["pedido_id", "=", false], ["documento_id.data_emissao", ">=", "2026-01-01"],
     ]);
   });
   it("NETO rastreabilidade (sem override): encadeia ate o avo, inalterado", () => {
     expect(corteDomainHerdado("sped.documento.item.rastreabilidade")).toEqual([
       ["item_id.documento_id.data_emissao", ">=", "2026-01-01"],
     ]);
   });
   it("filho sem override (duplicata): dominio simples pela data do pai", () => {
     expect(corteDomainHerdado("sped.documento.duplicata")).toEqual([
       ["documento_id.data_emissao", ">=", "2026-01-01"],
     ]);
   });
   ```
2. Implementar. Antes do retorno herdado simples, tratar o caso do item com override. Manter os
   demais ramos como estão, só trocando `CORTE_INGESTAO_ISO` por `corteIngestaoDe` onde o modelo
   filho tiver override (hoje só o item):
   ```ts
   export function corteDomainHerdado(odooModel: string): OdooDomain {
     const entry = POR_MODELO.get(odooModel);
     if (!entry) return [];
     if (entry.corte) return [[entry.corte.odoo, ">=", corteIngestaoDe(odooModel)]];
     if (!entry.cortePai) return [];

     const pai = POR_TABELA_RAW.get(entry.cortePai.tabelaRawPai);
     if (!pai) return [];

     if (pai.corte) {
       const campoPai = `${entry.cortePai.fkRaw}.${pai.corte.odoo}`;
       const override = OVERRIDE_INGESTAO.get(odooModel);
       // Caso especial e UNICO hoje: sped.documento.item. So os itens de PEDIDO recuam; os de
       // NOTA (pedido_id=false, 91% do volume) ficam no corte global 2026. Sem o gate de
       // pedido_id, recuar a data do pai reinundaria com ~172 mil itens de nota (BLOCKER-2).
       // Sem o ramo de nota, o reconcile deixaria de repor itens de nota perdidos na janela de
       // commit do Odoo (os 158 itens/R$493k que motivaram o reconcile bidirecional).
       if (override) {
         return [
           "|",
           "&", ["pedido_id", "!=", false], [campoPai, ">=", override],
           "&", ["pedido_id", "=", false], [campoPai, ">=", CORTE_INGESTAO_ISO],
         ];
       }
       return [[campoPai, ">=", CORTE_INGESTAO_ISO]];
     }
     if (pai.cortePai) {
       const avo = POR_TABELA_RAW.get(pai.cortePai.tabelaRawPai);
       if (avo?.corte) {
         return [
           [
             `${entry.cortePai.fkRaw}.${pai.cortePai.fkRaw}.${avo.corte.odoo}`,
             ">=",
             CORTE_INGESTAO_ISO,
           ],
         ];
       }
     }
     return [];
   }
   ```
   Exportar `OdooDomain` no topo do arquivo.

**Verificação:** `npx jest src/worker/sync/corte.test.ts` verde. `npx tsc --noEmit` (conferir
que `reconcile.ts` compila com o novo tipo de retorno).

**Perícia embutida:** confirmar que `reconcile.ts` L94-98 continua correto:
`corteDomain("sped.documento.item")` é `[]` (item não tem corte próprio), então o ramo
`herdado.length && !corteDomain(model).length` dispara e usa `searchIds(model, herdado)` com a
união. O conjunto `vivos` (step 1) continua sendo `searchIds(model, corteDomain(model)=[])` = o
modelo INTEIRO (amplo), então nenhum item antigo é marcado `rawDeleted`. Este é o motivo pelo
qual os antigos sobrevivem ao reconcile (verificar no aceite, Task 9).

---

## Task 3 , `DOMINIO_ATENDIMENTO` vira função que lê o override (a_atender dos antigos fresco)

**Files:**
- `src/worker/sync/atendimento.ts` (edit)
- `src/worker/sync/atendimento.test.ts` (edit)
- `src/worker/index.ts` (nenhuma mudança: já chama `syncAtendimento`, que passa a montar o
  domínio internamente)

**Interfaces:**
```ts
export function dominioAtendimento(): Array<[string, string, string | boolean]>;
```
Manter um export de compatibilidade? NÃO. `DOMINIO_ATENDIMENTO` é referenciado só em
`atendimento.ts` e no teste (grep confirmou). Trocar por função evita a const congelada no
import (MINOR-2).

**Steps (TDD):**
1. Em `atendimento.test.ts`, trocar as asserções sobre a const por chamadas à função e cravar o
   recuo (vermelho):
   ```ts
   import { syncAtendimento, dominioAtendimento } from "./atendimento";
   ...
   describe("dominioAtendimento", () => {
     it("le so itens que pertencem a um pedido", () => {
       expect(dominioAtendimento()).toContainEqual(["pedido_id", "!=", false]);
     });
     it("recua com o override de sped.documento.item (a_atender dos antigos fresco)", () => {
       expect(dominioAtendimento()).toContainEqual([
         "documento_id.data_emissao", ">=", "2024-11-01",
       ]);
     });
     it("NAO filtra por write_date , e a razao de existir do job", () => {
       const campos = dominioAtendimento().map(([campo]) => campo);
       expect(campos).not.toContain("write_date");
     });
   });
   ```
2. Em `atendimento.ts`:
   ```ts
   import { corteIngestaoDe } from "./corte";
   ...
   const MODELO = "sped.documento.item";

   /**
    * So itens que pertencem a um pedido, e so dentro do corte de ingestao EFETIVO do item
    * (override de Fase 1B: 2024-11). Funcao, nao const: a const congelava CORTE_INGESTAO_ISO
    * no import e o a_atender dos pedidos antigos nunca atualizaria (ficaria congelado/NULL).
    * O gate pedido_id!=false garante que o recuo NAO traz itens de nota.
    */
   export function dominioAtendimento(): Array<[string, string, string | boolean]> {
     return [
       ["pedido_id", "!=", false],
       ["documento_id.data_emissao", ">=", corteIngestaoDe(MODELO)],
     ];
   }
   ```
   E em `syncAtendimento`, trocar a referência `DOMINIO_ATENDIMENTO` por `dominioAtendimento()`
   na chamada a `client.searchReadPage(MODELO, dominioAtendimento(), ...)`.

**Verificação:** `npx jest src/worker/sync/atendimento.test.ts` verde. `npx tsc --noEmit`.

---

## Task 4 , Purge lê o MESMO override (não re-apaga os antigos)

**Files:**
- `src/worker/limpa/alvos.ts` (edit)
- `src/worker/limpa/__tests__/alvos.test.ts` (criar se não existir; senão editar)

**Contexto do código real:** `montaAlvosPurge` (alvos.ts) monta o WHERE de cada tabela e hoje
passa a data por DEFAULT (`CORTE_INGESTAO_ISO`) dentro dos predicados. Para o item, usa
`wherePre2026Neto(..., "raw_sped_documento", "documento_id", "data_emissao")` com o corte
default (2026). Se rodado após o back-fill, o item antigo (parent `data_emissao` 2024-11 < 2026)
CAIRIA no predicado e seria apagado (R2/PR#168). Correção: passar `corteIngestaoDe(model)` como
limiar por modelo.

**Interfaces:** `wherePre2026Raw/Filho/Neto` já aceitam `corte: string` (default
`CORTE_INGESTAO_ISO`). Só o CHAMADOR (`alvos.ts`) muda, passando o override.

**Steps (TDD):**
1. Testes (vermelho) em `alvos.test.ts`:
   ```ts
   import { montaAlvosPurge } from "../alvos";
   import { MODEL_CATALOG } from "../../catalog/model-catalog";

   const alvo = (t: string) => montaAlvosPurge(MODEL_CATALOG).find((a) => a.tabela === t);

   it("pedido.documento usa o override 2024-11-01 (nao apaga os pedidos antigos trazidos)", () => {
     expect(alvo("raw_pedido_documento")!.where).toContain("< '2024-11-01'");
     expect(alvo("raw_pedido_documento")!.where).not.toContain("< '2026-01-01'");
   });
   it("sped.documento.item usa o override 2024-11-01 no limiar do pai (itens de pedido antigos ficam)", () => {
     expect(alvo("raw_sped_documento_item")!.where).toContain("< '2024-11-01'");
   });
   it("sped.documento (nota) permanece no corte global 2026 (o historico de notas segue apagavel)", () => {
     expect(alvo("raw_sped_documento")!.where).toContain("< '2026-01-01'");
   });
   ```
2. Em `alvos.ts`, importar `corteIngestaoDe` e passar o limiar por modelo. Para o RAW com corte
   próprio e para o neto/filho, o limiar é o do modelo cujo DADO decide a exclusão:
   ```ts
   import { corteIngestaoDe } from "../sync/corte";
   ...
   if (e.corte) {
     const corte = corteIngestaoDe(e.odooModel);
     alvos.push({
       tabela,
       criterio: `data ${e.corte.raw} < ${corte}`,
       where: wherePre2026Raw(e.corte.raw, corte),
       chaveNulos: e.corte.raw,
       profundidade: 0,
     });
   } else if (e.cortePai) {
     const pai = catalog.find((p) => rawTableFor(p.odooModel) === e.cortePai!.tabelaRawPai);
     // Limiar do FILHO/NETO: o override do proprio modelo filho (o item recua para 2024-11),
     // senao o corte do pai. Assim o item de pedido antigo (parent data_emissao 2024-11) NAO
     // cai no predicado de exclusao.
     const corte = corteIngestaoDe(e.odooModel);
     if (pai?.corte) {
       alvos.push({
         tabela,
         criterio: `filho de ${e.cortePai.tabelaRawPai} (< ${corte})`,
         where: wherePre2026Filho(e.cortePai.tabelaRawPai, e.cortePai.fkRaw, pai.corte.raw, corte),
         profundidade: 1,
       });
     } else {
       alvos.push({
         tabela,
         criterio: `filho de ${e.cortePai.tabelaRawPai} (< ${corte})`,
         where: wherePre2026Neto(
           e.cortePai.tabelaRawPai, e.cortePai.fkRaw,
           "raw_sped_documento", "documento_id", "data_emissao", corte,
         ),
         profundidade: 2,
       });
     }
   }
   ```

**Verificação:** `npx jest src/worker/limpa` verde. `npx tsc --noEmit`.

**Perícia embutida:** confirmar que `montaAlvosPurge` produz `raw_pedido_documento` e
`raw_sped_documento_item` com `< '2024-11-01'` e `raw_sped_documento` com `< '2026-01-01'`.
Rodar o purge em DRY-RUN (Task 9) para provar `a_deletar=0` nos itens/pedidos antigos trazidos.

---

## Task 5 , Script one-off de back-fill dirigido (idempotente, resolve BLOCKER-1)

**Files:**
- `scripts/backfill/entregas-antigas.ts` (novo)
- `scripts/backfill/__tests__/entregas-antigas.test.ts` (novo)

**O que o script faz, na ordem (mirror do padrão `index.ts` do job de atendimento):**
1. Adquire o lock do ciclo incremental (defesa contra corrida; o runbook também para o worker).
2. `reconcileModel(client, prisma.rawPedidoDocumento, "pedido.documento")` , traz e protege os
   headers antigos (movimento 2 do reconcile, com o override já em `corteDomain`).
3. `reconcileModel(client, prisma.rawSpedDocumentoItem, "sped.documento.item")` , traz os itens
   de pedido antigos via a união de `corteDomainHerdado` (só ramo pedido recua).
4. `syncAtendimento(client, prisma.rawSpedDocumentoItem)` , reprocessa `a_atender` dos itens
   (domínio recuado da Task 3).
5. Rebuild dos fatos: `rebuildFatoPedido`, `rebuildFatoPedidoItem`,
   `rebuildFatoPedidoClassificacao`, e `markFatoBuilt(prisma, CHAVE_BUILD_ATENDIMENTO)`.
6. Libera o lock.
- Default = DRY-RUN: só conta o que reconcile TRARIA (usar o retorno `inseridosFaltantes` sem
  aplicar exigiria um modo de simulação; como `reconcileModel` já é idempotente e não destrutivo
  para os antigos, o DRY-RUN aqui roda os `searchIds` e imprime o tamanho de `faltantes` por
  modelo SEM upsert). `--apply` executa os upserts e o rebuild.

**Interfaces:**
```ts
export async function backfillEntregasAntigas(
  client: OdooClient,
  prisma: PrismaClient,
  opts: { apply: boolean },
): Promise<{ headers: number; itens: number; atendimento: number }>;
```

**Steps (TDD):**
1. Teste (vermelho) com fakes reusando o padrão de `reconcile.test.ts`/`atendimento.test.ts`,
   asserindo a ORDEM das chamadas e os modelos:
   ```ts
   it("reconcilia header ANTES do item, roda atendimento e rebuild, na ordem", async () => {
     const chamadas: string[] = [];
     const client = {
       searchIds: jest.fn().mockImplementation((m) => { chamadas.push(`searchIds:${m}`); return []; }),
       searchRead: jest.fn().mockResolvedValue([]),
       searchReadPage: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
     } as never;
     // ...prisma fake com os delegates raw + os rebuild mockados...
     await backfillEntregasAntigas(client, prismaFake, { apply: true });
     expect(chamadas.indexOf("searchIds:pedido.documento"))
       .toBeLessThan(chamadas.indexOf("searchIds:sped.documento.item"));
   });
   it("DRY-RUN nao faz upsert", async () => {
     await backfillEntregasAntigas(client, prismaFake, { apply: false });
     expect(prismaFake.rawPedidoDocumento.upsert).not.toHaveBeenCalled();
   });
   ```
2. Implementar `scripts/backfill/entregas-antigas.ts`:
   ```ts
   /**
    * Back-fill dirigido dos pedidos antigos em aberto (Fase 1B). NAO se apoia no ciclo de
    * reconcile de 24h (que roda o catalogo inteiro por timer); chama reconcileModel
    * explicitamente para pedido.documento e sped.documento.item, com o override ja no codigo.
    * Idempotente: reconcileModel converge, re-rodar nao duplica nem apaga.
    *
    * PRE-REQUISITO DE RUNTIME (R1/PR#168): o override ja tem que estar deployado em corte.ts
    * e o worker/ciclo incremental PARADO (ver runbook). Congelar o purge.
    *
    * Uso: npx tsx --env-file=.env.local scripts/backfill/entregas-antigas.ts [--apply]
    */
   import { prisma } from "@/lib/prisma";
   import { clientFromEnv } from "@/worker/odoo/client";
   import { reconcileModel } from "@/worker/sync/reconcile";
   import { syncAtendimento } from "@/worker/sync/atendimento";
   import { rebuildFatoPedido } from "@/worker/fatos/fato-pedido";
   import { rebuildFatoPedidoItem } from "@/worker/fatos/fato-pedido-item";
   import { rebuildFatoPedidoClassificacao } from "@/worker/fatos/fato-pedido-classificacao";
   import { markFatoBuilt } from "@/worker/fatos/fato-build-state";
   import { CHAVE_BUILD_ATENDIMENTO } from "@/lib/diretoria/atendimento-status";
   // ... assinatura backfillEntregasAntigas como acima, orquestrando os 5 passos ...
   ```
   Detalhes:
   - No DRY-RUN, calcular `faltantes` por modelo via `searchIds` menos os ids do cache, imprimir
     e NÃO chamar upsert/rebuild (usar um flag que curto-circuita as escritas; a forma mais
     limpa é uma função `contarFaltantes(client, prisma, model)` separada para o dry-run e
     `reconcileModel` real só no `--apply`).
   - `main()` no padrão dos outros scripts: parse de `--apply`, `client.authenticate()`,
     try/finally com `prisma.$disconnect()`.
3. Rodar `npx jest scripts/backfill` verde.

**Verificação:** teste verde; `npx tsc --noEmit`. Execução real fica na Task 8 (runbook).

**Perícia embutida:** garantir idempotência , `reconcileModel` usa `upsert` (create/update por
`odooId`), então re-rodar não duplica. E como o script chama `reconcileModel` (mesma rotina do
ciclo diário), o estado pós-script é EXATAMENTE o de convergência: o reconcile do dia seguinte
não acha nada novo para os antigos (a não ser deleções reais no Odoo).

---

## Task 6 , Runbook de execução com a ORDEM segura (resolve R1/IMPORTANT-3)

**Files:**
- `docs/runbooks/backfill-entregas-antigas.md` (novo)

**Steps:**
1. Escrever o runbook com a sequência inegociável e os comandos de verificação:
   1. **Merge do código** com o override (Tasks 1-5) para a `main` -> deploy (Shepherd/CI). O
      override em `corte.ts` PRECISA estar em produção ANTES de qualquer back-fill (R1).
   2. **Congelar o purge:** não rodar `scripts/limpa/purge-pre-2026.ts --apply` durante a
      operação.
   3. **Parar o ciclo incremental** para não correr contra o back-fill (IMPORTANT-3): em prod,
      pausar o worker (parar o container `worker`); o back-fill roda `tsx` contra Odoo+DB
      diretamente. O script ainda tenta o lock incremental como defesa em profundidade.
   4. **DRY-RUN:** `npx tsx --env-file=.env.local scripts/backfill/entregas-antigas.ts`.
      Conferir a contagem de `faltantes` por modelo (headers e itens de pedido; itens de nota
      devem ser 0 no delta).
   5. **APLICAR:** `... entregas-antigas.ts --apply`. Ele reconcilia headers, itens, roda
      atendimento e rebuilda os fatos.
   6. **Rebuild da imagem do worker** (se o worker rodava em container e mudou código de sync):
      `docker compose build app && docker compose up -d --force-recreate worker` (o worker reusa
      `nexus-odoo:local`; `build worker` é no-op). Conferir a data da imagem.
   7. **Subir o worker** de volta.
   8. **Verificar (Task 9):** antigos aparecem item a item; volume de notas estável; demanda
      "Tudo" cresce e pareia; métricas não-demanda inalteradas.
   9. **Observar 1 ciclo de reconcile** (ou forçar um) e reconferir `rawDeleted=false` nos
      antigos (prova de que R1/PR#168 não ocorreu).

**Verificação:** o runbook é a referência única da operação; nenhuma etapa fora de ordem.

---

## Task 7 , Documentação da regra (mesmo commit da mudança de regra, RF-A7/R5)

**Files:**
- `docs/kpis-diretoria.md` (edit)
- `src/lib/reports/bi-schema-reference.ts` (edit, se descrever a janela da demanda)

**Steps:**
1. Em `kpis-diretoria.md`, na seção de "Demanda a entregar", registrar: a janela da demanda é a
   pílula (Tudo = do pedido mais antigo), e a ingestão recua `pedido.documento` +
   `sped.documento.item` para `OVERRIDE_INGESTAO` (2024-11-01) via `corte.ts` (fonte única lida
   por reconcile, atendimento e purge). Deixar explícito que o corte de LEITURA segue em 2026
   para as demais métricas.
2. Ajustar `bi-schema-reference.ts` se ele descreve o corte da demanda, para casar com a regra.

**Verificação:** `npx tsc --noEmit`; docs consistentes com o código.

---

## Task 8 , Execução do back-fill contra o dado real (E2E, ambiente dev)

**Files:** nenhum (operação; segue o runbook da Task 6 em dev local).

**Steps:**
1. Rebuild da imagem: `docker compose build app`.
2. Parar o worker: `docker compose stop worker`.
3. DRY-RUN do back-fill; registrar contagens.
4. `--apply`.
5. Rebuild dos fatos já ocorre no script; conferir logs.
6. Subir o worker: `docker compose up -d --force-recreate worker`.

**Verificação:** o script termina sem erro e reporta `headers`, `itens`, `atendimento` > 0.

---

## Task 9 , Critérios de aceite ao vivo (o coração da fase, com tolerância)

**Files:** nenhum (consultas ao vivo `docker exec ... psql`). Registrar evidências no PR.

**Aceite A , os antigos aparecem, item a item (resolve B2/R4):**
```sql
-- Pedidos antigos em aberto agora no fato, com bucket ABERTA e etapa nos 27:
select p.odoo_id, substring(p.data->>'data_orcamento' from 1 for 10) as data_orc,
       f.bucket_demanda, f.categoria_operacao
from raw_pedido_documento p
join fato_pedido f on f.odoo_id = p.odoo_id
where substring(p.data->>'data_orcamento' from 1 for 10) < '2026-01-01'
  and f.bucket_demanda = 'ABERTA'
order by data_orc asc;
```
Esperado: >= 1 linha (o conjunto vivo, ~51 pedidos, ~R$ 13,4 mi). Para uma amostra, provar que
(a) o item veio, (b) o CFOP saiu do item, (c) `entraDemanda`, (d) `bucket=ABERTA`:
```sql
select i.data->'pedido_id'->>0 as pedido, substring(i.data->'cfop_id'->>1 from '^[0-9]{4}') as cfop
from raw_sped_documento_item i
where jsonb_typeof(i.data->'pedido_id')='array'
  and (i.data->'pedido_id'->>0)::int in (<ids antigos da query acima>)
  and coalesce(i.raw_deleted,false)=false;
```

**Aceite B , volume de notas estável (resolve BLOCKER-2/RF-B2):**
```sql
select count(*) as item_nota from raw_sped_documento_item
where coalesce(raw_deleted,false)=false and jsonb_typeof(data->'pedido_id') <> 'array';
```
Esperado: ~211.626 (tolerância pequena por sync corrente); NÃO deve ter crescido para ~380k.
`item_pedido` PODE ter crescido acima de 19.880.

**Aceite C , reconcile não re-remove os antigos (resolve R1/PR#168):**
Rodar 1 ciclo de reconcile (ou forçar) e reconferir:
```sql
select count(*) from raw_pedido_documento
where substring(data->>'data_orcamento' from 1 for 10) < '2026-01-01'
  and coalesce(raw_deleted,false)=false;
```
Esperado: igual à contagem pós-back-fill (nenhum antigo virou `rawDeleted=true`).

**Aceite D , purge não apaga os antigos (resolve R2/M3):**
`npx tsx --env-file=.env.local scripts/limpa/purge-pre-2026.ts` (DRY-RUN). Conferir no relatório
que `raw_pedido_documento` e `raw_sped_documento_item` mostram `a_deletar` sem incluir os
antigos trazidos (limiar 2024-11-01).

**Aceite E , demanda pareada nas pontas (resolve INV1/D8):**
Comparar "demanda a entregar" na pílula "Tudo" entre o relatório de entregas parciais, o card
"Demandas a entregar" (Visão geral), o Nex/MCP (`comercial_demanda_em_aberta`) e Relatórios.
Mesmo período (Tudo) + mesma empresa => MESMO número, agora incluindo os antigos (~R$ 13,4 mi a
mais que antes).

**Aceite F , invariante: nenhuma métrica NÃO-demanda incluiu os antigos (resolve IMPORTANT-1):**
```bash
# Todo consumidor de bucket ABERTA / fato_pedido que NAO seja demanda-a-entregar clampa em corte:
grep -rn "corteAtualDate\|janelaClampada\|periodoWhere" src/lib/reports/queries/comercial.ts \
  src/lib/diretoria/queries/pedidos.ts src/lib/reports/queries/pedido-historico.ts
```
E consulta ao vivo de faturamento/a-receber antes e depois do back-fill: os números não mudam
(as métricas seguem clampadas em 2026). Se algum consumidor de demanda-a-entregar NÃO usa a
pílula (Fase 1A) ou algum consumidor não-demanda perdeu o clamp, corrigir na hora.

**Verificação final:** `npx tsc --noEmit` + `npx jest` (suíte completa) verdes; `npm run drift`
se aplicável; evidências dos aceites A-F coladas no PR.

---

## Self-review de cobertura

- **RF-B1 (override fonte única, consumido por corteDomain, corteDomainHerdado, atendimento e
  purge):** Tasks 1 (map + corteDomain), 2 (corteDomainHerdado), 3 (atendimento), 4 (purge). Um
  lugar só (`OVERRIDE_INGESTAO`), lido por `corteIngestaoDe`.
- **RF-B2 (pedido_id != false, sem inundar com 211k notas):** Task 2 (união com gate no ramo de
  pedido; ramo de nota preservado em 2026 para não regredir a rede de segurança) + Task 3
  (atendimento já tem o gate) + Aceite B.
- **RF-B3 (script one-off dirigido, idempotente):** Task 5, reusando `reconcileModel` para
  consistência com o steady-state; Task 8 executa.
- **RF-B4 (ordem/timing seguros, mesmo override em reconcile e purge):** Task 4 (purge lê o
  override), Task 6 (runbook: deploy do override -> parar incremental -> back-fill -> rebuild ->
  observar reconcile), Aceites C e D.
- **RF-B5 (data de start = pedido em aberto mais antigo):** Task 0 confirma ao vivo; literal na
  Task 1.
- **Riscos de segurança endereçados:**
  - **R1/PR#168 (reconcile re-remove os antigos):** override entra no `corteDomain` do header
    (reconcile passa a proteger e trazer os antigos), o conjunto `vivos` do item é amplo
    (modelo inteiro) e nunca marca antigo como deletado; ordem de runtime no runbook (código
    antes do dado). Provado no Aceite C.
  - **R2/M3 (purge re-apaga):** Task 4 faz o purge ler o MESMO override por CÓDIGO; Aceite D
    prova `a_deletar=0` para os antigos.
  - **BLOCKER-2 (inundação de 172k notas):** união com gate `pedido_id` (Task 2); Aceite B.
  - **IMPORTANT-1 (vazamento para métricas não-demanda):** constraint 4 + Aceite F (grep +
    números não mudam); demanda usa pílula (Fase 1A), não o corte de leitura.
  - **IMPORTANT-3 (corrida com o ciclo de 3min):** runbook para o worker; script pega o lock
    incremental; rebuild dos fatos dentro do próprio script, com `markFatoBuilt` só ao fim.
  - **MINOR-2 (const congelada):** Task 3 transforma `DOMINIO_ATENDIMENTO` em função.
- **Perícia sobre a regra durável "corte é filtro, nunca faxina":** nada é apagado; o recuo só
  AMPLIA o que o cache guarda para 2 modelos; o corte de leitura global permanece intocado.
- **Fora de escopo (não feito de propósito):** baixar `sync.corte_dados`/`CORTE_DADOS_MINIMO`
  (constraint 1); recuar notas/financeiro/contábil (D6, cirúrgico); mudanças de UI (fases de
  frontend).
