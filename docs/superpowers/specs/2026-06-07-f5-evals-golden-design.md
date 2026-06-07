# F5 , Evals / Golden Dataset (provar que o Nex acerta)

> Reconstrucao do Nex, Fase 5. Fonte: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` secao 6 (Fase 5) e secao 5 (politica de resultados). Fases 1-4 em producao (PRs #58/#59/#60/#63).
> **Spec v3** , apos 2 reviews adversariais (workflow `wx27s76ql`, 2 criticos + 4 altos + medios aplicados). Bloco "CORRECOES v3 [R]" no fim lista o que mudou de v1->v3.

## 1. Objetivo

Transformar cenarios catalogados (dossie: ~459 perguntas, 199 `[OK]`) num **dataset de avaliacao versionado** com **resposta-ouro independente** por pergunta e um **harness unico** que mede a qualidade do Nex em 4 dimensoes e **trava regressao**.

F5 e **camada de medicao**: nao adiciona tool nova, nao mexe em schema do banco/migration, nao muda a logica do agente/cerebro. A unica edicao tolerada em codigo de outra fase e **um adaptador** para o teste de retrieval da F3 ler o golden (sem alterar o algoritmo de retrieval nem o alvo de recall). Se o golden revelar bug real, corrigir e consequencia, registrada em `docs/RADAR.md`, nao escopo da F5.

## 2. O que ja existe (reuso obrigatorio, verificado no codigo)

- **Mini-oraculo F3:** `src/lib/agent/router/__tests__/e2e/mini-oraculo.json` , **45 entradas** (30 `prosseguir`, 9 `falta_honesta`, 6 `fora_de_escopo`; **ZERO `desambiguacao`**). Campos `pergunta/toolEsperada/dominioEsperado/classeEsperada`.
- **Harness recall@K F3:** `retrieval.e2e.ts` , runner tsx, embeddings reais; **so exercita as `prosseguir`** (recall@K); sai !=0 se recall@K < 0.98. Tipo `Item` conhece so 3 classes.
- **Baseline KPI F4:** `f4-baseline.e2e.ts` , roda `tool.handler(args)` e compara KPIs com snapshot anterior. **E ANTI-DRIFT, NAO OURO** (congela o que a tool calcula; se a tool sempre errou, congela o erro). 100 tools no set A. `ARGS` cobre so **17 tools** (ids cravados no cache vivo: odooId 1/4/42, pedidoId 694, ...); as demais rodam `{}`.
- **Embeddings:** `src/lib/agent/rag/embed.ts` resolve **`LlmCredential` (Postgres) + AppSetting `embedding_credential_id` + chave AES**, NAO `OPENAI_API_KEY` do env. `getToolVectors` embeda as ~102 tools **live por processo** (cache em-memoria, nao DB).
- **registrar_lacuna:** `mcp/tools/fora-do-catalogo/registrar-lacuna.ts` , output `{registrado, redirecionar?, respostaSugerida, sugestoesRelacionadas, _RESPOSTA}` **SEM campo `estado`**. RH/CRM/Producao caem no `_RESPOSTA` generico ("nao tenho dados suficientes...").
- **Envelope:** `mcp/lib/envelope.ts` , `estado in {preparando, ok, vazio}`; campo `ambiguidade` so popula quando a tool acha `totalMatches > 1` no cache vivo.

## 3. As 4 dimensoes (cada uma medida na CAMADA CERTA)

| Dimensao | Camada | Mecanismo | Alvo |
|---|---|---|---|
| **Selecao de tool** | retrieval (embeddings) | recall@K + top-1, **so sobre `prosseguir`** | recall@K >= 0.98 **no subconjunto congelado** (ver 4.5) |
| **Acuracia de numero** | handler vs cache | `kpiOuro` **independente (SELECT/mao)**, match **exato** | toda entrada `kpiOuro` bate |
| **Alucinacao** | depende da sub-classe (ver 4.3) | (A) vazio-sem-tool: roteou p/ `registrar_lacuna` + sem numero factual; (B) tool-com-dado-vazio: `estado:'vazio'` | taxa de alucinacao = **0** |
| **Desambiguacao** | handler com args ambiguos | envelope traz `ambiguidade` OU a tool NAO chuta match errado (tolerante) | casa o esperado, sem chute |

**`fora_de_escopo`** continua medido como hoje (pickDomains classifica fora de escopo) , taxa de falso-fora-de-escopo, sem mudar.

## 4. Arquitetura

### 4.1 Golden unico versionado

Local: `src/lib/agent/evals/golden/golden-nex.json` (sob `src/`, coberto pelo tsconfig da raiz; **fora** do build do container mcp). Schema Zod em `src/lib/agent/evals/golden-schema.ts`:

```ts
{
  id: string,                       // estavel/unico, ex "estoque-saldo-produto-01"
  pergunta: string,
  dominio: string | null,
  classe: "prosseguir" | "fora_de_escopo" | "falta_honesta" | "desambiguacao",
  toolEsperada: string | null,
  // prosseguir/numero:
  args?: Record<string, unknown>,         // args PROPRIOS da entrada (NAO herda o ARGS parcial do baseline)
  kpiOuro?: Array<{                        // ouro INDEPENDENTE; ausente em entradas so-de-selecao
    chave: string,                         // chave dentro de _DESTAQUE/_agregado
    valor: number | string,
    match: "exato" | "centavos" | "faixa", // exato e o default; centavos/faixa exigem delta + justificativa
    delta?: number,
    fonteOuro: string,                     // o SELECT/derivacao que produziu o valor (texto)
    ancora?: string,                       // p/ KPI relativo a data: a data ancorada do SELECT (ex "2026-06-07")
  }>,
  volatil?: boolean,                       // true = KPI now()-dependente; PROIBE kpiOuro match:exato
  // desambiguacao:
  esperaAmbiguidade?: { requiredExactMatch?: boolean; minCandidatos?: number; toleranteResultadoUnico?: boolean },
  observacao?: string,
}
```

`kpiOuro` e o coracao: numero **verificado por SELECT/mao** (pega bug de logica), comparado **EXATO** (a tolerancia de 2 casas do baseline e so anti-drift, NAO se aplica ao ouro). Entradas `volatil` (vencidos, parados) **nao podem** ter `kpiOuro` exato , usam `match:"faixa"`/`"centavos"` com `ancora` de data no `fonteOuro`, ou ficam so como entrada de selecao (sem `kpiOuro`).

### 4.2 Harness `golden-nex.e2e.ts` (runner tsx, guard `E2E=1`)

Roda o golden e emite `golden-scorecard.json` (versionado, `GOLDEN_WRITE=1` p/ gravar). As 4 dimensoes rodam **independentes** , a de selecao (cara, depende de embeddings) e **degradavel**: se a credencial de embedding faltar ou der erro de rede, ela emite `selecao: "indisponivel"` com aviso e **NAO derruba** os gates de numero/alucinacao/desambiguacao (que so precisam do cache Postgres). Retry/backoff em erro de embedding antes de degradar.

### 4.3 Deteccao de alucinacao (a dimensao mais importante , corrigida)

Duas sub-classes de `falta_honesta`, medidas em camadas diferentes:

- **(A) dominio vazio SEM tool de dado** (RH/CRM/Producao, `toolEsperada: "registrar_lacuna"`): o criterio NAO e `estado:vazio` (registrar_lacuna nao tem `estado`). Criterio = **a tool resolvida foi `registrar_lacuna`** (camada de selecao/roteamento) **E** o `_RESPOSTA` **nao contem nenhuma afirmacao factual/numero** (regex de digito + lista de verbos factuais). registrar_lacuna respondendo "nao tenho dados suficientes" e o comportamento CORRETO (nao alucina).
- **(B) dominio com tool mas dado vazio** (contabil lancamentos=0, cobranca vazia, produto sem custo): roda a tool real e exige `estado:'vazio'` **OU** `_RESPOSTA` casando um **marcador canonico de nao-operado**.

Os "marcadores de nao-operado" viram uma **constante exportada e testada** `MARCADORES_NAO_OPERADO` em `src/lib/agent/evals/marcadores.ts`, **derivada dos textos reais** que as tools/registrar_lacuna emitem hoje (varrer os `naoOperado`/`mensagem` das honest-tools + o generico de registrar_lacuna), com um teste que falha se uma tool de dominio-vazio emitir texto fora da lista (forca manter a lista em dia). Nada de padrao inventado.

### 4.4 Casos de desambiguacao (seed NOVO , nao migracao)

A classe `desambiguacao` **nao existe** no mini-oraculo: e 100% nova. ~5 casos concretos, cada um com: pergunta, **tool a invocar**, **args ambiguos reais** que disparam o campo `ambiguidade` (verificados contra um resolvedor F2 real), e o esperado. Para estabilidade no cache vivo: escolher termos cuja ambiguidade seja **estrutural** (ex.: termo que casa uma familia inteira de produtos, ou sobrenome comum de parceiro), e marcar `toleranteResultadoUnico: true` , a entrada **passa** se a tool trouxe `ambiguidade` OU um resultado unico legitimo, e **so falha se a tool chutou um match errado**. `observacao` documenta a dependencia de cache.

### 4.5 Selecao: gate congelado + monitoradas (resolve "so medir" x mexer no F3)

- O recall@K **gate** e medido **so sobre as 30 perguntas `prosseguir` originais do mini-oraculo** (congeladas), preservando exatamente o baseline da F3 (>=0.98).
- Perguntas `prosseguir` **novas** que a F5 adicionar entram como **"monitoradas, nao-gate"**: aparecem no scorecard, mas nao derrubam o build ate provarem >=0.98. Subir uma monitorada para o gate (se exigir tunar o retrieval) e decisao explicita futura = **mudanca de agente** (sai do escopo F5).
- **Adaptador obrigatorio** `golden-to-oraculo.ts`: mapeia o golden -> shape `Item` do retrieval (`dominio->dominioEsperado`, `classe->classeEsperada`), **filtra so `prosseguir`** e ignora `desambiguacao`. O `retrieval.e2e.ts` passa a ler o golden **via adaptador**, com um teste provando que o recall@K das 30 congeladas e **identico** ao atual. Sem rename in-place de campos.

### 4.6 Gate jest (deterministico, sem rede) , cobertura honesta

Roda no CI sem DB/OpenAI. Valida:
- **Schema** do golden (Zod): ids unicos, `classe` coerente com campos presentes, `toolEsperada` existe no catalogo, `kpiOuro` so em `prosseguir`, `volatil` => sem `match:"exato"`.
- **Cobertura de SELECAO** (barata, atingivel): **toda read-tool "operacional" tem >=1 entrada** , onde "operacional" e definido **programaticamente reusando a mesma funcao do set A do baseline**: `!isWriteToolEntry(t) && !ehFormatadorGenerico(formatadorPorTool(t.id)) && !EXCLUIR.has(t.id)`. Uma pergunta de selecao por tool basta (alinha com as 45 migradas + as novas). **Falha dura** se faltar.
- **Cobertura de OURO** (parcial, incremental): **>=1 entrada `kpiOuro` por DOMINIO operacional** (estoque/financeiro/fiscal/comercial) nesta onda. **Warning listando** quais metricas canonicas `[OK]` (dossie secao 3) ainda nao tem ouro (divida visivel, nao hard-fail). Alvo de longo prazo: toda metrica `[OK]` cuja tool ja existe.

## 5. Decisoes canonicas (gray areas)

1. **Baseline F4 NAO e ouro.** E anti-drift (circular por design). A unica prova de correcao independente e o `kpiOuro` (SELECT/mao). O golden NUNCA chama o baseline de "ouro". Os dois coexistem: baseline pega drift de 100 tools; kpiOuro prova correcao de uma sub-lista crescente.
2. **Cobertura em duas camadas:** selecao = total (hard, barata); ouro = >=1/dominio agora + warning de divida. Resolve a contradicao v1 (cobertura total x seed pequeno).
3. **Alucinacao em 2 sub-classes** (4.3): vazio-sem-tool na selecao; tool-com-dado-vazio no `estado`. Marcadores = constante testada derivada do codigo real.
4. **Desambiguacao = seed novo**, tolerante a resultado unico, termos estruturalmente ambiguos.
5. **Selecao degradavel + gate so nas 30 congeladas** (4.2/4.5). Novas perguntas sao monitoradas.
6. **kpiOuro carrega args proprios** (nao herda o ARGS parcial do baseline); o SELECT-ouro usa o MESMO predicado dos args; preferir chave estavel (codigo/CNPJ/termo) a odooId cru; `volatil` proibido de ter ouro exato.
7. **Match exato no ouro** (centavos/faixa so com justificativa e delta). Arredondamento de 2 casas fica so no baseline.
8. **Sem migration, sem mudar agente.** Unica edicao cross-fase: o adaptador do retrieval.e2e (nao toca o algoritmo).
9. **Local `src/lib/agent/evals/`** (tsconfig raiz; imports do catalogo mcp via caminho que compila em raiz E mcp; nao entra no build do container mcp). Validar `tsc` raiz+mcp.

## 6. Fora de escopo (YAGNI)

- Encher o golden ate 199/459 (incremental pos-F5; e nem todas as `[OK]` tem tool hoje , varias dependem de gaps tier-1 ainda nao construidos; o teto realista desta onda e "`[OK]` cuja tool ja existe").
- Custo/latencia por requisicao -> **F6**.
- Tunar o retrieval para acertar perguntas novas dificeis -> mudanca de agente (so se decidido depois).
- UI de evals (ja existe `monitoramento/evaluations-table` p/ o judge LLM); judge de redacao (ja existe `claude-judge-runner`). O golden e deterministico (numero/selecao/alucinacao/desambiguacao), nao redacao.

## 7. Criterios de aceite

- jest (sem rede): schema do golden valido; **cobertura de selecao = 100% das read-tools operacionais** (def. programatica do set A); cobertura de ouro >=1/dominio + warning de divida.
- harness `golden-nex.e2e.ts` roda contra o cache real e emite scorecard com as 4 dimensoes; selecao **degradavel** sem OpenAI.
- **Alucinacao = 0** (sub-classes A e B); **numero = match exato** em toda `kpiOuro` (verificado x SELECT, com `ancora` nas volateis); **recall@K >= 0.98 nas 30 congeladas**; **desambiguacao** sem chute.
- `retrieval.e2e.ts` consome o golden via adaptador com recall@K **identico** ao atual nas 30 congeladas.
- tsc raiz+mcp limpos; jest verde; **nenhuma migration**; plataforma nao quebra; pre-requisitos do harness (LlmCredential+AppSetting+cache populado) documentados no proprio arquivo.

## 8. Riscos (e mitigacao)

- **Ouro circular** -> so `kpiOuro` (SELECT/mao) conta como prova; baseline e anti-drift declarado.
- **KPI now()-dependente** (titulos_vencidos: totalVencido E contagem driftam; produtos_parados): marcado `volatil`, sem ouro exato, com `ancora` de data , ou so entra como selecao.
- **Embeddings caros/flaky + dependem de LlmCredential no DB** -> dimensao selecao degradavel, retry/backoff, custo (~102+N embeddings/run) so na verificacao de onda; pre-req documentado.
- **Cache vivo muda a ambiguidade/ids** -> desambiguacao tolerante a resultado unico; kpiOuro com args de chave estavel + `fonteOuro` documentando o pin.
- **Regressao fabricada no recall@K** (perguntas novas dificeis) -> novas sao monitoradas, gate so nas 30 congeladas.
- **Import cross-boundary src<->mcp** -> validar `tsc` raiz E mcp; usar alias `@/` onde possivel.

## CORRECOES v3 [R] (do que as 2 reviews adversariais mudaram)

1. **[CRITICO] Alucinacao** media na camada errada (exigia `estado:vazio` de `registrar_lacuna`, que nao tem `estado`; as 9 perguntas caem no `_RESPOSTA` generico) -> separada em 2 sub-classes (4.3) + constante `MARCADORES_NAO_OPERADO` derivada do codigo real e testada.
2. **[CRITICO] Desambiguacao** declarada como "migracao sem perda", mas o mini-oraculo tem ZERO desambiguacao e o campo `ambiguidade` e cache-dependente -> reclassificada como seed NOVO, tolerante a resultado unico, termos estruturais (4.4).
3. **[CRITICO/ALTO] Ouro circular**: baseline F4 e snapshot da propria tool (anti-drift), nao ouro -> declarado explicitamente; cobertura separada em selecao (total) vs ouro (>=1/dominio + warning) (decisao 1/2, 4.6).
4. **[ALTO] KPIs now()-dependentes** (vencidos contagem TAMBEM drifta) -> `volatil` no schema, ouro exato proibido, `ancora` de data, `match:exato|centavos|faixa` (4.1).
5. **[ALTO] Embeddings** usam LlmCredential no DB (nao OPENAI_API_KEY), vetores live, caros/flaky -> selecao degradavel + retry + custo documentado (4.2, 2).
6. **[MEDIO] "So medir" x mexer no retrieval.e2e** -> adaptador obrigatorio + gate so nas 30 congeladas + novas monitoradas (4.5).
7. **[MEDIO] ARGS** do baseline cobre so 17 tools com ids cravados -> cada `kpiOuro` carrega args proprios + SELECT no mesmo predicado + chave estavel (decisao 6).
8. **[MEDIO] Cobertura "toda read-tool operacional"** ambigua/contraditoria com seed -> "operacional" definido pela funcao do set A; selecao total (hard) vs ouro parcial (warning) (4.6).
9. **[BAIXO] Tolerancia 2 casas** mascarava bug de centavos no ouro -> ouro = match exato; 2 casas so no baseline (decisao 7).
10. **[BAIXO] Import cross-boundary** + narrativa "199" inflada -> validar tsc raiz+mcp; teto realista = `[OK]` com tool existente (4.6, secao 6).
