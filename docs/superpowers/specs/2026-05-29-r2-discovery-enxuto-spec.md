# SPEC, Sub-projeto R2: Discovery enxuto (search_count + 3 baldes)

> **Versão:** v3 (2026-05-29). Aplica review #1 (A1-A9) e review #2 (B1-B8).
> Versão final, base do PLAN.
> **Sub-projeto:** R2 do roadmap de cobertura completa do Odoo.
> **Branch:** `feat/router-ativacao-r2` (mesma das entregas R1 + R2-ctx).
> **Roadmap pai:** `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` (§3, §4 R2).
> **Reviews:** `reviews/2026-05-29-r2-spec-review-1.md`, `reviews/2026-05-29-r2-spec-review-2.md`.
> **Status:** SPEC v3 fechada. Próximo: PLAN v1 (CLAUDE.md §6 [5]).

---

## 1. Objetivo (o quê e por quê)

Produzir uma **classificação determinística dos 652 modelos do Odoo da Tauga em
3 baldes** (A: tem dado real; B: legítimo mas vazio hoje; C: inútil técnico),
usando `search_count` via JSON-RPC para medir volume real de cada modelo, mais
heurísticas offline a partir do schema já catalogado na F0.

**Por que existe:** é o insumo das ondas O1..O5 (e secundárias). Sem essa lista,
cada onda gastaria esforço decidindo "este modelo vale tool?" caso a caso. O R2
entrega a resposta de uma vez, com número de registros e justificativa por modelo.

**Tamanho:** pequeno. Backend puro, sem UI. Um módulo de classificação puro
(testável), um cliente fino de contagem, um script CLI orquestrador, dois
artefatos de saída (JSON + relatório legível).

---

## 2. Escopo

### 2.1 Dentro do escopo

- Classificar **todos os 652 modelos** do `discovery/odoo-schema/schema.json` em
  um único passe (a contagem é barata: 1 RPC por modelo sobrevivente ao filtro
  offline).
- Medir `search_count([])` por modelo via o `OdooClient` JSON-RPC do worker.
- Aplicar a regra de partição determinística da §4 (precedência fixa: C técnico
  antes de A/B; A por volume; B por baixo volume + relevância de negócio).
- Gerar `discovery/odoo-schema/baldes.json`: indexado por modelo, com `count`,
  `balde`, `dominio`, `motivo` e (para Balde B) `previsao_ativacao`.
- Gerar `docs/discovery/2026-05-29-baldes.md`: relatório legível, com sumário por
  domínio e destaque dos 5 domínios prioritários (SPED Fiscal, CRM, Pedido,
  Financeiro, Contábil).
- Resiliência: erro de RPC por modelo (abstract, acesso negado, timeout) não
  derruba o passe inteiro; o modelo é classificado pelo tipo de erro e o passe
  continua.

### 2.2 Fora do escopo

- Não cria `raw_*`, não cria `fato_*`, não cria tool MCP. Isso é trabalho das
  ondas O1..O5 (P1 do roadmap: R2 é só insumo).
- Não altera o schema Prisma nem o worker de sync. O cliente JSON-RPC é
  **reusado** somente para leitura de contagem.
- Não decide a ordem das ondas nem promove nada para `main` automaticamente.
- Não cobre os campos de cada modelo (a F0 já fez o mapa de campos; o R2 só
  precisa de nome, `transient` e contagem).
- Não roda em cron nem agenda re-execução (o roadmap §7 sugere re-rodar a cada 3
  meses, mas isso é operação manual fora deste escopo).

---

## 3. Insumos disponíveis (já existem, reusar)

| Insumo | Caminho | Uso no R2 |
|---|---|---|
| Schema dos 652 modelos | `discovery/odoo-schema/schema.json` | Lista canônica de modelos + flag `transient`. Dict keyed por nome técnico, valor `{name, type, transient, fields, xml_ids_count}`. |
| Cliente JSON-RPC | `src/worker/odoo/client.ts` (`OdooClient`, `clientFromEnv("read")`) | `executeKw(model, "search_count", [[]])` para volume. Já tem retry, throttle (150ms), timeout (60s), redação de senha. |
| Padrão de script standalone | `scripts/router/load-env.ts` + `scripts/router/calibrate-against-batteries.ts` | Carregar `.env.local` antes dos imports; CLI com flags; rodar via `tsx`. |
| Mapa prefixo→área de negócio | `discovery/classificacao.py` (`_AREAS`) | Conceito reusado, reescrito em TS no módulo de classificação. |
| Credenciais Odoo leitura | `.env.local` (`ODOO_URL/DB/USERNAME/PASSWORD`) | Já configuradas (worker usa diariamente). |
| Censo de novo acesso | `docs/superpowers/research/2026-05-21-censo-novo-acesso.md` | Ground-truth de contagens reais sob o usuário `joaozanini` (uid 11, quase-admin, 103 grupos): ex. `sped.tabela.preco.regra` 11.864, `sped.consulta.dfe.item` 4.452. Usado para validar o Balde A no E2E. |
| Auditoria de gap | `docs/discovery/2026-05-28-gap-odoo-mcp.md` | Cobertura atual por prefixo (sped 28,5%, finan 43,2%, contabil 6,9%, crm 0%). |

