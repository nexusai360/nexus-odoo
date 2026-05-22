# SPEC — F4 L1b: camada de referência (corrigida)

> Versão: **v3** (2026-05-22). Sub-projeto L1 da F4 (Expansão da base de leitura).
> Substitui o desenho da L1b da spec-mãe (`2026-05-21-f4-leitura-expansao-spec.md`
> §2.2) e do plano-mãe (T6.1 a T6.10), que se mostraram furados na sondagem.

## Histórico de revisão

- **Origem:** a spec-mãe previa a L1b como "~25 tabelas de referência em `raw`
  + uma tool genérica `referencia_buscar` lendo `raw`". A sondagem
  `fields_get`/`search_read` read-only das 27 tabelas (2026-05-22) derrubou
  três premissas e motivou esta spec dedicada (ver §1).
- **Reviews v1→v3 (duas passadas adversariais):** (1) `mode` dos 27 modelos
  passou de `estatico` para `incremental` — caminho provado, mais barato, sem
  depender de um processador `estatico` não confirmado. (2) O `createMany` do
  builder de `fato_referencia` (~23k linhas) passa a gravar em lotes, para não
  repetir o timeout do builder de `fato_nota_fiscal`.

## 1. Por que o desenho da spec-mãe não serve

A sondagem das 27 tabelas de referência revelou:

1. **Heterogeneidade.** As 27 tabelas não cabem num molde único. Dividem-se em:
   - **Listas de código** (`ncm`, `cfop`, `cest`, `cnae`, `nbs`,
     `natureza.operacao`, os 5 `cst.*`, `unidade`): par código + descrição/nome.
   - **Geográficas** (`municipio`, `pais`, `estado`): código + nome + relações.
   - **Alíquotas e config** (8 `aliquota.*`, `condicao.pagamento`, `feriado`):
     **não são lookup código→nome** — são percentuais de imposto, faixas, regras
     de data, parâmetros de parcelamento. Uma "busca por código" não as serve.
2. **`withFreshness` exige fato.** O helper do MCP (`mcp/lib/freshness.ts`)
   quebra se chamado sem nenhum fato (`builds[0]!` em array vazio). Uma tool que
   lê `raw` direto não tem como reportar frescor.
3. **RBAC camada 4 nega `raw`.** O `provision-mcp.sql` **revoga `raw_*`** dos
   roles `nexus_mcp`/`nexus_mcp_bi` por desenho. Uma tool lendo `raw_*` tomaria
   "permission denied"; o Caminho 3c idem.

Conclusão: a referência precisa de uma camada **fato** para ser consultável
pelo MCP, e só o subconjunto de lookup faz sentido como tool.

## 2. Escopo

A L1b sincroniza as 27 tabelas de referência como `raw` (uma migration,
`f4l_referencia`) e expõe o subconjunto de lookup por um `fato_referencia` e
uma tool.

### 2.1 Grupo A — lookup (15 tabelas) → `raw` + `fato_referencia` + tool

Tabelas com par código + descrição, que respondem "o que é o código X":

| Modelo Odoo | Registros | campo código | campo descrição |
|---|---|---|---|
| `sped.ncm` | 12.032 | `codigo` | `descricao` |
| `sped.cfop` | 604 | `codigo` | `descricao` |
| `sped.cest` | 924 | `codigo` | `descricao` |
| `sped.cnae` | 1.301 | `codigo` | `descricao` |
| `sped.nbs` | 920 | `codigo` | `descricao` |
| `sped.natureza.operacao` | 104 | `codigo` | `nome` |
| `sped.unidade` | 73 | `codigo` | `nome` |
| `sped.cst.icms` | 15 | `codigo` | `nome` |
| `sped.cst.icms.sn` | 10 | `codigo` | `nome` |
| `sped.cst.ipi` | 14 | `codigo` | `nome` |
| `sped.cst.pis.cofins` | 33 | `codigo` | `nome` |
| `sped.cst.cibs` | 159 | `cst_cibs` | `nome_cst_cibs` |
| `sped.municipio` | 5.829 | `codigo_ibge` | `nome` |
| `sped.pais` | 242 | `codigo_bacen` | `nome` |
| `sped.estado` | 28 | `uf` | `nome` |

### 2.2 Grupo B — alíquotas e config (12 tabelas) → `raw` apenas

Sincronizadas para completar o mapeamento; não viram fato nem tool (não são
lookup). Ficam no cache, acessíveis pelo app/dashboard:

`sped.condicao.pagamento`, `sped.feriado`, `sped.aliquota.icms.proprio`,
`sped.aliquota.icms.st`, `sped.aliquota.inss`, `sped.aliquota.ipi`,
`sped.aliquota.irpf`, `sped.aliquota.iss`, `sped.aliquota.pis.cofins`,
`sped.aliquota.simples.aliquota`, `sped.aliquota.simples.anexo`,
`sped.aliquota.simples.teto`.

### 2.3 Fora do escopo

- Tool ou fato para o Grupo B (não são lookup; `provision-mcp.sql` nega `raw_*`
  aos roles do MCP, então o Caminho 3c também não os alcança — decisão aceita).
- Resolver código→nome **dentro das tools existentes** (a spec-mãe já fixou que
  a L1b não altera tools existentes).
- A ingestão real (Onda I) e a bateria L2.

## 3. Arquitetura

