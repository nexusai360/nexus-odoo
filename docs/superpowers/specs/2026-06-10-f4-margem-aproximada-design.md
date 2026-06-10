# Fase 4 , Margem Bruta Aproximada (`margem_aproximada`) , SPEC v1

> Última fase do milestone Faturamento Real Consolidado. Segue Fases 2.5/2.6/3 (em produção).
> Ler junto: `docs/superpowers/plans/PROGRESSO-faturamento-consolidado.md`.

## §0. Histórico
- v1 (2026-06-10): números fundamentados no cache real.
- **v3** (2026-06-10): 2 reviews adversariais Opus validadas no cache. Correções materiais:
  - **[fiscal A1 BLOCKER] `preco_custo` é custo ATUAL (snapshot), não histórico.** Aplicado retroativamente,
    a margem de anos antigos é falsa (2016-2019 dão margem NEGATIVA; acumulado 10,96%). Só períodos recentes
    são confiáveis (2024-2026: **~23%**, plausível p/ equipamentos). **Default = ano corrente** (já é o
    `resolverPeriodoFiscal`); ressalva dura "custo = custo atual do produto; margem de períodos antigos é
    não-confiável"; **flag `custoDesatualizadoProvavel`** quando a fração de itens com custo>receita passa de
    ~10% (proxy de custo defasado).
  - **[fiscal A2 BLOCKER] números fundadores corrigidos:** base de cobertura = **receita de VENDA (ehReceita)**
    = R$ 1.317.861.241 (acum), NÃO o total de saídas R$ 1,863 bi. Cobertura real **~84,8%** (acum) / **99,94%**
    (2025). TODOS os 3776 produtos têm `preco_custo` (a estatística "2982/3776" da v1 estava errada , os sem
    custo são itens cujo produto não casa ou venda sem produto_id).
  - **[arq A4 BLOCKER] fonte ÚNICA + classificação em TS.** NÃO classificar venda em SQL (`LIKE '5xxx%'`
    divergiria do `ehReceita`). Uma query agrega por `cfop_nome` (+ flag preco_custo presente) trazendo
    `vrProdutos`, `quantidade×preco_custo`; a classificação `ehReceita` é feita em TS via `classificarCfop`
    (mesma de `faturamentoPorCfop`), garantindo base coerente entre receita e custo.
  - **[fiscal A6 / arq] NÃO estender o core `_itens-venda-grupo`** (mudaria granularidade e arriscaria
    receitaConsolidada/serieMensal/porCliente). Query dedicada, isolada.
  - **[arq A1] registrar SÓ em `FORMATADORES`** (responder.ts ~1921). `TOOLS_SEM_FORMATADOR_REAL` permanece
    `[]`; o gate real é `envelope-contract.test`. **frozen-30 NÃO existe** (premissa fantasma , remover).
    Golden id `cov-71` (numérico, padrão existente).
  - **[arq A7] integration.test , pontos exatos:** `FISCAL_IDS` +`fiscal_margem_aproximada`; **5 asserts**
    105→106 (super_admin recebe ~254, super_admin vê ~290, admin vê ~299, HTTP ~622) + 114→115 (~277) + **2
    comentários** (inventário "105 tools→106"; header HTTP). `dominio:"fiscal"` (manager/viewer NÃO mudam).
  - **[fiscal A5] margem da operação inclui intragrupo , declarar.** Expor `margemExterna` opcional (sobre
    receita externa) é nice-to-have; se couber, reusar a flag; senão declarar que a margem inclui venda intragrupo.

### Números reais (cache 2026-06-10) , fonte da verdade
| | acumulado | 2025 |
|---|---|---|
| receitaVendaTotal | 1.317.861.241 | 543.368.157 |
| receitaComCusto | 1.117.052.665 | 543.035.822 |
| custoEstimado | 994.659.809 | 417.379.782 |
| margem % | 10,96% (NÃO-confiável) | **23,14%** |
| cobertura | 84,76% | 99,94% |

## §1. Problema / valor

O dono quer noção de **margem** (receita − custo). Não temos contábil (DRE/lucro bloqueado, `fato_contabil`
vazio), mas `fato_produto.preco_custo` existe e cobre **82,5% do valor de venda** (medido: SUM(vrProdutos)
de venda autorizada com custo disponível = R$ 1.536.877.306,15 de R$ 1.863.217.223,89; 2982/3776 produtos
têm custo). Dá para uma **margem bruta APROXIMADA** (receita de venda − custo estimado), **com ressalva
honesta** de cobertura e de que NÃO é lucro (sem despesas/impostos/rateios).

## §2. Objetivo e não-objetivos