**Achado A4 (schema.json não distingue abstract):** o campo `type` é sempre
`"Base Object"` e o `Models (ir.model).xlsx` também só traz `Model, Description,
Type, Transient` (sem coluna abstract). Logo, **abstract não é detectável
offline**: o sinal vem do próprio `search_count` (modelo abstract erra). Já
`transient` é confiável (69 dos 652 são transient). Os 11 xlsx não acrescentam
sinal útil ao R2 além do que o `schema.json` já carrega (review A9): `schema.json`
é a fonte canônica do universo de 652 modelos.

**Dependência de credencial (review, novo intel):** o `count` e os erros de
`acesso_negado` dependem das permissões do usuário Odoo configurado em
`.env.local`. O passe deve rodar sob a credencial de maior alcance disponível
(`joaozanini`, uid 11, quase-admin) para minimizar falsos `acesso_negado` e ver o
volume real dos 272 modelos de negócio que o censo revelou. O script apenas usa o
que está em `ODOO_*`; a escolha da credencial é operacional (registrada no
relatório: qual uid rodou o passe).

---

## 4. Algoritmo de classificação (regra de partição determinística)

Cada modelo cai em **exatamente um** balde. A ordem de avaliação é fixa e a
primeira regra que casar vence (precedência top-down). Isso garante partição
exata e reprodutível.

### 4.1 Fase offline (sem RPC), candidatos a Balde C técnico

Avaliada para os 652 modelos a partir do `schema.json`. Marca o modelo como
**C-técnico** (e não chama RPC) quando QUALQUER critério casa:

1. `transient === true` (wizard temporário do Odoo).
2. Nome casa um dos sufixos técnicos: `.base`, `.metodos`, `.arvore`, `.wizard`,
   `.modelo.impressao`, `.impressao`, `.configuracao`, `.configuracao.base`,
   `.settings`, `.mixin`.
3. Prefixo pertence a módulo puramente de UI/infra/sistema do Odoo:
   `ir`, `ks_dashboard_ninja`, `ks`, `web_editor`, `report`, `mail`, `discuss`,
   `bus`, `base_import`, `base`, `hardware`, `change`, `api`, `web`.
   (lista derivada do censo de prefixos da F0. Inclui `ir` por inteiro, review
   A1: os 70 `ir.*` são infra do Odoo, não negócio.)

Cada modelo C-técnico carrega o `motivo` exato (qual regra casou).

### 4.2 Fase online (RPC), separa A de B nos sobreviventes

Para cada modelo que **não** virou C-técnico na fase offline, chama
`search_count([])`:

- **Sucesso, `count > 50`** → **Balde A** (dado real, prioridade nas ondas).
- **Sucesso, `0 <= count <= 50`** → candidato a **Balde B**, segue para §4.3.
- **Erro de RPC** → classificação por tipo de erro (§4.5).

### 4.3 Desempate de baixo volume (Balde B vs C) + sinal de ativação

Um `count` baixo (0..50) sozinho não decide. Aplica-se:

- Se o prefixo do modelo está entre os **domínios de negócio reconhecidos**
  (`sped`, `finan`, `contabil`, `pedido`, `estoque`, `producao`, `crm`,
  `relatorio`, `wms`, `auditoria`, `rh`, `res`, `reinf`) → **Balde B**
  (legítimo, possivelmente ainda não ativado pela Matrix).
- Caso contrário (prefixo não-negócio e baixo volume) → **Balde C-técnico** com
  motivo `baixo_volume_nao_negocio`.

Threshold `> 50` para A e a faixa `0..50` para B são **parâmetros nomeados**
(constantes no módulo), não literais espalhados, para facilitar recalibração.

**`previsao_ativacao` (review A4, heurística determinística).** Todo modelo do
Balde B recebe um sinal computado do próprio passe de contagem, sem RPC extra:

