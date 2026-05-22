# SPEC — F4 L1: execução da L1b + onda L1c (resíduo operacional 4a)

> Versão: **v1** (2026-05-22). Continuação do sub-projeto L1 (Expansão da base
> de leitura). Pesquisa-base: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`.
> Spec-mãe da L1: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`.

## 1. Contexto e objetivo

A L1a (ondas 1 a 5: preços, serviços, DF-e de entrada, apuração, cartas de
correção) foi entregue. Faltaram, por decisão de priorizar a L3:

- **Onda L1b** (camada de referência) — já especificada na spec-mãe §2.2 e
  decomposta no plano-mãe T6.1 a T6.10.
- **Onda I** (ingestão real) — já decomposta no plano-mãe TI.1 a TI.7.

Esta spec **não redesenha** L1b nem Onda I: elas executam o plano-mãe sem
retoque. O único escopo novo aqui é a **onda L1c**: o resíduo operacional da
categoria 4a do censo, que nunca entrou em spec nem plano.

**Objetivo:** completar o mapeamento da base de produção. Ao fim, todo modelo
de negócio com dado real do novo acesso `joaozanini` está no cache (`raw`),
a camada de referência alimenta o Caminho 3c, e o catálogo de tools cresce de
forma enxuta (+1 da L1b, +1 da L1c).

## 2. Escopo

### 2.1 Onda L1b — executar o plano-mãe (sem mudança)

Executar T6.1 a T6.10 do plano-mãe. Resumo do que entregam:

- ~25 modelos de referência fiscal/cadastral/geográfica (`sped.ncm`,
  `sped.cfop`, `sped.cest`, `sped.cnae`, `sped.nbs`, `sped.natureza.operacao`,
  `sped.unidade`, `sped.condicao.pagamento`, `sped.municipio`, `sped.pais`,
  `sped.estado`, `sped.aliquota.*`, `sped.cst.*`, `sped.feriado`) como `Raw*`,
  `mode: "estatico"` no `MODEL_CATALOG`, migration `f4l_referencia`.
- Uma única tool `referencia_buscar` (busca genérica por código/termo numa
  tabela de referência nomeada). Não cinco tools de lookup.
- Tabelas de referência registradas em `bi-schema-reference.ts` (Caminho 3c
  resolve código para descrição via JOIN) e GRANT aos roles `nexus_mcp`/
  `nexus_mcp_bi`.

### 2.2 Onda L1c — resíduo operacional 4a (escopo novo)

Modelos operacionais com dado real que o censo §4a listou e que não entraram
na L1a por volume mínimo:

| Modelo Odoo | Registros | Tratamento |
|---|---|---|
| `sped.certificado` | 11 | `raw` + tool semântica leve |
| `finan.baixa.lancamento` | 3 | `raw` apenas |
| `pedido.faturamento` | 1 | `raw` apenas |

- Os três recebem modelo Prisma `Raw*` e entrada no `MODEL_CATALOG`, numa
  migration própria (`f4l_residuo_4a`). O `mode` de cada um (`incremental` se
  o modelo expõe `write_date`, `estatico` caso contrário) é fixado no plano
  após o `fields_get` read-only, junto da descoberta de campos.
- `sped.certificado` ganha **uma** tool semântica (`fiscal_certificados`):
  lista os certificados digitais com identificação e validade, para responder
  perguntas como "quais certificados temos e quando vencem". Lê `raw` direto,
  sem fato (volume baixo, sem agregação — mesmo padrão sancionado para
  apuração e carta de correção na spec-mãe §4.2). Campos exatos fixados no
  plano via `fields_get` read-only.
- `finan.baixa.lancamento` e `pedido.faturamento` ficam só em `raw`: 1 a 3
  registros não justificam fato nem tool dedicada, e o catálogo enxuto reduz o
  ruído de seleção do modelo (lição da L3). Ficam alcançáveis pelo Caminho 3c.
- As três tabelas `raw` novas entram em `bi-schema-reference.ts` e nos GRANT.

### 2.3 Onda I — ingestão real (executar o plano-mãe)