**Objetivo:** tool `fiscal_margem_aproximada` (ou `comercial_*`) que devolve, por período/empresa: receita de
venda (base canônica), custo estimado (Σ quantidade×preco_custo dos itens de venda com custo),
margemBrutaAproximada (receita_coberta − custo), percentualMargem, e a **cobertura** (% do valor de venda com
custo) , com ressalva explícita.

**Não-objetivos:** NÃO inventar lucro (sem contábil); não usar custo médio/inferido para os 17,5% sem custo
(declarar como "sem custo"); não eliminar intercompany aqui (margem é sobre venda; usar receita individual de
venda como base, deixar claro); sem migration; não importar de `docs/`.

## §3. Arquitetura

### §3.1 Métrica `margemAproximada` (nova, 1 query agregada)
`src/lib/metrics/fiscal/margem-aproximada.ts`:
```ts
interface MargemAproximadaResultado {
  receitaVendaTotal: number;        // vrProdutos de itens de VENDA (ehReceita) autorizados
  receitaComCusto: number;          // parcela com preco_custo disponivel
  custoEstimado: number;            // Σ quantidade × preco_custo (itens venda com custo)
  margemBrutaAproximada: number;    // receitaComCusto − custoEstimado
  percentualMargem: number;         // margem / receitaComCusto
  coberturaCusto: number;           // receitaComCusto / receitaVendaTotal
  receitaSemCusto: number;          // receitaVendaTotal − receitaComCusto
}
margemAproximada(prisma, input: FaturamentoInput): Promise<MargemAproximadaResultado>
```
1 query `$queryRawUnsafe` (parametrizada, padrão Fase 2.6 , NÃO importar valor `Prisma` no arquivo
jest-testado): JOIN `fato_nota_fiscal_item i` → `fato_produto p ON p.odoo_id = i.produto_id`, filtro venda
(entrada_saida='1', autorizada, período/empresa) E **ehReceita por CFOP**. Como classificar CFOP em SQL é
inviável (Tabela de Regras é TS), **restringir a venda** via lista de CFOP de venda OU calcular receita por
`faturamentoPorCfop` e custo numa query separada sobre os mesmos itens de venda. **Decisão para a review:**
provavelmente 2 passos , (a) `faturamentoPorCfop` dá a receita de venda canônica; (b) query de custo soma
`quantidade×preco_custo` dos itens cujo CFOP é de venda (reusar a classificação). Validar viabilidade na review.

### §3.2 Tool + formatador + catálogo (NOVA tool, 105→106)
- `mcp/tools/fiscal/margem-aproximada.ts` (padrão das fiscais; `resolverPeriodoFiscal`, escopo, withFreshness
  `fato_nota_fiscal_item`+`fato_produto`, enriquecerEnvelope). `_DESTAQUE`: receitaComCusto, custoEstimado,
  margemBrutaAproximada, percentualMargem, coberturaCusto, periodoLabel.
- `fmtMargemAproximada` + **registrar em `FORMATADORES`** (BLOCKER conhecido) + allowlist `TOOLS_QUE_PRECISAM_FORMATADOR`.
  Ressalva no texto: "margem BRUTA aproximada (receita − custo de produto); cobertura X% do valor de venda;
  NÃO é lucro (sem despesas/impostos/rateios)".
- Registro: `mcp/tools/fiscal/index.ts` (import+array). Catálogo 105→**106**, bruto 114→**115**.
- `integration.test.ts`: FISCAL_IDS +`fiscal_margem_aproximada`; **3×** 105→106; 114→115; HTTP; comentário.
- Golden: entrada `cov-margem-aproximada` (prosseguir, sem kpiOuro). Trigger em tool-triggers.data.ts.
- Snapshot: `npm run gen:mcp-catalog`.

## §4. Teste / verificação
- TDD da métrica (mock: faturamentoPorCfop + query de custo). Invariante: margem = receitaComCusto − custo;
  cobertura ≤ 1.
- Formatador testado (ressalva presente). E2E real: cobertura ≈ 82,5%; margem % plausível; números batem.
- jest COMPLETO (106 tools/golden/frozen-30) + conferência verde + tsc + rebuild mcp + smoke test.

## §5. Critérios de aceite
- [ ] `fiscal_margem_aproximada` devolve receita/custo/margem/cobertura com ressalva honesta (não-lucro).
- [ ] Métrica testada (TDD); E2E real (cobertura ~82,5%). Catálogo 106; integration.test/golden/trigger/snapshot.
- [ ] jest completo verde; conferência verde; mcp rebuildado; PROGRESSO + RADAR (Fase 4 done; milestone fechado).
