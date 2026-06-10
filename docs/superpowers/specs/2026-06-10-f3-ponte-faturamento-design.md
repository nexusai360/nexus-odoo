# Fase 3 , Ponte de Reconciliação do Faturamento (`ponte_faturamento`) , SPEC v1

> Milestone Faturamento Real Consolidado. Segue Fases 2.5 (#82/#83) e 2.6 (#84), em produção.
> Ler junto: `docs/superpowers/plans/PROGRESSO-faturamento-consolidado.md`.

## §0. Histórico
- v1 (2026-06-10): números fundamentados no cache real.
- **v3** (2026-06-10): 2 reviews adversariais Opus (fiscal + arquitetura) validadas no cache. Identidade da
  ponte confirmada ao centavo nos 5 períodos E por empresa. Correções materiais:
  - **[arq BLOCKER]** registrar `fiscal_ponte_faturamento: fmtPonteFaturamento` no map `FORMATADORES` de
    `mcp/lib/responder.ts` (allowlist `TOOLS_SEM_FORMATADOR_REAL` é `[]`; sem o registro, `envelope-contract.test`
    quebra em 2 asserts). É o passo mais fácil de esquecer.
  - **[arq MAJOR] integration.test.ts , pontos exatos:** `FISCAL_IDS` (linha ~153) +`fiscal_ponte_faturamento`;
    **3×** `toHaveLength(104)`→105 (super_admin recebe / super_admin vê / admin vê) + 1 no teste HTTP tools/list
    + `toHaveLength(113)`→114 (catálogo bruto) + comentário "104+9". Manager(29)/viewer(15) **NÃO mudam**
    (tool gated por domínio fiscal). **A tool NÃO é `sempreVisivel`** (senão manager/viewer mudariam).
  - **[arq MAJOR] golden:** entrada **mínima** `{id:"cov-ponte-faturamento", pergunta:"reconcilie o
    faturamento do periodo", dominio:"fiscal", classe:"prosseguir", toolEsperada:"fiscal_ponte_faturamento"}`
    , SEM kpiOuro (kpiOuro faixa exigiria `delta` e arrisca o superRefine). Prefixo `cov-` → frozen-30 intacto.
  - **[arq] registro:** só `mcp/tools/fiscal/index.ts` (import + push no array `fiscalTools`); `catalog/index.ts`
    já faz `...fiscalTools`. Snapshot (`npm run gen:mcp-catalog`) não trava jest, mas regenerar p/ a UI.
  - **[arq] compor as MÉTRICAS** (`faturamentoPorCfop`, `receitaConsolidada` de `@/lib/metrics`), **nunca os
    handlers** das tools (que reabrem freshness/escopo). Um `withFreshness` único. ~8 queries, sem timeout-risk.
  - **[fiscal ALTO] alerta por empresa:** a ponte por empresa pode mostrar receita externa ~zero (empresa 5:
    R$ 53,4mi bruto → R$ 28,5mil externa; empresa 4: 88,9% eliminado). Quando `empresaRef` setado E
    `intragrupoEliminavel/receitaIndividual > 0,5`, o formatador emite aviso de "visão consolidada (CPC 36): a
    maior parte é intragrupo eliminado; para o individual, use a receita individual". Espelha a flag
    `concentrador` da Fase 2.5.
  - **[fiscal MÉDIO]** rótulos honestos: "bruto = soma dos itens (vrProdutos)"; devolução de compra é saída
    física (entra no bruto) por isso é estornada , não "redução de vendas". Ordem das deduções é só
    apresentacional (aditivo).
  - **[fiscal BAIXO]** `reconciliado` trava TAMBÉM `|f1.totalReceita − rc.receitaIndividualTotal| < 0,5`.

## §1. Problema / valor

Hoje a plataforma tem os números certos (receita externa real, faturamento individual, intercompany,
categorias por CFOP), mas **não há uma tool que os amarre numa narrativa de reconciliação**. Quando o dono
pergunta "como você chegou na receita externa de R$ 898 mi a partir do faturamento bruto de R$ 1,86 bi?",
o agente precisa de uma **ponte (waterfall)** que mostre cada dedução. Sem ela, o número real parece
"mágico" e perde credibilidade , o oposto do objetivo do milestone.

A ponte canônica (medida no cache, acumulado, fecha ao centavo):

```
Faturamento bruto (saída autorizada, todas operações)       R$ 1.863.082.551,09
 (−) Não-receita:
       transferência                R$ 237.232.846,99
       devolução (compra)           R$ 106.899.918,51
       remessa                      R$ 104.639.661,16
       simples faturamento          R$  58.510.850,88
       sem CFOP                     R$  23.304.150,08
       outras (5949/6949)           R$  11.784.759,10
       venda de ativo               R$   2.311.350,00
       entrada anômala              R$     635.764,83
       bonificação                  R$      35.286,02
     (total não-receita)            R$ 545.354.587,57
 = Receita individual (venda+serviço+exportação)            R$ 1.317.727.963,52
 (−) Intragrupo eliminável (CPC 36)                          R$   419.601.940,52
 = Receita externa real                                      R$   898.126.023,00
```

Identidade verificada: `externa = bruto − naoReceita − intragrupoEliminavel` (ao centavo).

## §2. Objetivo e não-objetivos

**Objetivo:** uma tool `fiscal_ponte_faturamento` que devolve a ponte estruturada (bruto → deduções de
não-receita por categoria → receita individual → eliminação intragrupo → receita externa real), com
período/empresa, para o agente reconciliar o número real de forma auditável.

**Não-objetivos:** não recalcular nada de forma nova , a métrica **compõe** as canônicas existentes
(`faturamentoPorCfop` + `receitaConsolidada`), que já reconciliam; não muda nenhum número; não toca
contábil/lucro; sem migration; não importar de `docs/` (.dockerignore).

## §3. Arquitetura

### §3.1 Métrica `ponteFaturamento` (composição, sem SQL novo)

`src/lib/metrics/fiscal/ponte-faturamento.ts`:
```ts
ponteFaturamento(prisma, input: FaturamentoInput): Promise<PonteFaturamentoResultado>
```
Composição: chama `faturamentoPorCfop(prisma, {agruparPor:"categoria", ...input})` e
`receitaConsolidada(prisma, input)`. Monta:
```ts
interface PonteDeducao { categoria: CategoriaGerencial; rotulo: string; valor: number; }
interface PonteFaturamentoResultado {
  brutoProdutos: number;            // f1.totalProdutos
  deducoesNaoReceita: PonteDeducao[]; // f1.linhas !ehReceita, desc
  totalNaoReceita: number;          // f1.totalNaoReceita
  receitaIndividual: number;        // f1.totalReceita == rc.receitaIndividualTotal
  intragrupoEliminavel: number;     // rc.receitaIntragrupoEliminavel
  receitaExterna: number;           // rc.receitaExterna
  reconciliado: boolean;            // |bruto - naoReceita - intragrupo - externa| < 0,5
}
```
Invariante interno (e teste): `brutoProdutos − totalNaoReceita − intragrupoEliminavel == receitaExterna`
e `receitaIndividual == brutoProdutos − totalNaoReceita`. `reconciliado` trava isso.

### §3.2 Tool `fiscal_ponte_faturamento`

`mcp/tools/fiscal/ponte-faturamento.ts` , padrão das outras tools fiscais: `inputSchema`
{periodoDe?, periodoAte?, empresaRef?}; `resolverPeriodoFiscal`; `montarEscopoEmpresa`; `withFreshness`
(`fato_nota_fiscal`, `fato_nota_fiscal_item`); `enriquecerEnvelope`. `_DESTAQUE` (primitivos):
`brutoProdutos`, `totalNaoReceita`, `receitaIndividual`, `intragrupoEliminavel`, `receitaExterna`,
`periodoLabel`, `deducoesJson` (JSON-string das deduções top, padrão `topLinhasJson`).

### §3.3 Formatador `fmtPonteFaturamento`

Waterfall textual: "Bruto R$ X. (−) Não-receita R$ Y (transferência ..., devolução ..., ...). = Receita
individual R$ Z. (−) Intragrupo R$ W. = Receita externa real R$ V." Lê só `_DESTAQUE`.

### §3.4 Catálogo (NOVA tool , +1)

- Registrar em `mcp/tools/fiscal/index.ts` (ou onde as tools fiscais são agregadas) + catálogo.
- **Contagem muda 104 → 105:** atualizar `mcp/__tests__/integration.test.ts` (o `toHaveLength(104)` e o
  `expect(catalogo).toHaveLength(113→114)` + a lista `TODOS_IDS` ganha `fiscal_ponte_faturamento`).
- **Golden:** adicionar entrada `cov-` para `fiscal_ponte_faturamento` em `golden/golden-nex.json` (classe
  `prosseguir`, sem kpiOuro ou com kpiOuro `receitaExterna` faixa), senão `golden-schema.test` falha
  (toda read-tool operacional precisa de ≥1 entrada). Não quebra frozen-30 (prefixo `cov-`).
- **Trigger:** adicionar trigger em `mcp/catalog/tool-triggers.data.ts` (perguntas tipo "reconcilie o
  faturamento", "como chegou na receita externa", "ponte do faturamento", "do bruto ao líquido externo").
- **Snapshot de catálogo:** regenerar se o projeto travar o snapshot (verificar `gen-mcp-catalog-snapshot`).

## §4. Estratégia de teste / verificação
- **TDD** da métrica `ponteFaturamento` (mock compõe os 2 retornos; invariante `reconciliado`).
- **Formatador** , teste de unidade do waterfall.
- **Conferência** , a ponte reusa as métricas já cobertas; adicionar um **gate** opcional na conferência:
  `ponte: bruto − naoReceita − intragrupo == externa` por período (reforça a narrativa).
- **Suite jest COMPLETA** verde (`npx jest --silent`): integration.test (**105** tools , atualizar), golden-schema
  (nova entrada), golden-to-oraculo (frozen-30 intacto).
- **E2E real**: a métrica bate com a §1 (externa ≈ R$ 898 mi acum.); reconciliado=true.
- **Rebuild mcp** antes de validar; smoke test da tool.

## §5. Critérios de aceite
- [ ] `fiscal_ponte_faturamento` devolve a ponte (bruto → deduções → individual → intragrupo → externa) com
      período/empresa; `reconciliado=true`.
- [ ] Métrica `ponteFaturamento` testada (TDD) + formatador testado.
- [ ] Catálogo 105 tools; integration.test/TODOS_IDS atualizados; golden com entrada da nova tool;
      frozen-30 intacto; trigger adicionado.
- [ ] Conferência (incl. gate da ponte) verde; suite jest completa verde.
- [ ] E2E real verde; mcp rebuildado; PROGRESSO + RADAR (Fase 3 done).
