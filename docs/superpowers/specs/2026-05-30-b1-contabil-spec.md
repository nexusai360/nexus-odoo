# SPEC , B1 Contábil (movimento): pré-build aterrado no fields_get

> **Onda:** B1 do plano Balde B (`docs/superpowers/plans/2026-05-30-balde-b-pre-ativacao.md`).
> **Versão:** v3 (2026-05-30). Aterrada em `fields_get`+`search_count`+`read_group` ao vivo
> contra **produção** (`grupojht.tauga.online`, base de leitura confirmada). v3 aplica as
> duas reviews adversariais (`reviews/2026-05-30-b1-contabil-spec-reviews.md`, B1R-* e B1R2-*),
> que derrubaram premissas falsas da v1/v2 (tools "que já existiam" NÃO existem; vocabulário
> `sem_dado` NÃO existe; raw do referencial JÁ está no catálogo; `contabil.conta` JÁ tem
> `natureza`). Esta v3 está aterrada só em fatos verificados.
>
> **Decisão do usuário (2026-05-30):** a Matrix vai operar contabilidade no Odoo, então B1 é
> prioridade. Construir AGORA a estrutura; ativar/confiar nos números quando os lançamentos
> chegarem (gate de ativação §4).

## 0. Estado atual verificado (o que já existe , não refazer)

- **Domínio contábil tem 2 tools** (`mcp/tools/contabil/index.ts`): `contabil_plano_de_contas`,
  `contabil_estrutura_conta`, ambas leem `fato_conta_contabil` (plano de contas da empresa,
  934 contas reais) via `withFreshness`. Não há nenhuma tool de saldo/movimento/razão hoje.
- **`fato_conta_contabil` já mapeia `natureza`** (de `contabil.conta`) , códigos `01=Ativo,
  02=Passivo, 03=PL, 04=Resultado, 05=Compensação, 09=Outras` (DIST real: 01=300, 02=248,
  04=386). É a dimensão de natureza para o resultado contábil (não precisa do referencial).
- **`contabil.conta.referencial` JÁ está no `MODEL_CATALOG`** (`model-catalog.ts`) e o
  `RawContabilContaReferencial` já existe no schema. Só falta o `fato_*`, query e tool.
- **Padrão de output honesto = `withFreshness`** (`mcp/lib/freshness.ts`): envelope
  `estado: "preparando" | "ok" | "vazio"`. NÃO existe `estado:"sem_dado"`. "vazio" já é o
  estado de "fato buildou com 0 linhas no recorte". É o vocabulário ÚNICO desta onda.

## 1. Achado de campo (real, via `fields_get`/`search_count`/`read_group` ao vivo)

| Modelo | count | Papel | Validável agora? |
|---|---|---|---|
| `contabil.conta.referencial` | **2216** | Plano REFERENCIAL SPED (de-para fiscal), hierárquico | **SIM (dado real)** |
| `contabil.lancamento` | 0 | Cabeçalho do lançamento | Não (estrutural) |
| `contabil.lancamento.item` | 0 | Partidas (linhas débito/crédito) | Não (estrutural) |
| `contabil.lancamento.item.rateio` | 0 | Rateio da partida por centro | Não (fora de escopo §6) |
| `contabil.centro.custo` | 0 | Dimensão centro de custo | Não (denormalizado no item) |

### 1.1 Campos reais relevantes

**`contabil.lancamento.item`** (partidas , 194 campos, 0 registros):
`lancamento_id`→`contabil.lancamento`, `conta_id`→`contabil.conta`,
`centro_custo_id`→`contabil.centro.custo`, `centro_resultado_id`→`finan.centro.resultado`,
`natureza`(sel `[["D","Débito"],["C","Crédito"]]`), **`valor`/`valor_debito`/`valor_credito`**
(monetary , colunas SEPARADAS de débito e crédito, mais o valor da linha),
`conta_natureza`(sel nostore `01..09` , a natureza da conta, denormalizada pelo Odoo mas
`store:false`), `data_lancamento`(date), `historico_id`→`contabil.historico`,
`historico_completo`(text), `empresa_id`→`sped.empresa`, `rateio_ids`→`item.rateio`(o2m).
> Observação verificada: o item **não** expôs `parceiro_id`/`estado` na introspecção ,
> marcar como incerto e confirmar na ativação (§3).