| Sinal | Critério | Leitura |
|---|---|---|
| `em_uso` | `count > 0` (mas <= 50) | já tem registro, módulo vivo, pouco volume. |
| `instalado_sem_uso` | `count == 0` E **outro** modelo do mesmo prefixo tem `count > 0` | módulo presente e parcialmente populado; provável ativação. |
| `sem_sinal` | `count == 0` E nenhum modelo do mesmo prefixo tem dado | módulo legítimo mas inteiro vazio (ex.: `rh.*`, `crm.*` hoje). |

Isso resolve a review A3: `rh.*` e `crm.*` (0 registros, não operados) ficam em
Balde B mas marcados `sem_sinal`, e o relatório os separa dos B "com sinal"
(ex.: `sped.mdfe`). O R2 classifica sem prometer nem descartar; a onda decide com
o sinal em mãos.

### 4.4 Tratamento dos `ir.*` e `res.*`

- `ir.*` (70 modelos): infra do Odoo (`ir.model`, `ir.cron`, `ir.ui.view`,
  `ir.attachment`, `ir.translation`...). Classificados **C-técnico** por prefixo
  na fase offline (§4.1.3), sem RPC. Review A1/A2: sem exceção para
  `ir.attachment` (anexo não é domínio consultável; e teria volume alto, indo
  parar em A indevidamente). Se anexos virarem valor algum dia, é decisão de onda
  específica, não do R2.
- `res.*` (26 modelos): cadastros de negócio (`res.partner`, `res.company`,
  `res.users`) misturados com config (`res.config.settings`). NÃO vira C por
  prefixo (`res` não está na lista §4.1.3). Os de config caem em C pela regra de
  sufixo `.configuracao`/`.settings` quando aplicável; o restante passa pelo RPC
  e cai em A/B pelo volume (`res` está na lista de negócio §4.3).

### 4.5 Erros de RPC por modelo (resiliência)

`search_count` pode falhar. Mapeamento:

Classificação **por tipo de erro**, não por texto da mensagem (review B2: a
Tauga responde em pt-BR, match por substring inglês quebraria):

| Tipo de erro | Balde | Motivo | count |
|---|---|---|---|
| `OdooAccessError` | C-técnico | `acesso_negado` (sem permissão de leitura) | `null` |
| Qualquer outro `OdooRpcFault`/`OdooError` persistente (sobreviveu aos 3 retries) num modelo que passou o filtro offline | C-técnico | `abstract_ou_inexistente` (modelo real responderia ao COUNT) | `null` |
| Falha de rede/timeout (`HttpClientError`/`AbortError`/erro de fetch após retries) | (à parte) | `erro_rpc` transitório, entra em `nao_classificados`; não polui A/B/C | `null` |

A lista `nao_classificados` aparece no JSON e no relatório, com instrução de
re-rodar só esses modelos via `--only` (idempotência: §6). A distinção por TIPO
(não por mensagem) usa o que o `OdooClient` já lança (`errors.ts`): `OdooAccessError`,
`OdooRpcFault`, `HttpClientError`, etc.

---

## 5. Artefatos de saída

### 5.1 `discovery/odoo-schema/baldes.json`

```jsonc
{
  "gerado_em": "2026-05-29T...Z",
  "fonte_schema": "discovery/odoo-schema/schema.json",
  "thresholds": { "balde_a_min": 51, "balde_b_max": 50 },
  "rodou_sob_uid": 11,
  "totais": { "A": 0, "B": 0, "C": 0, "nao_classificados": 0, "total": 652 },
  "por_dominio": {
    "sped": { "A": 0, "B": 0, "C": 0, "nao_classificados": 0 }
    // ... um por prefixo. Soma de cada domínio fecha com o total do domínio (B7).
  },
  "modelos": {
    "sped.documento": {
      "dominio": "sped",
      "descricao": "Documento Fiscal",
      "balde": "A",
      "count": 211000,
      "transient": false,
      "motivo": "volume_acima_threshold"
    },
    "sped.mdfe": {
      "dominio": "sped",
      "descricao": "MDF-e",
      "balde": "B",
      "count": 0,
      "transient": false,
      "motivo": "baixo_volume_dominio_negocio",
      "previsao_ativacao": "instalado_sem_uso"
    },
    "ir.cron": {
      "dominio": "ir",
      "descricao": "Scheduled Actions",
      "balde": "C",
      "count": null,
      "transient": false,
      "motivo": "prefixo_ui_infra"
    }
    // ... 652 entradas. Regras do campo `count` (B3):
    //   A/B medidos via RPC -> int. C-offline -> null. C-via-erro
    //   (acesso_negado/abstract) -> null. C baixo_volume_nao_negocio -> int medido.
    // `descricao` = `name` do schema.json (B4). `previsao_ativacao` só no Balde B
    //   (enum: em_uso | instalado_sem_uso | sem_sinal).
  },
  "nao_classificados": [{ "modelo": "modelo.x", "erro": "timeout após 3 tentativas" }]
}
```

