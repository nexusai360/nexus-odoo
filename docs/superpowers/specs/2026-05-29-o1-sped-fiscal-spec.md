# SPEC, Onda O1: Expansão SPED Fiscal (piloto da esteira nova)

> **Versão:** v1 (2026-05-29). Antes das duas reviews adversariais (CLAUDE.md §6 [3]/[4]).
> **Onda:** O1 do roadmap de cobertura completa do Odoo (primeira onda de produto).
> **Branch:** `feat/router-ativacao-r2` (decisão do usuário: roadmap inteiro nesta branch).
> **Roadmap pai:** `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` (§4 O1).
> **Insumo:** `discovery/odoo-schema/baldes.json` (R2): 60 modelos `sped.*` em Balde A.

---

## 1. Objetivo

O1 é a **onda piloto** que valida a esteira nova (Router de catálogo R1 + classificação
em baldes R2) sobre um domínio real de alto valor: **SPED Fiscal**. Entrega
cobertura semântica complementar do fiscal, focada no **Balde A** (dado real), sem
duplicar o que a F4 já entregou.

**Critério de "pronto":** perguntas fiscais de entrada (DF-e / notas de fornecedores)
e de cobrança (duplicatas/boletos) que hoje o Nex não responde passam a ter tool;
bateria R-X correspondente >= 95,5%; baseline atual não regride (P1/Q4 do roadmap).

---

## 2. Cobertura atual (o que NÃO refazer)

A F4 (mergeada) já entregou no fiscal:
- **Fatos:** `FatoNotaFiscal` (de `sped.documento`), `FatoNotaFiscalItem` (de
  `sped.documento.item`).
- **13 tools** em `mcp/tools/fiscal/`: `faturamento-periodo`, `faturamento-mensal-serie`,
  `faturamento-por-marca/uf/cliente`, `impostos-periodo`, `notas-emitidas`,
  `notas-emitidas-por-cliente/produto`, `notas-recebidas`, `notas-recebidas-por-fornecedor`,
  `contar-notas`, `produtos-faturados`.
- **Raw já sincronizado** (worker): `raw_sped_documento`, `raw_sped_documento_item`,
  `raw_sped_documento_duplicata`, `raw_sped_dfe_importacao`, `raw_sped_documento_pagamento`,
  `raw_sped_documento_referenciado`, `raw_sped_documento_volume`, `raw_sped_documento_item_rastreabilidade`,
  e dezenas de outros `raw_sped_*`.

> **A review #1 DEVE auditar as 13 tools acima** e listar exatamente o que cada
> uma responde, para O1 não construir tool duplicada. Ver §7 (lista de candidatas
> com nota "verificar overlap").

---

## 3. Escopo proposto do piloto (Balde A, gaps de alto valor)

Recorte coeso e pequeno (piloto), três frentes:

### 3.1 DF-e de entrada (notas de fornecedores capturadas via DF-e)

`sped.dfe.importacao` (211 docs) + `sped.consulta.dfe.item` (4.780 itens): documentos
fiscais eletrônicos de terceiros baixados/consultados (manifestação do destinatário,
notas de compra). Distinto de `sped.documento` (documentos próprios). Valor: "quais
notas de fornecedores chegaram no período", "DF-e pendentes de manifestação", "valor
total de compras por fornecedor via DF-e".

**Entrega:** `FatoDfe` (cabeçalho) + `FatoDfeItem` (itens) + builders + 3 a 4 tools.

### 3.2 Duplicatas / boletos das notas (cobrança fiscal)

`sped.documento.duplicata` (21.356, "Base para código de barras de boleto"): parcelas/
duplicatas vinculadas aos documentos fiscais, com código de barras de boleto. Valor:
"boletos a vencer de uma nota", "duplicatas em aberto por cliente".

**Entrega:** `FatoDuplicata` + builder + 2 tools.

### 3.3 Tabelas de referência fiscal (enriquecimento de consulta)

NCM (12.032), CFOP (604), CEST (924) como dimensões consultáveis: "qual a descrição
do NCM X", "produtos por NCM/CFOP". Verificar na review se já existe `fato-referencia`
cobrindo (há `src/worker/fatos/fato-referencia.ts`).

**Entrega (condicional à review):** 1 a 2 tools de lookup, reusando `fato-referencia`
se já cobrir; senão `FatoReferenciaFiscal`.

---

## 4. O que cada onda entrega (contrato do roadmap §4)

1. **raw_*** para modelos novos: a maioria já existe (§2); confirmar na review se
   `sped.consulta.dfe.item` tem raw (parece faltar; `raw_sped_dfe_importacao` existe).
   Onde faltar, migration aditiva + entrada no `model-catalog.ts` do worker.
