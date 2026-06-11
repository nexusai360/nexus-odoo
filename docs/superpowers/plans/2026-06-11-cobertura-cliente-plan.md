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

**Âncoras reproduzíveis (CORRIGIDAS na review #1 do plano , viram kpiOuro):**
- Remessa demo (CFOP item 5912/6912) **COM situacao_nfe='autorizada'**:
  **89 notas / R$ 6.347.354** (vr_produtos). Decisão de produto: rascunho/
  cancelada/denegada NUNCA contam (sem filtro seria 172/R$14,89mi , números
  da spec v3 estavam SEM o filtro que a própria spec exige; corrigidos aqui).
- Retorno demo (1913/2913) autorizada: **40 notas**.
- Estoque físico (subárvore `Próprio` , com acento, confirmado): R$ 37.399.967,01 (34 locais).
- Estoque demonstração (`Terceiros / Demonstração%`): R$ 1.855.763,50 / 167 saldos (112 locais).
(Valores DERIVAM da query; o kpi usa fonteOuroSql, nunca número estático.)

**Fatos de schema cravados pelas reviews (o executor NÃO re-descobre):**
- A coluna de UF É `fato_parceiro.uf`; JOIN `LEFT JOIN fato_parceiro p ON p.odoo_id = nf.participante_id` (padrão inline em `mcp/tools/fiscal/faturamento-por-uf.ts:76-86`).
- `fato_nota_fiscal_item` é DESNORMALIZADO (tem situacao_nfe, data_emissao, entrada_saida, empresa_id) , JOIN ao cabeçalho SÓ para UF/empresa_nome, chave `i.documento_id = nf.odoo_id` (nunca nf.id).
- NÃO existem funções queryFaturamentoPorUf/PorCfop em queries/fiscal.ts , a lógica vive INLINE nas tools `mcp/tools/fiscal/faturamento-por-{uf,cfop}.ts`. Padrão a seguir: query inline na tool.
- A árvore de locais vive em `raw_estoque_local.data->>'nome_completo'` (JSONB); `fato_estoque_saldo.localNome` é nome LIMPO sem hierarquia , filtros de árvore exigem JOIN `fato_estoque_saldo → raw_estoque_local` (identificar a coluna de id do local no fato no Step próprio).
- O snapshot `src/lib/mcp-catalog-snapshot.json` SÓ atualiza via `npm run gen:mcp-catalog` , obrigatório após CADA tool nova, ANTES de caso golden que a referencie (gate de tool órfã).

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

### Task A2: query de demonstrações (INLINE na tool , padrão do projeto)

**Files:** a query nasce DENTRO de `mcp/tools/fiscal/demonstracoes.ts` (Task A3), seguindo o padrão inline de `mcp/tools/fiscal/faturamento-por-uf.ts`. Esta task define e valida o SQL isoladamente.

- [ ] Step 1: escrever o SQL (validar via psql antes de codar):
  - Fonte: `fato_nota_fiscal_item i` (desnormalizado: usa `i.situacao_nfe`,
    `i.data_emissao` direto). JOIN ao cabeçalho SÓ quando agruparPor exige:
    `JOIN fato_nota_fiscal nf ON i.documento_id = nf.odoo_id` + p/ UF:
    `LEFT JOIN fato_parceiro p ON p.odoo_id = nf.participante_id` (coluna `p.uf`).
  - WHERE fixo: `i.situacao_nfe = 'autorizada'` E CFOP do item (conferir o
    nome exato da coluna de CFOP em faturamento-por-cfop.ts , step 1a:
    transcrever o nome aqui antes de codar) em ('5912','6912') p/ remessa,
    ('1913','2913') p/ retorno (CASE p/ separar as somas na mesma passada).
  - agruparPor uf|empresa|mes (mes = date_trunc('month', i.data_emissao)).
  - Contagem de NOTAS = COUNT(DISTINCT i.documento_id) por classe.
- [ ] Step 2: validar âncora no psql: total remessa = **89 notas / R$ 6.347.354** e retorno = **40 notas** (sem período). Se divergir, PARAR e reconciliar com a review #1 antes de seguir.
- [ ] Step 3: registrar o SQL validado no PROGRESSO (vira fonteOuroSql dos kpis).

### Task A3: tool fiscal_demonstracoes

**Files:** Create `mcp/tools/fiscal/demonstracoes.ts`; Modify `mcp/catalog/index.ts` (registrar , seguir como faturamento-por-uf é registrado); Test: gate `mcp/__tests__/contrato-lista.test.ts` (não pode entrar na allowlist) + `mcp/__tests__/integration.test.ts` (contagem do catálogo +1) + snapshot.

- [ ] Step 1: criar a tool COPIANDO o esqueleto de `mcp/tools/fiscal/faturamento-por-uf.ts` (query INLINE da A2), adaptações:
  - id `fiscal_demonstracoes`, dominio fiscal.
  - input: `{ agruparPor: z.enum(["uf","empresa","mes"]).default("uf"), periodoDe?, periodoAte?, empresaRef? }` + resolverPeriodoFiscal (com `periodo: per` no enriquecerEnvelope , honestidade pré-corte).
  - dados: linhas + totais (shape da A2) + `ordenadoPor: "vrRemessa desc"`.
  - descricao (é o texto EMBEDDADO pelo router , precisa carregar o vocabulário de recuperação, review #2 M1): "Demonstrações de equipamentos (remessa para demonstração, CFOP 5912/6912, e retorno de demonstração, 1913/2913; só notas autorizadas): valor e número de notas fiscais emitidas, agrupados por UF, empresa ou mês. Use para 'faturamento de demonstração', 'remessas para demonstração', 'notas de demonstração por estado', 'quanto retornou de demonstração'. O valor é de REMESSA (mercadoria pode retornar), não é receita de venda. Tool canônica para qualquer recorte de demonstração."
- [ ] Step 2 (contagens nominais , review #2 B2, edições EXPLÍCITAS em `mcp/__tests__/integration.test.ts`): adicionar `"fiscal_demonstracoes"` ao array `FISCAL_IDS` (~linha 153); incrementar `toHaveLength`/igualdades: 107→108 (linhas ~255/258/295/303/626) e 116→117 (linha ~281). Rodar o teste para achar qualquer asserção extra que trave.
- [ ] Step 3: `npm run gen:mcp-catalog` + conferir que o snapshot ganhou a tool (grep fiscal_demonstracoes src/lib/mcp-catalog-snapshot.json) , OBRIGATÓRIO antes de qualquer caso golden (review #2 B1).
- [ ] Step 4: `npx jest mcp/__tests__/contrato-lista.test.ts mcp/__tests__/integration.test.ts` verde; `cd mcp && npx tsc --noEmit` limpo.
- [ ] Step 5: probe de roteamento (review #2 M1): tsx one-shot com embedQuestion("faturamento de operações de demonstração por UF") + getToolVectors + pickTools → fiscal_demonstracoes presente na oferta. Se ausente, enriquecer a descricao e re-testar.
- [ ] Step 6: commit `feat(cobertura): tool fiscal_demonstracoes (canonica do recorte demonstracao) + snapshot + contagens`.

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

**DEPENDE DE A1 (GRANT) , o filtro de árvore lê raw_estoque_local.**

- [ ] Step 0 (schema do JOIN, resultado transcrito aqui antes de codar):
  identificar a coluna de id do local em `fato_estoque_saldo`
  (`docker exec ... psql -c "\\d fato_estoque_saldo"`) e validar o JOIN:
  `fato_estoque_saldo s JOIN raw_estoque_local l ON l.odoo_id = s.<coluna>`
  com a âncora: subárvore físico
  `l.data->>'nome_completo' LIKE 'Próprio%'` (acento CONFIRMADO) →
  R$ 37.399.967,01; demo `LIKE 'Terceiros / Demonstração%'` →
  R$ 1.855.763,50 / 167 saldos. Se a coluna de id não existir no fato,
  PARAR: o caminho vira match por localNome limpo (registrar a limitação e
  reconciliar âncora antes de codar).
- [ ] Step 1: input ganha `locais: z.array(z.string()).optional()` (match
  `l.data->>'nome_completo' ILIKE termo||'%'` , PREFIXO, não substring, para
  não casar nó errado; OR entre termos) e `apenasFisicos: z.boolean().optional()`
  (prefixo `Próprio`). A query da tool ganha o JOIN do Step 0 (lazy: só
  quando locais/apenasFisicos vierem , sem custo no caminho atual).
  - Caso documentado na descricao: "estoque em demonstração" =
    `locais: ["Terceiros / Demonstração"]`.
  - A resposta SEMPRE nomeia os locais cobertos (lista no _RESPOSTA/aviso).
- [ ] Step 2: descricao atualizada (texto embeddado, com vocabulário): "...Filtre por `locais` (prefixo da árvore, ex.: 'Terceiros / Demonstração') ou `apenasFisicos` (subárvore Próprio). Use para 'valor de estoque físico', 'estoque em demonstração', 'estoque em poder de terceiros', 'estoque no local X'."
- [ ] Step 3: triggers + tsc + jest mcp verdes; smoke psql das 2 âncoras via tool (tsx chamando o handler com ctx.prisma).
- [ ] Step 4: commit `feat(cobertura): estoque_valor_armazem por locais/apenasFisicos (arvore via raw_estoque_local; fisico=Próprio; demo=Terceiros/Demonstração)`.

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

- [ ] Step 0: `SELECT DISTINCT tabela_nome FROM fato_preco` , transcrever quais são as tabelas de CUSTO reais (não presumir que o rótulo contém "custo"; o discovery viu "Custo Smart /0,95", validar o conjunto completo e cravar a lista/critério).
- [ ] Step 1: script: % dos produtos com venda 2026+ (fato_nota_fiscal_item de saída autorizada) que têm regra vigente nas tabelas de custo do Step 0 (vigência cobrindo hoje). Imprime: total produtos vendidos, com custo, %, e top 10 SEM custo (por valor vendido).
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
- [ ] Step 2: tool + formatador (ressalva do CMV aproximado: "custo de tabela, não contábil; cobre X% das unidades") + trigger ("venda do produto X por empresa", "quanto vendemos de esteira por empresa e qual o CMV"); descricao carrega o vocabulário (embeddada).
- [ ] Step 3: contagens nominais (mesmas edições da A3 Step 2: FISCAL_IDS + 108→109, 117→118) + `npm run gen:mcp-catalog` + contrato de lista verde; tsc; jest.
- [ ] Step 4: rebuild mcp (build na worktree + up na principal + data da imagem) , a query vive em src/lib/reports/queries/** que o container mcp consome.
- [ ] Step 5: E2E real pergunta 4 literal; commit + 2 casos golden.

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
- [ ] Step 2: ab-cerebro: casos com `esperaNaResposta` viram **inclusão OBRIGATÓRIA na amostra** (mesma regra do comOuro , NUNCA no round-robin do resto; review #2 M3, senão o aceite é não-determinístico); avaliação nova `respostaOk`: todas as esperaNaResposta presentes (substring case/acento-insensitive) E nenhuma proibida (default global: ["não consigo te responder", "nao foi possivel obter"]). Resumo ganha `respostaOk: x/y`.
- [ ] Step 3: rodar `npx jest src/lib/agent/evals/golden/golden-gate.test.ts` (o gate do RAIZ parseia o golden com o schema novo , precisa ficar verde) + tsc; commit `feat(cobertura): harness avalia honestidade (esperaNaResposta/proibidoNaResposta, inclusao obrigatoria)`.

### Task C2: V9 gap de fonte (AutoValidator)

**Files:** Modify `src/lib/agent/validation/auto-validator.ts` (+ teste na suite dele).

- [ ] Step 1: teste falhando com 4 casos (o 4º protege a regressão histórica do papagaio , review #2 M2): (a) resposta "Não consigo te responder isso." com pergunta de dado → dispara; (b) "O módulo de prospecção existe no sistema, mas não há dados cadastrados" → NÃO dispara; (c) resposta com dados → NÃO dispara; (d) pergunta de CONTESTAÇÃO ("por que não aparecem essas empresas?") com resposta explicativa contendo "não consigo" → NÃO dispara (skip por CONTESTACAO_RE).
- [ ] Step 2: implementar V9 POSICIONADO APÓS V3 no pipeline ordenado; documentar a fronteira no comentário: V3 = recusa quando HÁ _RESPOSTA disponível (anti-recusa com dado em mãos); V9 = recusa seca quando o certo é explicar a FONTE (sem dado mesmo). Dispara SOMENTE se a resposta casa recusa seca (`/n[aã]o (consigo|foi poss[ií]vel|consegui)\b/i`) E ausência de `/sistema|m[oó]dulo|cadastr|registr|fonte|per[ií]odo/i`. Retry com instrução: "explique a CAUSA citando o sistema/módulo/cadastro , nunca recusa seca". Skip se CONTESTACAO_RE.
- [ ] Step 3: verde (4/4); commit.

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
A1→A2→A3→A4→A5→A7; **A6 BLOQUEADA por A1** (o filtro de árvore lê
raw_estoque_local , GRANT é dependência dura); B1 antes de B4; C1 antes de
C4/C5; ondas em ordem A→B→C. `npm run gen:mcp-catalog` após CADA tool nova e
ANTES de caso golden que a referencie. Rebuild mcp ao fim de CADA onda (e na
B4) antes de E2E, sempre build na worktree + up na pasta principal +
verificação da data da imagem.

## Changelog do plano
- v1 (d1857cc): original.
- v3: 2 reviews adversariais aplicadas. Âncoras CORRIGIDAS (89/R$6,35mi
  remessa, 40 retorno , com filtro autorizada; os números da spec estavam sem
  o filtro); query inline na tool (funções-modelo citadas não existiam);
  fatos de schema cravados (p.uf existe; item desnormalizado; chave
  documento_id=odoo_id; árvore só no JSONB de raw_estoque_local , JOIN novo);
  snapshot do catálogo como step obrigatório; contagens nominais explícitas;
  V9 com 4º teste + posição pós-V3; inclusão obrigatória de esperaNaResposta
  na amostra; SELECTs de literais como steps com resultado transcrito;
  spike S1 com Step 0 (DISTINCT tabela_nome); rebuild também na B4.