### 5.2 `docs/discovery/2026-05-29-baldes.md`

Relatório legível:
- Sumário executivo: totais A/B/C/não-classificados.
- Tabela por domínio (prefixo), contagem por balde.
- **Seção destacada dos 5 domínios prioritários** (SPED, CRM, Pedido,
  Financeiro, Contábil): modelos de cada balde listados com count.
- Lista do Balde C com motivo agregado (quantos por motivo).
- Lista de não-classificados + comando de re-execução.

---

## 6. Idempotência e re-execução

- Rodar o script de novo regenera os dois artefatos do zero (sobrescreve).
- Flag `--only <modelo,modelo>` reclassifica só os modelos passados (para os
  `nao_classificados`), faz merge no dict `modelos` do `baldes.json` existente e
  **recomputa `totais` e `por_dominio` a partir do dict completo** (review A7:
  fonte única da verdade é o `modelos`, agregados são sempre derivados).
- Flag `--dry-run`: roda o RPC e imprime totais no stdout sem escrever arquivos.
- Flag `--limit N`: classifica só os N primeiros modelos (para smoke test rápido).

---

## 7. Decomposição técnica (arquivos previstos)

**Layout (review B1): lógica de verdade em `src/` (jest só varre `src/` e `mcp/`),
wrappers de I/O em `scripts/`.** Mesmo padrão do R1 (`src/lib/agent/router/calibrate.ts`
testado + `scripts/router/...` wrapper).

| Arquivo | Responsabilidade | Testável |
|---|---|---|
| `src/lib/discovery/baldes/types.ts` | Tipos: `ModeloSchema`, `EntradaBalde`, `Balde`, `Motivo`, `PrevisaoAtivacao`, `ResultadoBaldes`. | n/a |
| `src/lib/discovery/baldes/constants.ts` | Constantes nomeadas: `BALDE_A_MIN=51`, `BALDE_B_MAX=50`, `SUFIXOS_TECNICOS`, `PREFIXOS_UI_INFRA`, `PREFIXOS_NEGOCIO`, `DOMINIOS_PRIORITARIOS`. | n/a |
| `src/lib/discovery/baldes/classify.ts` | Puro. `classificarOffline(modelo)` → C-técnico ou `null` (segue p/ RPC). `classificarComCount(modelo, count)` → A/B + motivo. `classificarComErro(modelo, tipoErro)` → C ou nao_classificado. `previsaoAtivacao(modelo, countsPorPrefixo)`. | Sim, testes pareados. |
| `src/lib/discovery/baldes/classify.test.ts` | TDD: cada regra de precedência, bordas (count=50/51/0, transient, cada sufixo, cada prefixo), cada tipo de erro, cada previsao. | É o teste. |
| `src/lib/discovery/baldes/report.ts` | Puro. `gerarRelatorio(resultado): string` (markdown). | Sim. |
| `src/lib/discovery/baldes/report.test.ts` | TDD do gerador. | É o teste. |
| `scripts/discovery/baldes/count-client.ts` | Wrapper fino sobre `OdooClient` (`@/worker/odoo/client`): `searchCount(model)` → `{ ok:true, count }` ou `{ ok:false, tipo }` classificando o erro pelo TIPO (B2). | E2E (usa rede); teste unitário opcional com client fake. |
| `scripts/discovery/baldes/run.ts` | Orquestrador CLI: lê `schema.json`, filtra offline (classify), chama RPC com pool de concorrência 6, monta `ResultadoBaldes`, escreve `baldes.json` + chama `gerarRelatorio` e escreve o `.md`. Flags `--only/--dry-run/--limit`. | Não (I/O), E2E. |
| `package.json` | `"discovery:baldes": "tsx --env-file=.env.local scripts/discovery/baldes/run.ts"` (B5: sem `load-env`; `OdooClient` não puxa Prisma). | n/a |

`run.ts` e `count-client.ts` resolvem o alias `@/` via tsconfig sob `tsx` (B8).
Lógica de classificação/relatório 100% pura e testada; `run.ts` é só I/O, no
espírito do `calibrate-against-batteries.ts`.

---

## 8. Verificação (CLAUDE.md §6 [9], regra de raiz: dado real)