Reusa os padrões da L1a/L1c. Uma camada nova lógica: o `fato_referencia`
unificado.

### 3.1 Camada raw

27 modelos Prisma `Raw*` (formato padrão: `odooId`, `data` Json, `odooWriteDate`,
`syncedAt`, `rawDeleted`), 27 entradas em `MODEL_CATALOG`. Migration única
`f4l_referencia`.

`mode: "incremental"` para os 27 (não `estatico`, como a spec-mãe sugeria).
Motivo: o ciclo incremental é o caminho provado da L1a/L1c, filtra por
`write_date` (uma tabela de referência muda raramente, então o incremental
quase nunca traz linha — é o mais barato), e não depende de um processador
`estatico` cuja existência não foi confirmada no worker. O primeiro ciclo é um
backfill completo (`since = null`), igual a qualquer modelo novo.

### 3.2 `fato_referencia` — tabela unificada

Um único modelo Prisma `FatoReferencia`, grão "uma entrada de referência":

```
FatoReferencia {
  id           Int     @id @default(autoincrement())
  tabela       String   // ex.: "ncm", "cfop", "municipio"
  codigo       String
  descricao    String?
  @@index([tabela])
  @@index([tabela, codigo])
  @@map("fato_referencia")
}
```

`id` é autoincrement (não há um `odooId` único entre tabelas distintas; o par
natural seria `(tabela, codigo)`, mas `codigo` pode repetir entre tabelas e
raramente dentro). O builder reconstrói a tabela inteira a cada ciclo.

O builder `rebuildFatoReferencia` lê os 15 `raw_*` do Grupo A e achata cada
linha em `(tabela, codigo, descricao)` conforme o mapa da §2.1. O mapa
código/descrição por tabela vive no próprio builder (uma constante).
Registrado em `FATO_BUILDERS` com `cycle: "incremental"` e em `FATO_FONTE`
(`mcp/lib/freshness.ts`). Como `FATO_FONTE` mapeia um fato a **um** modelo
Odoo e aqui são 15, o `fato_referencia` aponta para um modelo representativo
para fins de `fonteStatus` (decisão fixada no plano; candidato: `sped.ncm`).

### 3.3 Tool `referencia_buscar`

`mcp/tools/<dominio>/referencia-buscar.ts`. Input: `tabela` (enum dos 15 nomes
do Grupo A) + `termo` (busca ILIKE em `codigo` e `descricao`) + `limite`
opcional. Lê `queryReferenciaBuscar` e embrulha em
`withFreshness(ctx.prisma, ["fato_referencia"], ...)`. Domínio RBAC: `fiscal`
(a referência é majoritariamente fiscal; uma só tool, um só domínio).

### 3.4 Caminho 3c e GRANT

`fato_referencia` entra em `bi-schema-reference.ts` (Caminho 3c resolve
código→descrição via JOIN) e é coberto pelo GRANT dinâmico de `fato_*` do
`provision-mcp.sql`. As 27 tabelas `raw` ficam fora do `bi-schema` e dos GRANT
(o provision nega `raw_*` aos roles do MCP).

## 4. Critérios de aceite

1. Os 27 modelos têm `Raw*`, entrada em `MODEL_CATALOG` (`mode: "incremental"`)
   e a migration `f4l_referencia` aplicada.
2. `FatoReferencia` + `rebuildFatoReferencia` existem, com teste unitário do
   mapeamento (cada um dos 15 tipos de tabela mapeado para `codigo`/`descricao`
   certos) verde. O `createMany` do builder grava em lotes (chunks) para não
   estourar timeout com ~23k linhas.
3. `referencia_buscar` aparece em `tools/list` para o domínio `fiscal`, some
   para quem não tem, e devolve resultados reais (busca por código e por termo).
4. `fato_referencia` consta em `bi-schema-reference.ts`; GRANT coberto pelo
   loop dinâmico.
5. Catálogo: +1 tool de leitura; snapshot (`gen:mcp-catalog`) e teste de
   integração atualizados.
6. Verde: `tsc` (raiz + mcp), `eslint`, `jest`, `next build`,
   `docker compose build mcp`.
7. Onda I: o sync popula as 27 tabelas; `count(raw_*)` conferido contra o
   `search_count` do Odoo (estáticas batem exatamente); `fato_referencia` é
   construído e a tool responde com dado real.

## 5. Riscos

- **Heterogeneidade de campos.** Mitigação: o mapa código/descrição por tabela
  (§2.1) foi fixado pela sondagem; o teste unitário do builder cobre os 15.
- **Volume e timeout do builder.** `ncm` 12k, `municipio` 5,8k; `raw` JSONB
  aguenta com folga. `fato_referencia` terá ~23k linhas — o `createMany` do
  builder grava em lotes (ex.: 5k) dentro da transação, para não repetir o
  timeout que atingiu o builder de `fato_nota_fiscal` (RADAR / handoff L1a).
- **`FATO_FONTE` 1-para-1.** `fato_referencia` vem de 15 modelos mas o mapa
  aceita um; usar um representativo é aproximação aceitável para `fonteStatus`
  (decisão registrada no plano).
- **GRANT esquecido pós-migration.** `db:provision` após a migration (RADAR R4).

## 6. Downstream

A Onda I (ingestão real) sincroniza estas 27 tabelas junto das demais. A L2
exerce a tool `referencia_buscar` na bateria de leitura.