**`contabil.lancamento`** (cabeçalho , 215 campos, 0 registros):
`codigo`(char), `data_lancamento`/`data_extemporanea`(date),
`tipo`(sel `[["N","Normal"],["E","Encerramento"],["X","Extemporâneo"]]`),
**`valor`/`valor_debito`/`valor_credito`**(monetary), `item_ids`→item(o2m),
`centro_resultado_id`, `empresa_id`. (Apenas 3 tipos , NÃO há `apuracao` separado.)

**`contabil.conta.referencial`** (2216 reais, hierárquico):
`codigo`(char `1`/`1.01`/`1.01.01`), `nome`/`nome_completo`(char),
`natureza`(sel `01..09`; DIST real `01=948, 02=376, 03=120, 04=772`),
`tipo`(sel `[["A","Analítica"],["S","Sintética"]]`; DIST `A=2216`),
`nivel`(int), `parent_path`(char), `conta_superior_id`→self.
Amostra real: `{codigo:"1", nome:"ATIVO", natureza:"01", tipo:"A", nivel:1}`.

**`contabil.centro.custo`** (0 reg): `codigo`, `nome`/`nome_completo`,
`tipo`(sel A/S), `nivel`, `parent_path`, `centro_custo_superior_id`→self.

### 1.2 Semântica de saldo (verificada)
O item tem `valor_debito` E `valor_credito` como colunas próprias (mais `natureza` D/C
redundante e `valor`). Saldo de uma conta = `Σ valor_debito − Σ valor_credito`. Não depende de
inferir o lado por `natureza`. **Marcar incerto** apenas: `valor` vs `valor_debito/credito`
(qual a Matrix popula) e o sinal de apresentação por natureza da conta (§3).

## 2. Escopo da onda (honesto, dimensionado , BB-7, B1R2-5/6)

### 2.1 Fatos (3)
1. **`FatoContabilContaReferencial`** , de `contabil.conta.referencial` (2216 reais).
   Plano referencial SPED hierárquico. **Auxiliar** (de-para fiscal, conferência ECD/ECF;
   NÃO é gestão), mas é o **único pedaço validável contra dado real** desta onda , serve de
   prova de que o encanamento B1 (raw→fato→query→tool→freshness) funciona antes dos
   lançamentos chegarem. Distinto de `fato_conta_contabil` (plano da EMPRESA, modelo
   `contabil.conta`); são tabelas e finalidades diferentes.
2. **`FatoContabilLancamento`** , de `contabil.lancamento` (0 reg). Cabeçalho. **Estrutural.**
3. **`FatoContabilLancamentoItem`** , de `contabil.lancamento.item` (0 reg). Partidas , o
   coração. **Estrutural.** Denormaliza (padrão `fato_dfe`): `lancamentoId`,
   `contaId/Codigo/Nome` (via M2O), **`contaNatureza`** (a natureza da conta `01..09`, obtida
   no build via join `conta_id`→`fato_conta_contabil`, B1R2-5 , NÃO via referencial),
   `centroCustoId/Nome`, `valor`, `valorDebito`, `valorCredito` (todos , B1R-7), `natureza`(D/C),
   `lancamentoTipo` (do cabeçalho, p/ excluir encerramento , B1R-4), `dataLancamento`, `historico`.

> **Decisão B1R2-5 (resolvida):** a DRE/resultado agrupa por `contaNatureza` vinda de
> `fato_conta_contabil` (já existe, já tem natureza). O `FatoContabilContaReferencial` **não**
> é dependência do resultado , existe pelo próprio valor (de-para SPED) e pela validação real.
> Não há centro de custo como fato separado (denormalizado no item). Rateio fora (§6).

### 2.2 Tools (5 NOVAS), domínio `contabil`

