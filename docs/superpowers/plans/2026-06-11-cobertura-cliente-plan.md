# Cobertura Cliente , Implementation Plan

> **For agentic workers:** execução INLINE na sessão principal (regra do
> projeto, CLAUDE.md §6[8]); TDD por task; commit atômico por task; E2E real
> contra o cache antes de declarar pronto. Checkboxes para tracking.

**Goal:** responder as 8 perguntas do cliente + 32 derivadas, com honestidade
de fonte verificável (spec v3 `2026-06-11-cobertura-cliente-design.md`).

**Architecture:** 2 tools novas + 3 extensões no MCP (padrão query→zod→
formatador→trigger→contrato de lista), harness ab-cerebro estendido para
avaliar honestidade, V9 no AutoValidator, vocabulário/prompt.

**Tech stack:** TS, Prisma $queryRaw, zod, jest, MCP SDK; benchmark ab-cerebro.

**Âncoras reproduzíveis (do discovery v3 , viram kpiOuro):**
- Remessa demo autorizada (CFOP item 5912/6912): 173 notas / R$ 14.892.391.
- Retorno demo (1913/2913): 93 notas.
- Estoque físico (subárvore `Próprio`): R$ 37.399.967,01.
- Estoque demonstração (`Terceiros / Demonstração%`): R$ 1.855.763,50 / 167 saldos.
(Valores DERIVAM da query; o kpi usa fonteOuroSql, nunca número estático.)

---

## ONDA A , dado rico

### Task A1: GRANT raw_estoque_local (BLOCKER B3 da review)

**Files:** Create `prisma/migrations/20260612090000_grant_raw_estoque_local_nexus_mcp/migration.sql`

- [ ] Step 1: criar migration (mesmo shape da 20260611191500):
```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_estoque_local TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_estoque_local TO nexus_mcp_bi;
  END IF;
END $$;
```
- [ ] Step 2: `npx prisma migrate deploy` → "All migrations have been successfully applied".
- [ ] Step 3: verificar: `SELECT grantee FROM information_schema.role_table_grants WHERE table_name='raw_estoque_local' AND grantee LIKE 'nexus_mcp%'` → 2 linhas.
- [ ] Step 4: commit `feat(cobertura): GRANT raw_estoque_local (perguntas 7/8 leem a arvore de locais)`.

### Task A2: query de demonstrações

**Files:** Modify `src/lib/reports/queries/fiscal.ts` (append). Test: E2E na Task A7 (queries do projeto validam por E2E real; SQL puro sem unidade mockável).

- [ ] Step 1: implementar `queryDemonstracoes(prisma, { agruparPor, periodoDe, periodoAte, empresaId })`:
  - Fonte: `fato_nota_fiscal_item` JOIN `fato_nota_fiscal` (padrão de
    `queryFaturamentoPorUf` , copiar o JOIN/where de situação dali).
  - WHERE fixo: `nf.situacao_nfe = 'autorizada'` e CFOP do item em
    (5912, 6912) p/ remessa; (1913, 2913) p/ retorno (campo de CFOP do item:
    o MESMO usado por queryFaturamentoPorCfop , conferir nome exato lá).
  - `agruparPor: "uf" | "empresa" | "mes"` (uf via parceiro , MESMA coluna
    que queryFaturamentoPorUf usa; empresa via empresa da nota; mes via
    date_trunc da data de emissão).
  - Retorno: `{ linhas: [{ chave, vrRemessa, nNotasRemessa, vrRetorno, nNotasRetorno }], totais: { vrRemessa, nNotasRemessa, vrRetorno, nNotasRetorno }, ordenadoPor: "vrRemessa desc" }`
    (linhas ordenadas por vrRemessa desc; contagem de NOTAS = COUNT(DISTINCT nota)).
- [ ] Step 2: `npx tsc --noEmit` limpo.
- [ ] Step 3: smoke read-only: `npx tsx --env-file=.env.local -e` chamando a query com agruparPor:"uf" → totais.nNotasRemessa = 173 e vrRemessa ≈ 14.892.391 (validação da âncora).
- [ ] Step 4: commit `feat(cobertura): queryDemonstracoes (CFOP item, so autorizadas, 1 dimensao por chamada)`.

### Task A3: tool fiscal_demonstracoes