1. `npx tsc --noEmit` verde.
2. `npx eslint src/lib/discovery/ scripts/discovery/` 0 erros.
3. `npx jest src/lib/discovery/` verde (testes pareados; jest só varre `src/`).
4. **E2E contra a Tauga real:** rodar `npm run discovery:baldes` de verdade
   contra a instância (leitura, sem efeito colateral). Gate duro (review A6):
   - **partição exata:** `A + B + C + nao_classificados == 652`;
   - **`nao_classificados == 0`** após eventual re-rodada `--only` dos que
     falharam por timeout;
   - **0 não-classificados nos 5 domínios prioritários** (`sped`, `crm`,
     `pedido`, `finan`, `contabil`);
   - modelos de ground-truth do censo caem em A: `sped.tabela.preco.regra`
     (11.864), `sped.consulta.dfe.item` (4.452), mais `sped.documento` (~211k
     da F4);
   - `crm.*` cai em B com `previsao_ativacao: sem_sinal` (0/2 no cache, roadmap §8);
   - amostragem manual de ~10 classificações faz sentido de negócio.
5. Code review (`/gsd-code-review`). UI review: não se aplica (sem UI).

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `search_count` em 652 modelos sobrecarrega a Tauga | Pool de concorrência fixo (6) com um único `OdooClient`. Review A5: o `throttleMs` do client adiciona latência por chamada, NÃO serializa concorrência, então não se conta com ele para rate-limit; o limitador real é o tamanho do pool. COUNT é operação barata; ~652 chamadas em lotes de 6 levam ~2-4 min. |
| Modelo abstract trava o passe | Erro tipado vira C-técnico ou não-classificado; passe continua (§4.5). |
| Threshold 50 corta um modelo de negócio com 40 registros | A regra §4.3 manda baixo-volume-de-negócio para B, não C; B é construído nas ondas mesmo sem dado. Nenhum modelo de negócio é descartado por volume. |
| Lista de prefixos UI/infra incompleta | Modelo de infra não listado com baixo volume cai em C por `baixo_volume_nao_negocio`; modelo de infra com volume alto cai em A e é revisado no relatório (falso positivo visível, não silencioso). |
| Schema desatualizado vs Tauga atual | R2 usa o schema.json da F0; se a Tauga ganhou modelos novos desde a F0, eles não aparecem. Registrado como limitação no relatório (re-rodar F0 censo é fora de escopo). |

---

## 10. Decisões tomadas nesta spec (gray areas resolvidas)

D1. **Stack: TypeScript** (não Python). O roadmap §4 R2 aponta "cliente do
worker", que é TS; o output será consumido por ondas TS; e o método do projeto
favorece TDD com testes pareados em jest. A infra Python da F0 fica como está.

D2. **Escopo: todos os 652 modelos** num passe único, não só os 5 prioritários.
`search_count` é barato; classificar tudo agora evita re-trabalho e o relatório
ainda destaca os 5 prioritários. Concilia §3 ("652 modelos") com §4 R2
("5 prioritários").

D3. **Partição determinística por precedência** (C-técnico offline > A por volume
> B por volume+negócio > C por baixo-volume-não-negócio). Garante que cada modelo
cai em exatamente um balde, sem zona cinzenta.

D4. **Abstract detectado via RPC, não offline** (o `type` do schema é sempre
"Base Object", e o `Models (ir.model).xlsx` não traz coluna abstract). Erro de
RPC tipado decide.

D5. **Passe roda sob a credencial de maior alcance** (`joaozanini`, uid 11,
quase-admin) para minimizar falsos `acesso_negado` e enxergar o volume real dos
272 modelos de negócio revelados pelo censo. O script usa o que está em `ODOO_*`;
o relatório registra qual uid rodou.

D6. **Mapa dos 5 domínios prioritários (review A8):** SPED Fiscal=`sped`,
CRM=`crm`, Pedido=`pedido`, Financeiro=`finan`, Contábil=`contabil`. Demais
prefixos entram como "secundário/outros" no relatório.

D7. **Lógica de verdade em `src/lib/discovery/baldes/`** (review B1), só wrappers
de I/O em `scripts/discovery/baldes/`, porque o jest só varre `src/` e `mcp/`.
Espelha o padrão do R1 (núcleo testado + CLI fino).

D8. **Erro de RPC classificado por TIPO** (review B2), nunca por texto da
mensagem (Tauga responde em pt-BR). `OdooAccessError`→acesso_negado;
fault persistente não-acesso→abstract; rede/timeout→nao_classificados.