> Todas seguem o **padrão único** `withFreshness` (estados `preparando|ok|vazio`). Nenhuma é
> "upgrade" (não existe tool contábil de movimento hoje). Nenhum mecanismo de ocultação
> (não existe no `ToolEntry`; e seria mudança de RBAC). A honestidade vem do `_RESPOSTA` no
> estado `vazio` (§2.3).

| Tool (nova) | Fonte | Resposta hoje (0 lançamentos) |
|---|---|---|
| `contabil_saldo_conta` | item (saldo `Σdéb−Σcréd` por conta no período) | `vazio` + _RESPOSTA "não operado" |
| `contabil_movimento_conta` | item (razão: partidas de 1 conta no período) | `vazio` + _RESPOSTA "não operado" |
| `contabil_resultado_por_natureza` | item × `contaNatureza` (contas `04=Resultado`: crédito=receita, débito=despesa, exclui `tipo=E`) | `vazio` + _RESPOSTA "não operado" |
| `contabil_centro_custo` | item (saldo por centro de custo no período) | `vazio` + _RESPOSTA "não operado" |
| `contabil_conta_referencial` | `fato_contabil_conta_referencial` (REAL) | **`ok`** com dado real |

> **B1R2-6:** a tool de resultado chama-se `contabil_resultado_por_natureza` (NÃO "DRE"). Uma
> DRE estruturada (Receita Bruta → Deduções → ... → Resultado) exige granularidade por código
> de conta e fica para a ativação. Esta tool entrega o resultado por natureza/lado, honesto.

### 2.3 Regra ÚNICA de output (resolve B1R2-2)
Contrato fixo de cada tool de gestão (saldo, movimento, resultado, centro de custo):
```
return withFreshness(prisma, ["fato_contabil_lancamento_item"], () => queryX(filtros));
// withFreshness devolve "vazio" quando a query retorna 0 linhas (fato sem lançamentos).
```
O `_RESPOSTA` distingue, dentro de `estado:"vazio"`, os dois casos honestamente:
- fato **globalmente** vazio (0 lançamentos no fato): "a contabilidade ainda não é operada no
  Odoo (sem lançamentos); esta consulta passa a responder quando os lançamentos forem lançados".
- fato com dados mas **filtro** sem retorno: "sem lançamentos nesse recorte (conta/período)".
(O handler faz um `count()` barato do fato para escolher a mensagem.) **Zero vocabulário novo**;
nunca devolve "R$ 0,00" como se fosse fato. `outputSchema` = mesma union de
`plano-de-contas.ts` (`preparando | {ok|vazio + dados + freshness}`).

## 3. Campos de semântica incerta (BB-1) , marcar `// CONFIRMAR na ativação`
1. `valor` vs `valor_debito`/`valor_credito` , persistir os 3 (B1R-7); confirmar qual a Matrix
   popula e a fórmula de saldo na amostra real.
2. Sinal de apresentação do saldo por natureza da conta (devedora/credora por `01..09`).
3. **`lancamentoTipo` no resultado (B1R-4):** excluir `tipo='E'` (Encerramento) , senão o
   encerramento do exercício zera o resultado. `X` (Extemporâneo) entra; confirmar.
4. **`contaNatureza='04'` (Resultado) divide receita/despesa por lado (B1R2-6):** dentro das
   contas `04`, crédito=receita, débito=despesa. Confirmar contra um resultado conhecido.
5. **`estado` e `parceiro_id` no item:** não apareceram na introspecção; confirmar se existem
   (e se há lançamentos em rascunho a excluir) na amostra real.
6. Caminho do de-para conta-empresa→referencial (se a Matrix usar) , só relevante se um dia a
   tool referencial precisar cruzar com o plano da empresa.

## 4. Checklist de ativação (quando os lançamentos chegarem)
1. `npm run discovery:baldes -- --only contabil.lancamento,contabil.lancamento.item` → Balde A.
2. `searchRead(limit 3)` real no item → conferir `valor`/`valor_debito`/`valor_credito`/
   `natureza`/`conta_natureza`/`lancamento_id.tipo`/`estado`/`parceiro_id` (§3).
