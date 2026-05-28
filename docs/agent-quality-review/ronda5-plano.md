# Ronda 5 — Plano detalhado (rumo a 97-98%)

**Princípio:** TUDO ADITIVO. Nenhuma tool existente, nenhuma regra do prompt já em uso, nenhuma coluna do schema é tocada. Só **adicionar**.

---

## Perícia (concluída antes do plano)

| Item | Fonte de dados disponível | Viabilidade |
|---|---|---|
| Filiais do grupo | `raw_res_company` (20 empresas) + `fato_nota_fiscal.empresa_id/nome` | ✅ |
| Famílias de produto | `fato_produto.familia_nome` (8 famílias, 94% cobertura, índice já existe) | ✅ |
| Tempo médio fechamento | `fato_pedido.data_aprovacao - data_orcamento` em 1056 pedidos concluídos. Média atual ~6 dias | ✅ |
| Notas para cliente X | `fato_nota_fiscal.participante_nome` (indexado) | ✅ |
| Notas do produto X | JOIN `fato_nota_fiscal x fato_nota_fiscal_item.produto_id` | ✅ |
| Pedidos do vendedor X | `fato_pedido.vendedor_nome` | ✅ |
| Parceiros sem documento | `fato_parceiro WHERE documento IS NULL OR ''` | ✅ |
| Pedido sem nota emitida | `fato_nota_fiscal` tem `numero` mas SEM `pedido_id` — precisa investigar mais | ⚠️ Risco médio |
| Lacuna prematura proibida (regra prompt) | nova seção em `identity-base.ts` | ✅ trivial |

---

## TASKS detalhadas

### Task R5.01 — Tabela `dim_empresa_grupo` (canônica do grupo Matrix)

**Por quê:** "Quantas filiais temos?" exige distinguir empresas do grupo das que não são. `raw_res_company` tem 20 entradas — algumas não são Matrix (ex: "FIT EXPRESS TRANSPORTE", "XXX - Inativa").

**Arquivos novos:**
- `prisma/migrations/20260528020000_dim_empresa_grupo/migration.sql`
- `prisma/schema.prisma` — model `DimEmpresaGrupo` (aditivo)

**Schema:**
```sql
CREATE TABLE dim_empresa_grupo (
  odoo_id integer PRIMARY KEY,
  nome text NOT NULL,
  cnpj text,
  tipo text CHECK (tipo IN ('matriz','filial')),
  uf text,
  ativo boolean DEFAULT true,
  atualizado_em timestamp(3) DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dim_empresa_grupo_tipo_idx ON dim_empresa_grupo(tipo);
CREATE INDEX dim_empresa_grupo_uf_idx ON dim_empresa_grupo(uf);
```

**Seed inicial via SQL (das 16 empresas que efetivamente emitiram notas + as 4 sem notas mas no grupo):**
Vou popular extraindo nome/CNPJ/UF do próprio nome (padrão "Nome - Matriz/Filial UF CNPJ"). Inclui as 5 Matriz, 11 Filial; exclui "FIT EXPRESS" (não-grupo) e "XXX - Inativa". Total esperado: 18 empresas.

**Validação interna:**
- `SELECT COUNT(*) FROM dim_empresa_grupo` = 18
- `SELECT tipo, COUNT(*) FROM dim_empresa_grupo GROUP BY tipo` = `matriz=5, filial=13`
- `SELECT uf, COUNT(*) FROM dim_empresa_grupo GROUP BY uf` cobertura geográfica
- Cruzar `dim_empresa_grupo.cnpj` com `fato_nota_fiscal.empresa_id` → 100% das empresas com notas estão na dim

**Risco de regressão:** ZERO. Tabela nova, não afeta nada.

---

### Task R5.02 — Tool `cadastro_filiais_listar` (lista empresas do grupo)

**Resolve:** "Quantas filiais temos?", "Quais empresas do grupo?", "Filiais em SP", "Tem matriz no DF?"

**Arquivos novos:**
- `mcp/tools/cadastros/filiais-listar.ts`
- Registro em `mcp/tools/cadastros/index.ts` (aditivo)

**Input schema:**
- `tipo?: "matriz" | "filial" | "todas"` — default "todas"
- `uf?: string` — opcional, filtra por estado
- `limite?: number` — default 30