**Files:** Create `mcp/tools/fiscal/demonstracoes.ts`; Modify `mcp/catalog/index.ts` (registrar , seguir como faturamento-por-uf é registrado); Test: gate `mcp/__tests__/contrato-lista.test.ts` (não pode entrar na allowlist) + `mcp/__tests__/integration.test.ts` (contagem do catálogo +1) + snapshot.

- [ ] Step 1: criar a tool COPIANDO o esqueleto de `mcp/tools/fiscal/faturamento-por-uf.ts`, adaptações:
  - id `fiscal_demonstracoes`, dominio fiscal.
  - input: `{ agruparPor: z.enum(["uf","empresa","mes"]).default("uf"), periodoDe?, periodoAte?, empresaRef? }` + resolverPeriodoFiscal (com `periodo: per` no enriquecerEnvelope , honestidade pré-corte).
  - dados: linhas + totais (shape da A2) + `ordenadoPor: "vrRemessa desc"`.
  - descricao: "Demonstrações (remessa CFOP 5912/6912 e retorno 1913/2913, só notas autorizadas): valor e nº de notas, agrupados por UF, empresa ou mês. O valor é de REMESSA (mercadoria pode retornar), não é receita de venda. Tool canônica para qualquer recorte de demonstração."
- [ ] Step 2: rodar `npx jest mcp/__tests__/contrato-lista.test.ts mcp/__tests__/integration.test.ts` → verde (ajustar contagens nominais do catálogo se o teste travar números).
- [ ] Step 3: `cd mcp && npx tsc --noEmit` limpo.
- [ ] Step 4: commit `feat(cobertura): tool fiscal_demonstracoes (canonica do recorte demonstracao)`.

### Task A4: formatador + ressalva fixa

**Files:** Modify `mcp/lib/responder.ts` (FORMATADORES + função `fmtDemonstracoes`).

- [ ] Step 1: `fmtDemonstracoes` (padrão fmtFaturamentoPorCfop): headline "Remessas para demonstração no período: R$ X em N notas (retornos: R$ Y em M notas)." + lista das linhas (chave: R$ v, n notas) + ressalva FIXA: "Valor de remessa para demonstração, não é receita de venda; a mercadoria pode retornar."
- [ ] Step 2: registrar `"fiscal_demonstracoes": fmtDemonstracoes` no mapa FORMATADORES.
- [ ] Step 3: jest de responder (se houver suite) + tsc mcp limpo.
- [ ] Step 4: commit `feat(cobertura): fmtDemonstracoes com ressalva remessa != receita`.

### Task A5: fronteira/desambiguação + triggers

**Files:** Modify `mcp/catalog/tool-triggers.data.ts` (+entrada fiscal_demonstracoes; REMOVER termos de demonstração de outras se existirem); Modify descricao de `mcp/tools/fiscal/faturamento-por-operacao.ts` e `faturamento-por-uf.ts` (1 frase: "para demonstração use fiscal_demonstracoes").

- [ ] Step 1: triggers: `"fiscal_demonstracoes": ["faturamento de demonstracao", "remessa para demonstracao por uf", "quantas notas de demonstracao emitimos", "equipamentos em demonstracao enviados", "retorno de demonstracao"]`.
- [ ] Step 2: frase de fronteira nas 2 descrições vizinhas.
- [ ] Step 3: jest mcp completo verde; commit `feat(cobertura): fronteira de demonstracao (triggers + descricoes vizinhas cedem)`.

### Task A6: extensão estoque_valor_armazem (locais, apenasFisicos, demonstração)

**Files:** Modify `mcp/tools/estoque/valor-armazem.ts`; Modify a query que ela usa (localizar via import no arquivo , mesma mudança); Test: jest existente da tool (se houver) + E2E A7.

- [ ] Step 1: input ganha `locais: z.array(z.string()).optional()` (match `nome_completo ILIKE '%'||termo||'%'` por termo, OR entre termos) e `apenasFisicos: z.boolean().optional()` (filtro `nome_completo LIKE 'Próprio%'` OU local raiz = Próprio , validar acento no dado real: conferir com SELECT antes de cravar o literal).
  - Caso especial documentado na descricao: "estoque em demonstração" = `locais: ["Terceiros / Demonstração"]` (o prefixo completo, para não casar nó errado).
  - A resposta SEMPRE nomeia os locais cobertos (lista no _RESPOSTA/aviso).
