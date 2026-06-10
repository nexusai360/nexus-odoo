# SPEC v3 , Fase 5: faturamento por regime tributário (`fiscal_faturamento_por_regime`)

> v1 → 2 reviews adversariais Opus (fiscal + arquitetura, validadas no dado real) → **v3**.
> Discovery: `docs/superpowers/research/2026-06-10-financeiro-regime-discovery.md`.

## 0. Achados das reviews aplicados (resumo)
- **[B1 fiscal] Base única = camada canônica `_itens-venda-grupo`** (pós-F2.5, `vrProdutos`+CFOP+marcação intragrupo). NÃO misturar com `faturamento-por-empresa` (vrNf+natureza). Reconciliação contra `receitaConsolidada` (não contra faturamentoPorEmpresa).
- **[B1/B2 arq] `regime_tributario` é `store=false`** (0/18 no raw; provado). NÃO mexer no `field-selection` global (contamina ~70 modelos / risco XML-RPC #8). Trazer via **leitura direcionada** (`search_read` de `sped.empresa` pedindo `["id","regime_tributario","company_id"]`, que retorna o computado).
- **[B2 fiscal / M2 arq] De-para por DÍGITOS DE CNPJ** dos dois lados (nunca por id-space → R10). Lado fato: `parseEmpresaNome(empresaNome).cnpj`. Lado regime: parsear o CNPJ do label de `company_id` (mesmo formato; Unicode ZWJ/hífen-NB → usar só dígitos).
- **[M5 fiscal] Expor DOIS números por regime:** `receitaIndividual` (inclui intragrupo) **e** `receitaExterna` (intragrupo eliminado). Sozinho o individual infla o bucket Lucro Real com venda intragrupo.
- **[M4 fiscal] Regime é snapshot ATUAL (atemporal).** Aviso honesto obrigatório quando o período pedido não for o ano corrente (mudança de enquadramento no período não é refletida). Limitação na §6.
- **[M3 fiscal / m4 arq] Builder asserta `1 raiz CNPJ → 1 regime`** (falha alto em divergência; não silenciar).
- **[M6 fiscal] Golden fixo `Cs Comércio → Presumido(3)`** (apesar do `anexo_1` preenchido; confiar no `regime_tributario`).
- **[M1 arq / m7 fiscal] Cobertura não é 100%.** Gate por VALOR ≥ 99,5% senão E2E falha; `regime_nao_mapeado` sempre exibido com valor+%.
- **[M3 arq] `dim_empresa_regime` = migration manual** (migrate dev proibido) + builder em `FATO_BUILDERS` ciclo `snapshot` + rebuild **app+mcp+worker** (worker via `docker compose build app`, §2.1).
- **[M4 arq] Gates de catálogo enumerados** (ler números exatos no PLAN, não cravar aqui): `integration.test` (várias asserções de contagem + `toHaveLength(read+write)` + bucket fiscal por domínio), `mcp-catalog-snapshot.json` (regen `npm run gen:mcp-catalog`), `MIN_EMBEDDING_TEXT` (≥25), `tool-triggers.data.ts`, barrel `mcp/tools/fiscal/index.ts`, `embedding-text.ts`.
- **[m3 arq] Triggers ESTRITOS** ("por regime/tributação/Simples/Lucro Real/Presumido"), nunca "faturamento total do grupo" (não roubar recall das tools de faturamento).
- **[m2 arq] `cnpj=null` → `regime_nao_mapeado`** (não lançar).

## 1. Objetivo
"Qual o faturamento por regime tributário (Lucro Real / Presumido / Simples / MEI)?",
agrupando o faturamento das empresas do grupo pelo regime da empresa **emitente**.

## 2. Fonte (provada ao vivo)
`sped.empresa.regime_tributario` (selection, `store=false`): `1=SIMPLES, 2=SIMPLES excesso,
3=Lucro Presumido, 3.1=Lucro Real, 4=MEI`. CNPJ via label de `company_id`/`participante_id`.
Mapa por raiz (cravado): Simples=07.390.039/33.718.546/34.461.908/45.424.185;
Presumido=10.557.556/35.156.509/62.673.999; Real=18.282.961/34.161.829. 1 raiz→1 regime.

## 3. Arquitetura
1. **Builder `dim_empresa_regime`** (`src/worker/fatos/...` + `FATO_BUILDERS`, ciclo `snapshot`):
   leitura direcionada de `sped.empresa` (`search_read` fields `["id","regime_tributario","company_id"]`),
   parseia CNPJ do label, reduz a **raiz (8 díg)**, asserta 1 raiz→1 regime, grava
   `dim_empresa_regime(cnpj_raiz PK, regime_codigo, regime_label, atualizado_em)`.
   **NÃO** tocar `field-selection.ts` global.
2. **Migration manual** `prisma/migrations/<ts>_dim_empresa_regime/` (tabela nova; aplicar via
   `migrate deploy`/workaround de drift; nunca `migrate dev`).
3. **Métrica `faturamentoPorRegime`** (`src/lib/metrics/fiscal/faturamento-por-regime.ts`):
   compõe sobre `_itens-venda-grupo` (canônico), agrega por empresa →
   `parseEmpresaNome(empresaNome).cnpj` (raiz) → join `dim_empresa_regime` → agrupa por regime.
   Saída por regime: `{ regime_codigo, regime_label, receitaIndividual, receitaExterna,
   qtdEmpresas, qtdNotas, empresas[] }` + bucket `regime_nao_mapeado` (valor+cobertura%).
   Default período: ano corrente (`resolverPeriodoFiscal`). Flag `regimeSnapshotAtual=true`.
4. **Tool `fiscal_faturamento_por_regime`** (`mcp/tools/fiscal/`): `ToolEntry`+`withFreshness`+período;
   `fmtFaturamentoPorRegime` em FORMATADORES (ressalva honesta: regime ATUAL da empresa;
   individual inclui intragrupo, externo elimina; sem DRE/lucro). Triggers estritos.
   Atualizar todos os gates do catálogo (§0 [M4 arq]).

## 4. Saída / formatador (honesto)
Por regime, ordenado por `receitaExterna` desc: rótulo legível, receita externa (headline) +
individual (com nota "inclui intragrupo"), nº empresas, nº notas, lista de empresas. Linha
`regime_nao_mapeado` se >0. Rodapé: "Regime = enquadramento ATUAL da empresa (snapshot); para
períodos passados, mudanças de regime não são refletidas. Não é apuração de imposto nem lucro."

## 5. Verificação (regra de raiz)
- TDD: métrica + formatador + builder (parse CNPJ Unicode, assert 1 raiz→1 regime, golden Cs→Presumido).
- **E2E real:** `Σ receitaIndividual (todos regimes + não_mapeado) == receitaConsolidada.receitaIndividualTotal`
  e `Σ receitaExterna == receitaConsolidada.receitaExterna` (reconciliação exata, mesma base);
  cobertura por valor ≥ 99,5%; regimes batem com o mapa da discovery. Rebuild app+mcp+worker (§2.1) +
  smoke. **jest COMPLETO** + conferência fiscal verdes antes do push.
- Gates de catálogo todos verdes (contagens + snapshot json + embedding + triggers).

## 6. Fora de escopo
DRE/lucro/EBITDA por regime (contábil vazio). Imposto efetivo por regime (apuração esparsa).
Regime histórico/temporal (snapshot atual; sem campo de vigência no Odoo). Só **faturamento**.
