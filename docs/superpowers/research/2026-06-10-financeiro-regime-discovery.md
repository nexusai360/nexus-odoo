# Discovery , Financeiro + Fase 5 (regime tributário)

> Regra de raiz #6: confrontar o dado real ANTES de desenhar. Tudo abaixo medido
> no cache (`docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1`) e no
> Odoo ao vivo (`scripts/discovery/regime-tributario.ts`, read-only). 2026-06-10.

## 1. Financeiro , JÁ ESTÁ CONSTRUÍDO (recalibra o escopo)

Existem ~14 tools de financeiro **registradas e ativas** no catálogo
(`mcp/tools/financeiro/`, em `integration.test`, com formatador + triggers + testes):

- `financeiro_contas_a_receber`, `financeiro_contas_a_pagar`
- `financeiro_titulos_vencidos` (aging/inadimplência)
- `financeiro_fluxo_caixa` (série mensal realizado x previsto)
- `financeiro_caixa_periodo` (entradas/saídas/saldo realizado)
- `financeiro_saldo_contas` (saldo por conta/banco)
- `financeiro_liquidez`
- `financeiro_resultado_por_conta` (DRE gerencial por conta)
- Cobrança bancária: `financeiro_baixas_cobranca`, `financeiro_carteiras_cobranca`,
  `financeiro_cheques`, `financeiro_pix_recebidos`, `financeiro_remessas_geradas`,
  `financeiro_retornos_processados`

**Fatos populados e sincronizando** (não precisam ser construídos):
- `fato_financeiro_titulo` (8.389): contas a receber/pagar, com vencimento,
  pagamento, situação (provisorio/efetivo/quitado/baixado), juros/multa/desconto.
  Real: a **receber em aberto R$ 64,2 mi** (2.676 títulos, 318 vencidos);
  a **pagar em aberto R$ 394,8 mi** (3.856 títulos, 3.385 vencidos).
- `fato_financeiro_movimento` (13.401): fluxo de caixa entrada/saída/previsto.
- `fato_financeiro_lancamento_item` (11.057): lançamentos por conta/centro.
- `fato_financeiro_saldo` (9): saldo bancário por banco.

**Conclusão:** o trabalho de financeiro NÃO é construir do zero. É:
(a) **verificar E2E contra o cache real** que as 14 tools batem com o SQL (regra de
raiz da verificação); (b) cobrir **lacunas reais** se houver (ex.: por
cliente/fornecedor, por centro de resultado, recebido x previsto por período);
(c) garantir **descoberta** (triggers/embedding) pra o Nex realmente acionar.

## 2. Contábil , VAZIO na fonte (confirma o bloqueio de DRE/lucro)

`raw_contabil_lancamento` = **0**, `fato_contabil_lancamento` = **0**. A
contabilidade (partidas dobradas, contas de resultado) **não é lançada nesse Odoo**.
Por isso NÃO há DRE contábil / lucro / EBITDA. O `financeiro` (caixa/títulos) tem
dado e é coisa diferente do contábil. Margem segue "aproximada" (preço_custo).

## 3. Fase 5 (regime tributário) , TOTALMENTE CONSTRUÍVEL

O campo existe LIMPO no Odoo, só **não era sincronizado**:

```
sped.empresa.regime_tributario  (selection)
  "1"   = SIMPLES
  "2"   = SIMPLES (excesso de sublimite de receita bruta)
  "3"   = Lucro Presumido
  "3.1" = Lucro Real
  "4"   = MEI
```

Preenchido por empresa (medido ao vivo, `sped.empresa`, 18 registros = matriz+filiais):

| Empresa (razão social) | regime_tributario | Regime |
|---|---|---|
| Jds Comércio | 3.1 | **Lucro Real** |
| Jht SP Comércio | 3.1 | **Lucro Real** |
| Cs Comércio | 3 | **Lucro Presumido** |
| Ijht Premium Car | 3 | **Lucro Presumido** |
| Jht DF Comércio | 3 | **Lucro Presumido** |
| JHT Brasília | 1 | **SIMPLES** |
| Jib DF Comércio | 1 | **SIMPLES** |
| Jmf Comércio | 1 | **SIMPLES** |
| Ks Comércio | 1 | **SIMPLES** |

Reforço cruzado: `sped.faturamento.simples` (Anexo 1 - Comércio) lista exatamente
as do Simples (JHT Brasília, Jib, Ks, Jmf, Cs aparece com anexo mas regime=3 →
atenção: confiar no `regime_tributario`, não só no anexo). `res.company` NÃO tem
campo de regime (inútil). `perfil_apuracao` (A/B/C) é o **Perfil do EFD ICMS-IPI**,
NÃO o regime , descartado.

### Caminho de construção (Fase 5)
1. **Sincronizar** `regime_tributario` (+ CNPJ/identidade) do `sped.empresa` para o
   cache (acrescentar campo no sync do modelo, ou um `dim_empresa_regime`/`fato`
   pequeno). O regime é por entidade legal (CNPJ); filiais herdam o da matriz.
2. **De-para CNPJ → regime** (raiz do CNPJ; o faturamento já é keyed pelo CNPJ
   emitente da nota via `empresaNome`/`empresaId` do fato).
3. **Tool `fiscal_faturamento_por_regime`**: cruza o faturamento canônico (camada
   já existente: `_itens-venda-grupo` / `receitaConsolidada`) com o regime por
   empresa, agrupa por regime (Real / Presumido / Simples / MEI), com nota honesta
   (eliminação intragrupo conforme já fazemos; regime é da empresa emitente).

**Atenção de correção:** distinguir **regime da empresa** (emitente) do faturamento.
A tool agrupa o faturamento pelas empresas e rotula cada empresa pelo seu regime.

## 4. Escopo recalibrado do milestone (honesto)
- **Frente A , Financeiro:** verificar (E2E real) + lacunas + descoberta. NÃO rebuild.
- **Frente B , Fase 5 regime:** build real (sync do regime + de-para + tool).
- **Bloqueado (fora):** DRE/lucro/EBITDA (contábil vazio na fonte).