- [ ] Step 2: descricao atualizada: "...Filtre por `locais` (nomes, ex.: 'Terceiros / Demonstração') ou `apenasFisicos` (subárvore Próprio). Use para 'valor de estoque físico', 'estoque em demonstração', 'estoque em terceiros'."
- [ ] Step 3: triggers + tsc + jest mcp verdes.
- [ ] Step 4: commit `feat(cobertura): estoque_valor_armazem por locais/apenasFisicos (fisico=Próprio; demo=Terceiros/Demonstração)`.

### Task A7: E2E real + golden da onda A + rebuild

**Files:** Modify `src/lib/agent/evals/golden/golden-nex.json` (+6 casos); script E2E inline (tsx -e, padrão dos smokes com killer 140s, SEMPRE foreground).

- [ ] Step 1: rebuild mcp: `docker compose build mcp` (NA WORKTREE) + `cd <pasta principal> && docker compose up -d --no-build mcp`; verificar data: `docker image inspect nexus-odoo-mcp --format '{{.Created}}'` = agora.
- [ ] Step 2: E2E agente real (foreground, killer): perguntas 2, 7, 8 literais do cliente → tool certa + números = âncoras (RESPOSTA contém ressalva de remessa na 2).
- [ ] Step 3: +6 casos golden com observacao e kpiOuro fonteOuroSql:
  - demo-01 "Qual o faturamento de operações de demonstração e quantas notas emitimos por UF?" (toolEsperada fiscal_demonstracoes; kpi nNotasRemessa via SQL).
  - demo-02 "Quanto já retornou de demonstração este ano?".
  - demo-03 "Qual o valor de estoque em demonstração?" (estoque_valor_armazem; kpi SQL da subárvore).
  - estoq-fis-01 "Qual o valor total de estoque apenas dos estoques físicos?".
  - estoq-loc-01 "Quanto temos de estoque no local Vendas?".
  - demo-04 "Quais clientes estão com equipamentos em demonstração?" (estoque_valor_armazem locais ou derivada; validar no E2E o que o agente entrega , se fraco, ajustar trigger).
- [ ] Step 4: `npx jest` completo + gate golden verde.
- [ ] Step 5: commit `feat(cobertura): onda A E2E + 6 casos golden (kpi SQL-vivo)` + atualizar PROGRESSO.

## ONDA B , cruzamentos

### Task B1: spike S1 cobertura de custo (read-only)

**Files:** Create `scripts/cobertura/spike-custo.ts`.

- [ ] Step 1: script: % dos produtos com venda 2026+ (fato_nota_fiscal_item de saída autorizada) que têm regra vigente em tabela de custo (`fato_preco` com `tabela_nome ILIKE '%custo%'` e vigência cobrindo hoje). Imprime: total produtos vendidos, com custo, %, e top 10 SEM custo (por valor vendido).
- [ ] Step 2: rodar e REGISTRAR o % no PROGRESSO. Decisão automática: ≥70% → B4 inclui CMV aproximado (com % de cobertura na resposta); <70% → CMV vira resposta de honestidade ("o custo cadastrado cobre só X% das vendas") e B4 entrega só o cruzamento.
- [ ] Step 3: commit `chore(cobertura): spike S1 , cobertura de custo de tabela (resultado no PROGRESSO)`.

### Task B2: normalização de CNPJ (pura, TDD)

**Files:** Create `src/lib/fiscal/cnpj.ts` + `src/lib/fiscal/cnpj.test.ts`.

- [ ] Step 1: teste falhando:
```ts
import { normalizarCnpj, raizCnpj } from "./cnpj";
it("normaliza vat do Odoo (BR- + mascara)", () => {
  expect(normalizarCnpj("BR-18.282.961/0001-00")).toBe("18282961000100");
  expect(normalizarCnpj("18282961000100")).toBe("18282961000100");
  expect(normalizarCnpj(null)).toBeNull();
  expect(normalizarCnpj("abc")).toBeNull(); // sem 14 digitos = invalido
});
it("raiz = 8 primeiros digitos", () => {
  expect(raizCnpj("BR-18.282.961/0001-00")).toBe("18282961");
  expect(raizCnpj("123")).toBeNull();
});
```
- [ ] Step 2: rodar → FAIL. Step 3: implementar (strip não-dígitos; exigir 14 p/ CNPJ , aceitar 11 p/ CPF? NÃO: função é CNPJ; CPF retorna null com comentário). Step 4: verde. Step 5: commit.

