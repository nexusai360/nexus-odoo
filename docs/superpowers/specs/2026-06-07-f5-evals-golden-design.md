# F5 , Evals / Golden Dataset (provar que o Nex acerta)

> Reconstrucao do Nex, Fase 5. Fonte de requisitos: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` secao 6 (Fase 5) e secao 5 (politica de resultados). Fases 1-4 ja em producao (PRs #58/#59/#60/#63).
> **Spec v1.** Passa por 2 reviews adversariais antes do plano (metodologia CLAUDE.md secao 6).

## 1. Objetivo

Transformar os cenarios catalogados (dossie: ~459 perguntas, 199 marcadas `[OK]`) num **dataset de avaliacao versionado** com **resposta-ouro por pergunta**, e um **harness unico** que mede a qualidade do Nex em 4 dimensoes e **trava regressao** (nenhuma mudanca entra sem o golden verde).

F5 e uma **camada de medicao**: nao altera o agente, nao adiciona tool nova, nao mexe em schema/migration. Mede o que ja existe (Fases 1-4) e cria a rede que protege as proximas ondas.

## 2. O que ja existe (reuso obrigatorio , nao reinventar)

- **Mini-oraculo F3:** `src/lib/agent/router/__tests__/e2e/mini-oraculo.json` (45 entradas: 30 `prosseguir`, 6 `fora_de_escopo`, 9 `falta_honesta`; campos `pergunta/toolEsperada/dominioEsperado/classeEsperada`).
- **Harness recall@K F3:** `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts` (embeddings reais via DB+OpenAI; mede recall@K e taxa de falso-fora-de-escopo; sai !=0 se recall@K < 0.98). **F5 reusa o mecanismo de selecao de tool.**
- **Baseline KPI F4:** `src/lib/reports/__tests__/e2e/f4-baseline.e2e.ts` (roda o handler de cada read-tool contra o cache real e serializa KPIs invariantes; idempotente, 100 tools). **F5 reusa o mecanismo de numero-vs-cache.**
- **Catalogo + embeddingText:** `mcp/catalog/index.ts`, `mcp/catalog/embedding-text.ts` (`descriptionForRetrieval`).
- **Resolucao de entidades F2** (para casos de desambiguacao) e **Caminho/Fora do Catalogo F3** (para casos de gap honesto e fora de escopo).

## 3. As 4 dimensoes de eval (do dossie secao 6, Fase 5)

| Dimensao | O que mede | Mecanismo reusado | Alvo |
|---|---|---|---|
| **Selecao de tool** | a pergunta recupera/escolhe a tool certa? | retrieval F3 (recall@K + top-1) | recall@K >= 0.98; top-1 reportado |
| **Acuracia de numero** | a tool certa devolve o KPI certo? | handler vs cache (estilo baseline F4) + **ouro independente** (SELECT) na sub-lista curada | ouro: match exato; regressao: identico ao snapshot |
| **Alucinacao (gap honesto)** | dominios vazios (RH/CRM/Producao) e dado incompleto respondem **falta**, nao inventam | classe `falta_honesta` + estado `vazio`/`nao operado` do envelope | taxa de alucinacao = **0** |
| **Desambiguacao** | a tool **pergunta** (ou retorna ambiguidade/lista) em vez de chutar | resolvedores F2 + campo `ambiguidade` do envelope | match do comportamento esperado |

## 4. Arquitetura

### 4.1 Formato do golden (um unico dataset versionado)

Arquivo JSON versionado, **superconjunto** do mini-oraculo (migra os 45 atuais sem perda). Local: `src/lib/agent/evals/golden/golden-nex.json`. Schema por entrada (Zod em `golden-schema.ts`):

```ts
{
  id: string,                       // estavel, ex "estoque-saldo-produto-01"
  pergunta: string,
  dominio: string | null,           // dominioEsperado
  classe: "prosseguir" | "fora_de_escopo" | "falta_honesta" | "desambiguacao",
  toolEsperada: string | null,
  // --- so quando classe=prosseguir ---
  args?: Record<string, unknown>,   // args reais que a tool recebe (reusa ARGS do baseline)
  kpiOuro?: Record<string, number | string>, // ouro INDEPENDENTE (verificado por SELECT/mao); subconjunto de _DESTAQUE/_agregado
  // --- so quando classe=desambiguacao ---
  esperaAmbiguidade?: { requiredExactMatch?: boolean; minCandidatos?: number },
  // --- meta ---
  fonteOuro?: string,               // como o kpiOuro foi obtido (SELECT, dossie, mao)
  observacao?: string,
}
```

`kpiOuro` e o coracao do golden: e o numero **verificado de forma independente** (por um `SELECT` no cache ou conferencia manual), nao o output da tool. E isso que pega bug de logica (nao so drift). A sub-lista com `kpiOuro` e curada e de alto valor; o resto cai na rede de regressao (snapshot do baseline F4, que ja cobre 100 tools).

### 4.2 O harness (`golden-nex.e2e.ts`, runner tsx, guard `E2E=1`)

Para cada entrada do golden, roda a dimensao aplicavel e acumula um **scorecard**:

- **selecao:** so `classe=prosseguir`. Usa o retrieval F3 (embeddings reais) para conferir se `toolEsperada` esta no top-K (recall@K) e se e o top-1. Reusa a logica de `retrieval.e2e.ts` (extraida para um helper compartilhado `eval-retrieval.ts` para os dois harness usarem).
- **numero:** so entradas com `kpiOuro`. Roda `tool.handler(args, ctxSuperAdmin)` contra o cache e compara o subconjunto `kpiOuro` (tolerancia: numeros de moeda arredondados a 2 casas, igual ao baseline). Divergencia = falha.
- **alucinacao:** `classe=falta_honesta`. Roda a tool e exige `estado in {vazio, preparando}` OU `_RESPOSTA` casando o padrao de "nao operado/sem registros" (lista de marcadores canonicos). Qualquer numero inventado = falha (conta na taxa de alucinacao).
- **desambiguacao:** `classe=desambiguacao`. Exige o envelope trazer `ambiguidade` (ou a tool de detalhe retornar `encontrado:"nao"`/lista) conforme `esperaAmbiguidade`.
- **fora_de_escopo:** o retrieval/pickDomains classifica como fora de escopo (taxa de falso-fora-de-escopo, ja medida no F3).

Saida: um `golden-scorecard.json` (versionado, atualizavel com `GOLDEN_WRITE=1`) com as 4 taxas + a lista de falhas. Modo conferencia (sem `GOLDEN_WRITE`) sai !=0 se qualquer alvo regredir.

### 4.3 Gate de regressao (jest + E2E)

- **jest (deterministico, sem DB/OpenAI):** valida o **schema** do golden (toda entrada bem-formada, ids unicos, toolEsperada existe no catalogo, classe coerente com os campos) e que **toda read-tool operacional tem ao menos 1 entrada** no golden (cobertura). Isso roda no CI normal, sem rede.
- **E2E (`E2E=1`, contra cache + OpenAI):** roda o scorecard completo. Faz parte da verificacao de cada onda (regra de raiz do projeto), nao do CI sem rede.
- Regra: PR nao mergeia com scorecard regredido (alucinacao>0, numero divergente, recall@K<0.98).

### 4.4 Seed do golden (o que entra agora, YAGNI)

- **Migrar as 45 entradas do mini-oraculo** para o formato novo (sem perda; o `retrieval.e2e.ts` passa a ler o golden, ou um adaptador).
- **Enriquecer com `kpiOuro` independente** uma sub-lista curada de alto valor por dominio operacional (estoque, financeiro, fiscal, comercial), ~3 a 5 por dominio, com o numero verificado por `SELECT` no cache (mesmo metodo usado para validar os fixes da F4). Total seed de ouro: ~15-25 perguntas.
- **Casos de desambiguacao:** ~5 (empresa, parceiro cliente-vs-fornecedor, produto por nome ambiguo, conta, data) reusando os resolvedores F2.
- **Casos de gap honesto:** os 9 `falta_honesta` ja existentes (RH/CRM/Producao/contabil-vazio/produto-sem-custo) + reforco.
- O dataset **nasce growable**: a estrutura suporta chegar aos 199 `[OK]` em ondas, mas a F5 entrega o harness + seed que ja cobre as 4 dimensoes e trava regressao. Encher ate 199 e trabalho incremental pos-F5 (nao bloqueia).

## 5. Decisoes canonicas (gray areas resolvidas)

1. **Ouro independente vs regressao.** O golden guarda `kpiOuro` **verificado por SELECT/mao** (pega bug de logica) para a sub-lista curada; a rede de regressao ampla (drift) continua sendo o baseline F4 (100 tools). Os dois coexistem; nao se duplica o baseline.
2. **Tamanho do seed.** YAGNI: harness completo + seed cobrindo as 4 dimensoes nos 4 dominios operacionais, nao os 459. Crescer e incremental.
3. **Onde vive.** `src/lib/agent/evals/` (golden + schema + harness + helper de retrieval compartilhado). Nao em `mcp/` (eval e da plataforma/agente, nao do servidor MCP).
4. **OpenAI/embeddings.** A dimensao de selecao usa embeddings reais (como o F3). Em CI sem rede, so o gate de schema/cobertura roda (jest); o scorecard completo e E2E manual/de-onda (igual baseline e retrieval hoje).
5. **Sem migration, sem mudar agente.** F5 e medicao. Se o golden revelar um bug real (numero errado, alucinacao), corrige-se a tool/cerebro , mas isso e consequencia, nao escopo de design da F5.
6. **Reuso de ARGS.** Os `args` das perguntas `prosseguir` reusam o mesmo padrao do `ARGS` do baseline F4 (valores reais que retornam dado).

## 6. Fora de escopo (YAGNI / fases vizinhas)

- Encher o golden ate 199/459 perguntas (incremental pos-F5).
- Custo/latencia por requisicao -> **F6** (a F5 so mede acerto; F6 mede caro/rapido).
- Mudar o cerebro/tool por causa de um resultado de eval -> consequencia, nao design.
- UI de visualizacao de evals (ja existe `monitoramento/evaluations-table` para o judge LLM; o golden e harness de codigo, nao precisa de tela nova).
- Judge LLM de qualidade de redacao (ja existe `claude-judge-runner`; o golden mede numero/selecao/alucinacao deterministicamente, nao redacao).

## 7. Criterios de aceite

- Schema do golden validado por jest (ids unicos, toolEsperada no catalogo, classe coerente); cobertura: toda read-tool operacional com >=1 entrada.
- Harness `golden-nex.e2e.ts` roda contra o cache real e emite scorecard com as 4 taxas.
- **Alucinacao = 0** nas entradas `falta_honesta`. **Numero = match** nas entradas `kpiOuro` (verificado x SELECT). **recall@K >= 0.98** na selecao (mantem o alvo F3). **Desambiguacao** casa o esperado.
- O `retrieval.e2e.ts` da F3 passa a consumir o golden unico (fonte unica de verdade dos cenarios), sem regredir o recall@K atual.
- tsc raiz+mcp limpos; jest verde; nenhuma migration; plataforma nao quebra.

## 8. Riscos

- **Ouro circular** (snapshot da propria tool vira "ouro"): mitigado exigindo `kpiOuro` por SELECT/mao na sub-lista curada, separado da regressao.
- **Flutuacao por dado vivo** (worker re-sincroniza; KPIs relativos a `now()` driftam, ex. titulos vencidos / pedidos travados): o golden marca essas perguntas como `kpiOuro` **tolerante** (faixa) ou usa KPI estavel (contagem total), nunca um numero now()-dependente exato. Documentar no `observacao`.
- **Custo de OpenAI no E2E:** a dimensao selecao chama embeddings; rodar so na verificacao de onda, nao em loop. Mesmo padrao do retrieval F3 atual.