**Output:** `_RESPOSTA` tipo "5 matrizes + 13 filiais = 18 empresas do grupo. Top UF: DF (10). Listando 18."

**Validação interna:**
- Sem filtro: 18 empresas
- `tipo=matriz`: 5
- `uf=DF`: contagem coerente

**Risco:** ZERO — tool nova, índice de catálogo aditivo.

---

### Task R5.03 — Tool `fiscal_notas_emitidas_por_cliente` (filtro cliente)

**Resolve:** "Notas emitidas para Smartfit Alphaville", "NF do cliente X".

**Opções:**
- (A) Tool nova dedicada — recomendado, não toca a existente
- (B) Adicionar param `clienteTermo` em `fiscal_notas_emitidas` — **MEXE no que funciona, descartado**

**Vou pela (A)** pra zero risco.

**Arquivos novos:**
- `mcp/tools/fiscal/notas-emitidas-por-cliente.ts`
- Registro em `mcp/tools/fiscal/index.ts` (aditivo)

**Input:**
- `clienteTermo: string` (obrigatório, min 2 chars úteis)
- `periodoDe?`, `periodoAte?`, `periodoNome?` (mesma convenção de outras)
- `situacaoNfe?`, `limite?`

**Output:** total notas + valor + amostra (30) + top filial do cliente (se aparecer em mais de uma UF).

**Validação:** "Smartfit" deve casar com vários cadastros (cliente tem várias filiais) — esperado dezenas de notas. SQL direto confere.

**Risco:** ZERO.

---

### Task R5.04 — Tool `fiscal_notas_emitidas_por_produto`

**Resolve:** "quantas notas saíram do produto 102 esse mês".

**Arquivos:** `mcp/tools/fiscal/notas-emitidas-por-produto.ts` + registro.

**Input:** `produtoTermo` (nome/código), `periodoNome`/`periodoDe`/`periodoAte`.

**Query:** JOIN `fato_nota_fiscal_item.produto_id` → `fato_produto` + agregação por nota.

**Validação:** produto [102] deve casar com notas reais, SQL direto.

**Risco:** ZERO.

---

### Task R5.05 — Tool `comercial_pedidos_por_vendedor_filtrado`

**Resolve:** "Pedidos do vendedor João".

**Opções:**
- (A) Tool nova
- (B) Adicionar `vendedorTermo` em `comercial_pedidos_listar_top_valor` existente — já tem `clienteTermo`, símile. Mas MEXE no que funciona.

Recomendo **(B) só se você autorizar**, porque a tool existente já é parametrizada e a adição é só mais um campo opcional. Sem isso, vai por **(A)**: nova tool dedicada que aceita `vendedorTermo`.

**Vou esperar tua decisão sobre A ou B aqui.** Default seguro: A.

---

### Task R5.06 — Tool `comercial_tempo_medio_fechamento`

**Resolve:** "Tempo médio de fechamento do pedido".

**Definição:** `dataAprovacao - dataOrcamento` em dias, sobre pedidos com `etapaFinaliza=true` (mesmos 1056 já validados, média atual 6 dias).

**Arquivos:** `mcp/tools/comercial/tempo-medio-fechamento.ts` + registro.

**Input:** `periodoDe?`, `periodoAte?`, `periodoNome?` (default `mes_corrente`).

**Output:** média, mediana, mínimo, máximo, total amostra.

**Validação:** SQL direto vs tool.

**Risco:** ZERO.

---

### Task R5.07 — Tool `comercial_pedidos_sem_nota`

**Status:** ⚠️ Precisa MAIS investigação antes de codar.

**Problema:** `fato_nota_fiscal` tem `numero` mas não tem `pedido_id` direto. JOIN possível pode ser:
- por `participante_id` + janela de data + valor próximo → impreciso
- por algum campo de origem no XML → exige discovery

**Proposta:** **fase de investigação separada** antes de implementar. Não bloqueia as outras 8 tasks.

**Risco se implementar mal:** retornar números errados — pior que não responder. **Adio até confirmar JOIN seguro.**

---

### Task R5.08 — Tool `comercial_produtos_por_familia`

**Resolve:** filtragem por família ("Acessórios", "Life Fitness", "Astec", etc).

**Arquivos:** `mcp/tools/comercial/produtos-por-familia.ts` + registro.

**Input:**
- `familiaTermo?`: filtro por nome de família (case-insensitive)
- `limite?`: default 30