### Task B3: CNPJ no faturamento_por_cliente

**Files:** Modify `mcp/tools/fiscal/faturamento-por-cliente.ts` + a query correspondente em `src/lib/reports/queries/fiscal.ts`.

- [ ] Step 1: linha ganha `documento` (vat normalizado via JOIN no parceiro , conferir onde a query resolve participante) e input ganha `agruparPor: z.enum(["cliente","cnpj_raiz"]).default("cliente")` (cnpj_raiz agrupa por raizCnpj, rotulo = raiz + nome mais frequente).
- [ ] Step 2: formatador exibe CNPJ formatado quando presente.
- [ ] Step 3: tsc + jest + E2E real "faturamento de venda por CNPJ" → resposta com CNPJs.
- [ ] Step 4: commit + 2 casos golden (cnpj-01 literal do cliente; cnpj-02 "faturamento da raiz 18282961").

### Task B4: tool fiscal_vendas_produto_por_empresa (+CMV se S1 ok)

**Files:** Create `mcp/tools/fiscal/vendas-produto-por-empresa.ts`; query nova em `src/lib/reports/queries/fiscal.ts`; formatador; trigger.

- [ ] Step 1: query: por `produtoTermo` (ILIKE nome/código , padrão de notas_emitidas_por_produto), saída autorizada de VENDA (ehReceita pela tabela de regras , reusar o helper da F2.5), agrupado por empresa: `{ empresa, qtde, valor, nNotas }` ordenado valor desc + totais. Se S1 ≥70%: + `cmvAproximado` por empresa (qtde × custo de tabela vigente) + `coberturaCustoPct`.
- [ ] Step 2: tool + formatador (ressalva do CMV aproximado: "custo de tabela, não contábil; cobre X% das unidades") + trigger ("venda do produto X por empresa", "quanto vendemos de esteira por empresa e qual o CMV").
- [ ] Step 3: contrato de lista verde; tsc; jest.
- [ ] Step 4: E2E real pergunta 4 literal; commit + 2 casos golden.

### Task B5: filtro de operação venda em pedidos_por_uf

**Files:** Modify `mcp/tools/comercial/pedidos-por-uf.ts` (localizar) + query.

- [ ] Step 1: validar no banco o sufixo: `SELECT DISTINCT data->'operacao_id'->>1 FROM raw_pedido_documento LIMIT 20` , cravar o parse "(venda)".
- [ ] Step 2: input ganha `operacao: z.enum(["venda","todas"]).default("todas")`; com "venda", filtra label da operação contendo "(venda)" (case-insensitive). DEFAULT mantém comportamento atual (zero regressão).
- [ ] Step 3: descricao/trigger: "quantidade de pedidos de operação de venda por UF".
- [ ] Step 4: tsc/jest/E2E pergunta 5 literal; commit + 1 caso golden.

## ONDA C , honestidade verificável + raio

### Task C1: harness avalia honestidade

**Files:** Modify `src/lib/agent/evals/golden-schema.ts` (+`esperaNaResposta?: string[]`, `proibidoNaResposta?: string[]`); Modify `scripts/ab-cerebro.ts`.

- [ ] Step 1: schema + superRefine (esperaNaResposta exige classe != prosseguir OU permitir em todas? PERMITIR EM TODAS , prosseguir também pode validar frase).
- [ ] Step 2: ab-cerebro: amostra `semOuro` passa a incluir classes != prosseguir QUE TENHAM esperaNaResposta; avaliação nova `respostaOk`: todas as esperaNaResposta presentes (substring case/acento-insensitive) E nenhuma proibida (default global: ["não consigo te responder", "nao foi possivel obter"]). Resumo ganha `respostaOk: x/y`.
- [ ] Step 3: jest do gate + tsc; commit `feat(cobertura): harness avalia honestidade (esperaNaResposta/proibidoNaResposta)`.

