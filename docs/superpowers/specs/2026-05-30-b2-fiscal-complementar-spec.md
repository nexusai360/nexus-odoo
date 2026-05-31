# SPEC , B2 Fiscal complementar: achado honesto + escopo real

> **Onda:** B2 do plano Balde B (`docs/superpowers/plans/2026-05-30-balde-b-pre-ativacao.md`).
> **Versão:** v1 (2026-05-30). Aterrada em `search_count`/`fields_get` **ao vivo contra
> produção** (`grupojht.tauga.online`). O usuário confirmou operar o módulo fiscal
> complementar; esta SPEC reporta com honestidade o que existe de fato no Odoo.

## 1. Achado de modelo (real, via JSON-RPC ao vivo)

| Modelo candidato (plano B2) | Existe? | count | Conclusão |
|---|---|---|---|
| `sped.consulta.dfe` | **SIM** | **6288** | Cabeçalho/lote da consulta DF-e (NSU). Único buildável. |
| `sped.mdfe`, `sped.mdfe.documento`, `mdfe.documento`, `sped.documento.mdfe` | **NÃO** | , | "Objeto desconhecido" , módulo MDF-e NÃO instalado no Odoo. |
| `reinf.evento`, `reinf.evento.item`, `sped.reinf`, `sped.reinf.evento` | **NÃO** | , | "Objeto desconhecido" , módulo REINF NÃO instalado. |

**Conclusão honesta (igual O2 CRM / O5 contábil-movimento):** dos 3 alvos do plano B2, **só o
DF-e header existe**. MDF-e (manifesto de transporte) e REINF (obrigação acessória) **não
existem como modelo** neste Odoo , não dá para pré-construir sem a Matrix instalar os módulos.
Ficam fora de escopo (plano §6); quando instalarem, o R2 re-rodado os pega e uma onda nova cobre.

## 2. Escopo da onda (dimensionado , só o que é real)

### 2.1 `sped.consulta.dfe` (6288 reg) , cabeçalho/lote da consulta DF-e
Complementa o `fato_dfe` do O1 (que veio de `sped.consulta.dfe.item`, 1 linha = 1 DF-e). O
header é o **lote de consulta NSU**: o `consulta_id` que cada item DF-e referencia. Valor de
produto: agrupar DF-e por lote/empresa, ver a janela de NSU consultada, status da consulta.

- **Raw:** `sped.consulta.dfe` → `raw_sped_consulta_dfe` (entra no `MODEL_CATALOG`, modo
  `incremental`; some no painel "Estado da ingestão"). **NÃO está no catálogo hoje** (O1 só
  adicionou o `.item`).
- **Fato:** `FatoConsultaDfe` , 1 linha por lote. Campos: a confirmar na execução via
  `fields_get` (49 campos, 18 relevantes já capturados em `discovery`): provável `empresaId`
  (M2O empresa), datas da consulta, faixa de NSU (primeiro/último), `status`/`ambiente`,
  contagem de itens. **Aterrar cada campo no `fields_get` real na Task 0 da execução** (padrão
  O1: a Task 0 inspeciona o raw real antes de fixar o mapper).
- **Tool:** `fiscal_dfe_lotes_consulta` (ou nome a definir) , lotes de consulta DF-e por
  período/empresa, com faixa de NSU e nº de DF-e. Domínio `fiscal`. Reusa o padrão O1.

> **Decisão de valor (a confirmar no PLAN):** se, ao inspecionar os campos reais, o header for
> só controle técnico de NSU (sem empresa/data úteis), o fato pode ser cortado e B2 vira só a
> documentação honesta de §2.2. O 6288 garante que HÁ dado; a utilidade de produto decide.

### 2.2 MDF-e e REINF , honestidade (sem schema/raw/fato/tool)
Como não existem como modelo, B2 NÃO cria nada para eles. Documentar (aqui + onde fizer
sentido) que são "módulos não instalados/operados", e que a cobertura fica **gated pela
instalação** na Matrix (igual à decisão #O2 do CRM transacional). Se o catálogo MCP precisar
responder a perguntas de MDF-e/REINF com honestidade, avaliar uma tool `*_status_dominio` (como
`crm_status_dominio`) , mas só se houver demanda; por ora, fora de escopo.

## 3. Não-objetivos
- Não tocar o `fato_dfe`/tools do O1 (aditivo, P1).
- Não gerar MDF-e/REINF (geração fiscal; e os modelos nem existem).

## 4. Padrão de implementação (se o fato for confirmado)
Idêntico a O1/B1: Task 0 inspeciona `sped.consulta.dfe` real (fixa o mapper) → migration
aditiva (1 raw + 1 fato) → `MODEL_CATALOG` + builder + teste → `FATO_BUILDERS`/`FATO_FONTE` →
query layer + teste → 1 tool `ToolEntry` → índice `fiscal` + bumps (`integration.test`,
`model-catalog.test`) → `BI_SCHEMA_REFERENCE` + vocab → `gen:mcp-catalog` → rebuild pasta
principal → **E2E real (6288 lotes, números coerentes com o `fato_dfe`)**.

## 5. Próximos passos
1. PLAN B2 (curto, sobre esta SPEC) + 1 review, COM a Task 0 de inspeção real dos campos
   (decide se o fato vale ou se B2 é só doc honesta).
2. Execução só com contexto folgado (a migration toca o Postgres dev compartilhado , AVISAR).