Após L1b e L1c, executar TI.1 a TI.7 do plano-mãe: subir o stack, aplicar as
migrations novas, reaplicar GRANT, rodar o worker para um ciclo completo que
popula as tabelas `raw` novas, conferir contagem contra o `search_count` do
Odoo, smoke test das tools novas.

### 2.4 Fora do escopo

- `sped.consulta.dfe` e `sped.consulta.dfe.item`: o plano-mãe os excluiu com
  motivo revisado (cursor de distribuição SEFAZ, redundante com `sped.documento`
  e `sped.dfe.importacao` já sincronizados). A decisão é mantida.
- `fato_*` para qualquer modelo da L1c. Só `sped.certificado` tem tool, e ela
  lê `raw`.
- Registros gerados de SPED, views de árvore, modelos vazios e abstratos
  (spec-mãe §2.4).
- A bateria L2 de validação de leitura (sub-projeto seguinte, spec própria).
- Qualquer escrita no Odoo.

## 3. Arquitetura

Reusa integralmente os padrões da spec-mãe §4 (camada `raw`, `MODEL_CATALOG`,
query layer, `ToolEntry` + `withFreshness`, RBAC por domínio, GRANT por
migration). Nada de camada nova.

Pontos específicos da L1c:

- **Domínio RBAC:** `fiscal` para `sped.certificado`; `finan.baixa.lancamento`
  e `pedido.faturamento` não geram tool, logo não declaram domínio (só `raw`).
- **Tool `fiscal_certificados`:** `mcp/tools/fiscal/certificados.ts`, lê via
  `queries/fiscal-complementar.ts` (ou arquivo de query equivalente do domínio
  fiscal), retorna lista de certificados com `withFreshness` sobre a tabela
  `raw_sped_certificado`. Sem `inputSchema` obrigatório (lista completa, volume
  de 11 registros).
- **Migration única da onda** (`f4l_residuo_4a`), separada da `f4l_referencia`,
  para subir e verificar isolada (spec-mãe §4.1).

## 4. Critérios de aceite

1. L1b: T6.1 a T6.10 do plano-mãe concluídas; `referencia_buscar` visível para
   o domínio e some para quem não tem; tabelas de referência em
   `bi-schema-reference.ts`.
2. L1c: os três modelos têm `Raw*`, entrada em `MODEL_CATALOG` e migration
   `f4l_residuo_4a` aplicada; as três tabelas `raw` em `bi-schema-reference.ts`
   e nos GRANT.
3. `fiscal_certificados` aparece em `tools/list` para usuário com domínio
   `fiscal`, some para quem não tem, e responde com dado real do cache.
4. Onda I: worker completa um ciclo de sync sem falha por modelo; para cada
   modelo novo, `count(raw_*)` é conferido contra o `search_count` do Odoo
   medido após o sync. Tabelas de referência (L1b, estáticas) batem
   exatamente; as três tabelas da L1c batem ou divergem apenas pelos
   registros criados na janela de sync, com a divergência justificada.
5. Verde: `npx tsc --noEmit` (raiz), typecheck do container `mcp`,
   `npx eslint`, `npx jest`, `npx next build` e `docker compose build mcp`.
6. Snapshot do catálogo (`gen:mcp-catalog`) e documentação do MCP refletem
   `referencia_buscar` e `fiscal_certificados`.

## 5. Riscos

- **Schema dos modelos Odoo desconhecido.** Mitigação: `fields_get` read-only
  por modelo no plano, fixando campos antes de codar (mesma mitigação da
  spec-mãe §6).
- **`pedido.faturamento` com 1 registro pode ser efêmero.** É só `raw`; se a
  tabela esvaziar, o sync apenas não traz linha. Sem impacto em tool.
- **GRANT esquecido pós-migration.** Reaplicar `db:provision` após cada
  migration (RADAR R4), coberto pelo critério 2 e pela Onda I.

## 6. Downstream

- **Onda I** popula o cache com as tabelas novas; o instante da carga é
  registrado para a L2.
- **L2** (bateria de 1000+ leituras conferidas contra o Odoo) é o próximo
  sub-projeto, com spec própria, exercendo o catálogo já completo.