**Output:**
- Sem `familiaTermo`: agrupado por família com contagem (ex: "8 famílias: ACESSÓRIOS=1214, LIFE FITNESS=758, ...")
- Com `familiaTermo`: lista produtos da família

**Validação:** total por família bate com SQL direto.

**Risco:** ZERO.

---

### Task R5.09 — Tool `cadastro_parceiros_sem_documento`

**Resolve:** "Parceiros sem documento cadastrado".

**Arquivos:** `mcp/tools/cadastros/parceiros-sem-documento.ts` + registro.

**Input:** `tipo?: "cliente" | "fornecedor" | "todos"`, `limite?`.

**Query:** `WHERE ativo=true AND (documento IS NULL OR documento = '')`.

**Validação:** SQL direto.

**Risco:** ZERO.

---

### Task R5.10 — Regra prompt: "PROIBIDO lacuna após tool factual"

**Resolve:** o único ERRADO real da R23 (#7 "Está vencendo título essa semana?" — agente chamou `financeiro_titulos_vencidos` E `registrar_lacuna` no mesmo turno).

**Arquivo:** `src/lib/agent/prompt/identity-base.ts` — **SÓ ADICIONA seção nova**, não edita as existentes.

**Texto exato a adicionar (separado, não mistura com regras existentes):**

> ## REGRA CRÍTICA: lacuna prematura é PROIBIDA
>
> Se você JÁ CHAMOU uma tool de domínio (financeiro_*, fiscal_*, estoque_*, comercial_*, contábil_*, cadastro_*) neste turno, NUNCA chame `registrar_lacuna` em seguida.
>
> A tool factual já te entregou dados. Use o `_RESPOSTA` / `_DESTAQUE` / linhas dela.
>
> Se a tool factual retornou vazio, aplique §10b ("Não há X no período"). Se retornou dados mas você precisa de mais filtros, AGREGUE o que tem — não declare lacuna.

**Validação:** estática (revisar texto). E-2-E só com R24.

**Risco:** prompt aditivo. Como é regra nova específica, não pode conflitar com regras existentes. **Vou ler todas as regras §X atuais antes de inserir pra garantir não-contradição.**

---

## Fase de TESTES INTERNOS (antes de R24)

Vou estender `scripts/quality-audit/validate-novas-tools.ts` com seção pras 8 tools novas (sem contar R5.07 que adia, e R5.10 que é prompt). Cada tool testada com:

1. Sem input (default) — devolve `estado=ok` ou `vazio` válido
2. 2-3 inputs reais que devem casar (ex: `Smartfit` em notas_por_cliente)
3. 1 input que deve voltar vazio (ex: cliente inexistente) → `_RESPOSTA` cita "Não há"
4. **Cruzamento numérico com SQL direto** (mesma técnica do `validate-novas-tools.ts`)

Também rodo:
- `npx tsc --noEmit`
- `npx jest mcp/__tests__/integration.test.ts` (atualizando counts)
- `npx tsx scripts/quality-audit/tool-smoke-test.ts`

Tudo verde → reportar resultados → aguardar tua autorização pra R24.

---

## Resumo executivo

| Task | O que entrega | Risco regressão |
|---|---|---|
| R5.01 + R5.02 | Filiais do grupo + tool listar | ZERO (tudo novo) |
| R5.03 | Notas emitidas por cliente | ZERO (tool nova) |
| R5.04 | Notas emitidas por produto | ZERO (tool nova) |
| R5.05 | Pedidos por vendedor (opção A nova tool) | ZERO |
| R5.06 | Tempo médio fechamento | ZERO |
| R5.07 | Pedidos sem nota | ⚠️ adiar, investigação primeiro |
| R5.08 | Produtos por família | ZERO |
| R5.09 | Parceiros sem documento | ZERO |
| R5.10 | Regra prompt anti-lacuna prematura | BAIXO — seção nova, não toca as existentes |

**Tempo estimado total: ~4h.**

**Projeção pós-Ronda 5 (R24):** 96-98%.

**Aguardando autorização explícita para:**
1. Implementar 8 tasks (R5.01 a R5.06, R5.08, R5.09) + regra prompt (R5.10)
2. R5.07 — concordar em adiar pra fase separada
3. Decisão R5.05: opção A (tool nova, zero risco) ou B (estende a existente)