3. Ajustar builder nos pontos `// CONFIRMAR`; build do fato; E2E das tools , **resultado de
   período fechado tem que bater com o demonstrativo do contador** (B1R-4); saldo/razão coerentes.
4. Calibrar vocabulário do Router + bateria R-X.
5. Nenhuma mudança de catálogo necessária , as tools já estão visíveis e honestas (auto-ativam
   ao popular o fato; só passam de `vazio` para `ok`).

## 5. Não-objetivos
- DRE/balanço estruturados (blocos), SPED ECD/ECF (geração fiscal), depreciação/encerramento/
  demonstração (modelos de menor valor; entram em B1.2 se a Matrix os operar).

## 6. Fora de escopo desta onda
- `contabil.lancamento.item.rateio` e `contabil.lancamento.rateio` (rateio por centro): detalhe
  de exceção; `centro_custo_id` direto no item cobre o caso comum. Documentar.
- `contabil.centro.custo` como fato/tool de dimensão própria (denormalizado no item basta).

## 7. Impactos de teste/contagem (verificados , para o PLAN não errar)
- **`src/worker/catalog/model-catalog.ts`** , +2 raws (`contabil.lancamento`,
  `contabil.lancamento.item`; o referencial JÁ está lá). `model-catalog.test.ts:55`
  `toHaveLength(114)`→**116**; adicionar `MODELOS_B1 = new Set(["contabil.lancamento",
  "contabil.lancamento.item"])` ao filtro `noCatalogo` (análogo a `MODELOS_O1`).
- **`mcp/__tests__/integration.test.ts`** , `CONTABIL_IDS` (2→7: add os 5 ids novos);
  `toHaveLength(74)`→**79** (linhas ~214, 251, 259, 556) e o texto "EXATAMENTE 74"/"todas as 74";
  catálogo bruto `toHaveLength(83)`→**88** (linha 237) + comentário; o `it` "admin vê as 2 tools
  de contábil" (linha ~340) → 7; corrigir o texto cosmético "retorna 47 tools" (linha 542).
- **`src/worker/fatos/registry.ts`** , `FATO_BUILDERS` +3 (referencial, lancamento, item).
- **`mcp/lib/freshness.ts`** , `FATO_FONTE` +3:
  `fato_contabil_conta_referencial`→`{contabil.conta.referencial, incremental}`,
  `fato_contabil_lancamento`→`{contabil.lancamento, incremental}`,
  `fato_contabil_lancamento_item`→`{contabil.lancamento.item, incremental}`.
- **`mcp/tools/contabil/index.ts`** , registrar as 5 tools novas.
- **`src/lib/agent/router/domain-vocabulary.ts`** , o domínio `contabil` JÁ existe (com
  balancete/dre/centro de custo); só **enriquecer** description/examples (`DOMAINS.length`
  continua 9). Invalida `VOCABULARY_VERSION` → rebuild do `app`.
- **`src/lib/mcp-catalog-snapshot.json`** , regenerar com `npm run gen:mcp-catalog`.
- **NÃO mexer** em `registry.test.ts`/`schema-endpoint.test.ts` (usam tools sintéticas, não o
  catálogo real). Não há arquivos `.snap`.
- **BI_SCHEMA_REFERENCE** (Caminho 3c) , adicionar `fato_contabil_lancamento_item`,
  `fato_contabil_lancamento`, `fato_contabil_conta_referencial`.

## 8. Padrão de implementação
Idêntico a O1/O3/O4 (ver §0 do plano Balde B e `docs/runbooks/sync-novo-fato.md`):
migration aditiva (3 fatos; raws: 2 novos + referencial já existe) → builders + testes →
`FATO_BUILDERS`+`FATO_FONTE` → query layer `contabil.ts` (estende o existente) + testes →
5 tools `ToolEntry` → índice `contabil` + bumps (§7) → `BI_SCHEMA_REFERENCE` + enriquecer vocab
→ `gen:mcp-catalog` → rebuild pasta principal → **E2E real do referencial** (2216 linhas) →
checklist de ativação anexado.