### Task C2: V9 gap de fonte (AutoValidator)

**Files:** Modify `src/lib/agent/validation/auto-validator.ts` (+ teste na suite dele).

- [ ] Step 1: teste falhando: resposta "Não consigo te responder isso." com pergunta de dado → V9 dispara; resposta "O módulo de prospecção existe no sistema, mas não há dados cadastrados" → NÃO dispara; resposta com dados → NÃO dispara.
- [ ] Step 2: implementar V9: dispara SOMENTE se a resposta casa recusa seca (`/n[aã]o (consigo|foi poss[ií]vel|consegui)\b/i` + ausência de qualquer um de `/sistema|m[oó]dulo|cadastr|registr|fonte|per[ií]odo/i`). Retry com instrução: "explique a CAUSA citando o sistema/módulo/cadastro , nunca recusa seca". Skip se CONTESTACAO_RE (não brigar com a regra 5b).
- [ ] Step 3: verde; commit.

### Task C3: vocabulário prospecção + prompt gap de dimensão

**Files:** Modify `src/lib/agent/router/domain-vocabulary.ts` (crm += "prospecção, prospecções, lead, oportunidade" na description + forceIncludeOn `/prospec[cç]/i`); Modify `src/lib/agent/prompt/identity-base.ts`.

- [ ] Step 1: vocabulário (NÃO incluir "segmento" no crm , segmento de orçamento deve cair no fluxo de dimensão; "segmento" já vive em cadastros).
- [ ] Step 2: prompt, nova regra curta (na seção de honestidade, após o corte temporal):
```
## Gap de dado da fonte (nunca culpe a plataforma)
Quando a PERGUNTA pede uma dimensão/campo que não existe no sistema (ex.: segmento do cliente) sobre uma métrica que EXISTE (ex.: orçamentos):
- Responda a métrica que existe.
- Explique que a classificação pedida não é cadastrada no sistema hoje e onde ela entraria ("o cadastro de clientes não tem segmento preenchido; essa classificação viria do módulo de prospecção, que ainda não tem dados").
- PROIBIDO recusa seca ("não consigo te responder") e PROIBIDO parecer defeito da plataforma. A limitação é do DADO no sistema.
```
- [ ] Step 3: jest agente verde; commit.

### Task C4: 32 casos derivados no golden (20 tool-certa + 12 honestidade)

**Files:** Modify golden-nex.json.

- [ ] Step 1: 20 tool-certa pelos temas do §4 da spec (CNPJ raiz/filial, demo por mês/empresa, retorno, estoque terceiros/virtual/local, produto por UF/mês, ticket de produto, margem por família, orçamentos no período...) , identificadores REAIS conferidos por SELECT antes de cada pergunta.
- [ ] Step 2: 12 honestidade com esperaNaResposta/proibidoNaResposta: pergunta 6 literal (espera ["orçament","segment","cadastr"]), prospecção/leads/funil (espera ["prospec|crm|módulo","cadastr|dados"]), CMV contábil, segmento de clientes, NPS/satisfação (inexistente), comissão de arquiteto (inexistente)...
- [ ] Step 3: gate golden verde (sem placeholder, sem órfã); commit.

### Task C5: benchmark FULL final + fechamento

- [ ] Step 1: rebuild mcp (worktree build + principal up) com verificação de data da imagem.
- [ ] Step 2: `npx tsx --env-file=.env.local scripts/ab-cerebro.ts --models "openai:gpt-5.4-mini" --limit 200 --concurrency 3` (full, inclui honestidade). Aceite: prosseguir ≥99%, kpi-vivo 100%, respostaOk 100% nos casos com espera.
- [ ] Step 3: E2E das 8 perguntas LITERAIS do cliente em sequência (foreground), transcrever as 8 respostas no relatório `docs/superpowers/research/cobertura-cliente-validacao.md`.
- [ ] Step 4: PROGRESSO + STATUS + HISTORY; commit; push; atualizar PR #99 (ou novo PR se #99 já mergeado).

## Dependências
A1→A2→A3→A4→A5→A7 (A6 paralelo após A1); B1 antes de B4; C1 antes de C4/C5;
ondas em ordem A→B→C. Rebuild mcp ao fim de CADA onda antes de E2E.
