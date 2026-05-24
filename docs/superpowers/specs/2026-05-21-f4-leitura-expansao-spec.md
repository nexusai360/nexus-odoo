# SPEC — F4 Expansão da base de leitura (L1)

> Versão: **v3** (2026-05-21) — versão para o planejamento. Sub-projeto L1 de 3
> (L1 expansão, L2 bateria de leitura, L3 validação do agente). L2 e L3 têm
> specs próprias. Pesquisa: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`.

## Histórico de revisão

- **v1 → v2 (Review #1):** sete achados. DF-e de entrada virou investigação
  obrigatória (risco de duplicar `sped.documento`); camada de referência
  fixada como autônoma; escopo de front-end decidido firme; inclusão de
  `bi-schema-reference.ts` e dos GRANT de role; referência separada em onda
  L1b; critério de contagem sharpened.
- **v2 → v3 (Review #2, adversarial profundo):** sete achados. (1) `fato_preco`
  presumia grão "preço vigente por produto" — grão agora é decidido no plano
  após entender o modelo de tabelas de preço. (2) Uma migration única
  contradizia as ondas — agora uma migration por onda. (3) Risco de
  resumabilidade da ingestão de tabelas grandes — virou pré-condição
  verificável. (4) Tools que leem `raw` direto (apuração, referência) agora
  sancionadas explicitamente. (5) `mcp-capability-levels.ts` trata de
  capabilities de **escrita**; tools de leitura provavelmente não entram lá —
  virou verificação no plano, não premissa. (6) Critério de verde faltava o
  typecheck/build do container `mcp`. (7) L1b tinha 5 tools de lookup de baixo
  valor — reduzida a no máximo 1 tool genérica; o valor da referência é
  alimentar o Caminho 3c via JOIN, não 5 tools de catálogo.

---

## 1. Contexto e objetivo

A plataforma passou a usar o acesso `joaozanini` (103 grupos, quase admin) no
Odoo de produção. O censo mostrou que esse acesso expõe 272 modelos de negócio
além dos 79 hoje sincronizados. A base de leitura (cache, fatos, tools do MCP)
não acompanha esse ganho.

**Objetivo da L1:** ampliar a base de leitura para cobrir os domínios de
negócio novos que têm dado real, de ponta a ponta: ingestão (`raw`), camada de
fatos, query layer, tools semânticas do MCP, RBAC, Caminho 3c e superfícies de
front-end ligadas ao MCP. Ao fim da L1 o cache local está populado com dado de
produção e as tools novas respondem.

Não é objetivo da L1 testar exaustivamente (L2) nem validar o agente (L3); a
L1 entrega a capacidade, L2 e L3 a exercem.

## 2. Escopo

A L1 é dividida em duas ondas internas, executadas e verificadas em ordem.

### 2.1 Onda L1a — domínios operacionais (prioridade)

- **Preços:** `sped.tabela.preco` (15), `sped.tabela.preco.regra` (11.864).
- **Serviços:** `sped.servico` (336).
- **DF-e de entrada (notas de fornecedores):** ver decisão obrigatória abaixo.
- **Fiscal complementar:** `sped.apuracao` (8), `sped.carta.correcao` (12).

**Decisão obrigatória sobre DF-e de entrada (resolver no plano, com
`fields_get` read-only):** já sincronizamos `sped.documento` (46.973 docs) e
`sped.dfe.importacao` (20.248). As notas de entrada provavelmente já estão em
`sped.documento`, discriminadas por emitente/sentido. O plano investiga os três
schemas (`sped.documento`, `sped.dfe.importacao`, `sped.consulta.dfe`) e decide
(a) servir DF-e de entrada de `sped.documento` já sincronizado (preferido, sem
ingestão nova) ou (b) sincronizar `sped.consulta.dfe` + `.item`. Não modelar o
fato de DF-e antes dessa decisão.

### 2.2 Onda L1b — camada de referência

Tabelas estáticas de domínio sincronizadas como `raw`. O **valor principal da
referência é alimentar o Caminho 3c**: ao constar em `bi-schema-reference.ts`,
o executor de SQL pode dar JOIN e resolver códigos (NCM, CFOP, município) para
descrições nas consultas avançadas. A L1b adiciona **no máximo uma** tool de
catálogo, `referencia_buscar` (busca genérica por código/termo numa tabela de
referência nomeada); não cinco tools de lookup. A L1b **não altera as tools
existentes**. Entra depois de L1a entregue e verificada.

Modelos: `sped.ncm`, `sped.cfop`, `sped.cest`, `sped.cnae`, `sped.nbs`,
`sped.natureza.operacao`, `sped.unidade`, `sped.condicao.pagamento`,
`sped.municipio`, `sped.pais`, `sped.estado`, `sped.aliquota.*` (8),
`sped.cst.*` (5), `sped.feriado`.

### 2.3 Carga de ingestão

Rodar o worker contra produção e popular o cache local com todos os modelos
(79 atuais + novos de L1a e L1b). O cache local populado é o substrato de L2 e
L3; a sincronização precisa ser re-executável e seu instante registrado.

### 2.4 Fora do escopo

- Registros gerados de SPED (`sped.registro.*`, ~110 modelos).
- Views de árvore (`*.arvore`); modelos vazios e abstratos.
- RH, produção, CRM nativo: sem dado (RH com módulo desinstalado).
- Qualquer escrita no Odoo (F4 Onda 2, bloqueada pela base de teste).
- **Relatórios visuais no dashboard** para os domínios novos: decisão firme de
  ficar fora. O pedido foi ampliar o MCP; o front-end tocado pela L1 é só o das
  superfícies do MCP (catálogo, documentação, e capability se aplicável).
- A bateria de 1000+ leituras (L2) e a validação do agente (L3).

## 3. Seleção de modelos e mapeamento de domínio

`ReportDomain` tem 9 valores. **Não serão criados domínios novos** (evita
migration de enum, mantém RBAC estável). O domínio `comercial` já cobre compra
e venda (o `pedido.documento` mistura os dois por `tipo`), logo o modelo de
domínios é grosso por desenho e isso é aceitável.

| Conjunto | Modelos Odoo | Domínio RBAC | Fato? |
|---|---|---|---|
| Preços | `sped.tabela.preco`, `.regra` | `comercial` | sim (grão no plano) |
| Serviços | `sped.servico` | `cadastros` | sim |
| DF-e entrada | a decidir (2.1) | `fiscal` | a decidir |
| Apuração | `sped.apuracao` | `fiscal` | não — tool lê `raw` |
| Carta de correção | `sped.carta.correcao` | `fiscal` | não — tool lê `raw` |
| Referência (L1b) | NCM, CFOP, etc. | `fiscal` / `cadastros` | não |

## 4. Arquitetura

A L1 reusa os padrões estabelecidos; nenhuma camada nova é inventada.

### 4.1 Camada raw e migrations

Cada modelo Odoo novo recebe um modelo Prisma `Raw*` (formato dos 79 atuais:
`odooId`, `data` JSONB, timestamps de sync) com `@@map("raw_...")` e uma
entrada em `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`) com `mode`
(`incremental` para transacional, `estatico` para referência). O sync engine é
genérico (itera o catálogo, cria `SyncState` a frio). **Uma migration por
onda**: migration de L1a (raw + fato de L1a), migration de L1b (raw de
referência), para que cada onda suba e seja verificada de forma isolada.

### 4.2 Camada de fatos

Domínios com agregação de negócio ganham builder em `src/worker/fatos/`,
registrado em `FATO_BUILDERS` (`registry.ts`) com o `cycle` correto, modelo
`Fato*` no Prisma, migration e teste unitário. O nome do fato é registrado
onde `withFreshness`/`FatoBuildState` rastreiam frescor.

- `fato_servico` — catálogo de serviços normalizado.
- `fato_preco` — **o grão é decidido no plano** após `fields_get` de
  `sped.tabela.preco`/`.regra`. Não presumir "preço vigente por produto": o
  preço depende de tabela, segmento, quantidade e vigência; o plano define se o
  fato é por (produto × tabela) ou outro grão.
- `fato_dfe_entrada` — condicional à decisão da seção 2.1.

Tools de baixo volume (`apuracao`, `carta.correcao`, referência) **não têm
fato**: a query lê `raw_*` JSONB direto. Isso é sancionado para volume baixo e
sem agregação; tools de volume/agregação usam fato.

### 4.3 Query layer

Funções de consulta em `src/lib/reports/queries/` (compartilhadas dashboard e
MCP), uma por arquivo de domínio, lendo de fatos e de tabelas `raw`. Padrão
idêntico ao `queries/estoque.ts`.

### 4.4 Tools do MCP

Tools em `mcp/tools/<dominio>/`, cada uma um `ToolEntry` que chama a query e
embrulha em `withFreshness`. Conjunto-alvo (lista fechada no plano; critério:
uma tool por pergunta de negócio distinta, sem sobreposição):

- Preços: `preco_produto`, `preco_tabela`.
- Serviços: `servico_buscar`, `servico_listar`.
- DF-e entrada: `dfe_entrada_periodo`, `dfe_entrada_por_fornecedor`.
- Apuração: `apuracao_fiscal_periodo`.
- Referência (L1b): `referencia_buscar` (uma só).

### 4.5 RBAC e Caminho 3c

Tools novas declaram `dominio` conforme a seção 3. `visibleTools` e
`assertToolAllowed` já operam por domínio; sem mudança estrutural de RBAC.
As tabelas `raw_*` e `fato_*` novas **são acrescentadas** a
`src/lib/agent/bi-schema-reference.ts`, senão o Caminho 3c não as enxerga.

### 4.6 Permissões de banco

As tabelas novas precisam de `GRANT SELECT` aos roles `nexus_mcp` e
`nexus_mcp_bi`. O script de provisionamento (`prisma/sql/provision-mcp.sql` e
scripts de role) é atualizado e o GRANT reaplicado após cada migration (RADAR
R4). Critério de aceite 6 cobre.

### 4.7 Front-end e superfícies do MCP

- **Snapshot do catálogo:** regenerar `src/lib/mcp-catalog-snapshot.json` via
  `npm run gen:mcp-catalog` após registrar as tools.
- **Documentação do MCP:** acrescentar as tools novas na documentação em
  Integrações > Servidor MCP > Documentação, no padrão das tools atuais.
- **Capability levels:** `mcp-capability-levels.ts`/`mcp-module-labels.ts`
  tratam de capabilities de **escrita** (seletor de acessos da chave de API).
  O plano verifica se tools de leitura aparecem nessas superfícies; se não
  aparecem, não são tocadas. Não presumir alteração.
- Toda alteração de UI passa por `ui-ux-pro-max`.

### 4.8 Ingestão real

Subir o stack local (`docker compose up -d db redis`), aplicar a migration,
reaplicar os GRANT, rodar o worker (`npm run worker`) para um ciclo completo
que popula `raw_*` e dispara os builders de fato.

**Pré-condição verificável:** antes da carga grande, confirmar no código do
sync engine se a sincronização de um modelo grande é resumível (retoma de onde
parou) ou reinicia do zero em caso de falha. Se não for resumível, a carga é
feita por modelo, do menor para o maior, e cada um verificado antes do
próximo. A maior tabela já sincronizada tem 213 mil linhas.

## 5. Critérios de aceite

1. Todos os modelos de L1a e L1b têm `Raw*` no schema, entrada no
   `MODEL_CATALOG` e migration aplicada (uma por onda).
2. O worker completa um ciclo de sync sem falha por modelo. Verificação: para
   cada modelo, `count(raw_*)` é comparado ao `search_count` do Odoo medido
   **após** o sync; tabelas estáticas batem exatamente; transacionais podem
   divergir só pelos registros criados na janela de sync, divergência listada
   e justificada uma a uma.
3. Os fatos da seção 4.2 são construídos e têm teste unitário verde.
4. As tools novas aparecem em `tools/list` para um usuário com o domínio e
   somem para quem não tem; `bi_consulta_avancada` segue gated a admin e
   enxerga as tabelas novas via `bi-schema-reference.ts`.
5. Verde: `npx tsc --noEmit` (raiz), typecheck do container `mcp`,
   `npx eslint`, `npx jest`, `npx next build` e `docker compose build mcp`.
6. Snapshot de catálogo e documentação do MCP refletem as tools novas; os
   GRANT aos roles `nexus_mcp`/`nexus_mcp_bi` cobrem as tabelas novas.
7. Cada tool nova responde com dado real do cache (verificação de fumaça; a
   bateria exaustiva é a L2).

## 6. Riscos

- **Schema dos modelos Odoo desconhecido.** Mitigação: `fields_get` read-only
  por modelo no plano, fixando campos antes de codar.
- **Ingestão longa e possivelmente não resumível.** Mitigação: pré-condição da
  seção 4.8; carga por modelo, do menor ao maior.
- **Duplicação de DF-e de entrada.** Decisão obrigatória da seção 2.1.
- **Grão do `fato_preco`.** Decidido no plano, não presumido.
- **GRANT esquecido pós-migration.** Seção 4.6 e critério 6 cobrem.

## 7. Downstream

- **L2** consome as tools desta spec para a bateria de 1000+ leituras,
  conferindo cada resultado. Nota de desenho para a spec da L2: a verificação
  do agente deve ser contra **a mesma base que a tool usou (o cache)**, para
  isolar correção de raciocínio de frescor de cache; o frescor é checado à
  parte. O instante da carga de ingestão (seção 2.3) é registrado para isso.
- **L3** valida o agente Nex sobre as mesmas tools (depende da chave de LLM,
  hoje ausente no ambiente; bloqueio conhecido).