2. **fato_*** derivados: `FatoDfe`, `FatoDfeItem`, `FatoDuplicata` (+ referência se
   preciso). Migration Prisma aditiva + builders em `src/worker/fatos/` no padrão
   dos existentes (`fato-nota-fiscal.ts`), registrados no pipeline de fatos +
   `FatoBuildState`.
3. **Tools MCP** no padrão canônico (P2): input Zod, query sempre no fato, agregação
   em TS, envelope com `linhas`/`_RESPOSTA`/`_DESTAQUE`/`_agregado`/`withFreshness`,
   sanitizer, testes pareados. Em `mcp/tools/fiscal/`.
4. **Testes pareados** de cada builder e cada tool.
5. **Vocabulário do Router (R1)** atualizado: termos das tools novas em
   `domain-vocabulary.ts` (domínio fiscal), re-calibragem se necessário.
6. **Bateria R-X** correspondente >= 95,5% + sem regressão do baseline.

---

## 5. Restrições (do roadmap, inegociáveis)

- **Aditivo (P1):** nenhuma tool/fato/raw existente alterado de forma destrutiva.
- **Leitura do cache (decisão #2):** tools leem do Postgres, nunca do Odoo ao vivo.
  Toda tool retorna `withFreshness`.
- **Padrão de tool congelado (P2).**
- **Migration no Postgres dev é compartilhada:** anunciar antes de aplicar
  (protocolo de schema do CLAUDE.md global), rodar `agente schema-changed` depois.
- **RBAC:** as tools fiscais herdam o domínio `fiscal` no catálogo (gate por
  `visibleDomains`); seguir o padrão das 13 existentes.

---

## 6. Verificação (CLAUDE.md §6 [9], dado real obrigatório)

1. `tsc` + `eslint` + `jest` verdes (raiz e mcp).
2. Migration aplicada no dev; builders rodam e populam os fatos novos contra o
   `raw_sped_*` real.
3. **E2E contra dado real:** cada tool nova exercida contra o cache populado;
   conferir números (ex.: total de DF-e do período bate com count do raw;
   duplicatas de uma nota somam o valor da nota).
4. **Rebuild do container `mcp`** (CLAUDE.md §2.1: tools MCP importam de queries;
   `mcp` precisa rebuild) e `worker` (builders/sync mudaram).
5. Bateria R-X (R24+) com perguntas fiscais de entrada/cobrança; >= 95,5%.
6. `/gsd-code-review`. UI review: n/a (sem UI, a menos que toque painel).

---

## 7. Tools candidatas (a review #1 confirma/corta por overlap)

| Tool candidata | Fato | Responde | Overlap a verificar |
|---|---|---|---|
| `dfe_recebidos_periodo` | FatoDfe | DF-e/notas de fornecedores no período | vs `notas-recebidas` (que usa fato_nota_fiscal entrada) |
| `dfe_por_fornecedor` | FatoDfe | compras via DF-e por fornecedor | vs `notas-recebidas-por-fornecedor` |
| `dfe_pendentes_manifestacao` | FatoDfe | DF-e sem manifestação do destinatário | novo (sem equivalente) |
| `dfe_itens_por_produto` | FatoDfeItem | itens comprados via DF-e por produto | novo |
| `duplicatas_a_vencer` | FatoDuplicata | boletos/duplicatas a vencer | vs financeiro? verificar |
| `duplicatas_por_cliente` | FatoDuplicata | duplicatas em aberto por cliente | verificar vs financeiro |
| `lookup_ncm` / `lookup_cfop` | FatoReferencia? | descrição de NCM/CFOP/CEST | vs fato-referencia existente |

A review corta as que duplicam e mantém as genuinamente novas.

---

## 8. Decisões tomadas nesta spec (gray areas)

D1. **Piloto enxuto, não os 60 modelos.** O1 valida a esteira com um recorte coeso
de alto valor (DF-e entrada + duplicatas + referência), não cobre todo o Balde A
do sped (isso é continuação de ondas sped secundárias, roadmap §ON+1). Justificativa:
o roadmap chama O1 de "piloto para validar a esteira"; cobertura exaustiva do sped
viria depois.

D2. **Reuso de raw já sincronizado.** A maioria dos raw_sped_* já existe; O1
constrói fato+tool sobre eles, minimizando migration de sync nova.

D3. **DF-e (entrada de terceiros) é o foco número 1**, por ser o maior gap de
produto não coberto pela F4 (que cobre documentos próprios via fato_nota_fiscal).

D4. **Escopo final das tools é travado na review #1** após auditoria das 13 tools
fiscais existentes (anti-duplicação).
