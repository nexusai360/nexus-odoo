# SPEC v1 — Agente Nex: Caminho para ≥90% de Acerto

**Data:** 2026-05-27
**Autor:** Claude Code (Opus 4.7)
**Branch:** `feat/agente-nex-90pct`
**Status:** v1 (aguardando review crítico → v2 → v3)
**Laudo-fonte:** `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`

---

## 1. Objetivo

Elevar a assertividade do Agente Nex de **65–75%** (média R11-R16) para **≥90%** em 3 ondas determinísticas, terminando em **≥95%** após onda de tuning. A meta é mover trabalho do LLM (`gpt-5.4-mini`) para o servidor MCP — sempre que possível, o servidor entrega resultado pronto e o LLM só formata.

### 1.1 Métricas de sucesso

| Marco | Critério | Como medir |
|-------|----------|------------|
| Saída Onda 1 | %CORRETO ≥ 85% | Bateria R17 (100 turnos novos, judge Claude Code) |
| Saída Onda 2 | %CORRETO ≥ 89% | Bateria R18 |
| Saída Onda 3 | %CORRETO ≥ 92% | Bateria R19 |
| Saída final | %CORRETO ≥ 95% | Bateria R20+ (consolidação) |

Cada onda só sai quando: (a) `tsc`/`eslint`/`jest`/`build` verdes; (b) bateria correspondente atingiu o piso; (c) sem regressão > -2pp em sub-domínio (estoque/financeiro/fiscal/comercial/cadastros/contábil) vs rodada anterior.

---

## 2. Princípios de design

1. **Determinismo > LLM.** Toda lógica que pode ser código vai para código (envelope de tool, agregação, validação).
2. **Tool entrega resposta pronta.** Novo campo `_RESPOSTA` em cada tool, gerado por TS puro, descreve o resultado em linguagem natural conservadora.
3. **Auto-validação no servidor.** Resposta do LLM passa por 4 validadores antes de ir ao usuário; falha dispara **1 retry** com instrução corretiva.
4. **Prompt cirúrgico, não reescrita.** 7 ajustes pontuais em `identity-base.ts`.
5. **Compatibilidade retroativa.** Nada que invalide tools existentes (catálogo do MCP, schemas Zod, contratos). `_RESPOSTA` é aditivo.
6. **Observabilidade desde o dia 1.** Toda nova validação gera telemetria persistida (`evalRetryCount`, `retryReason`).
7. **Limite de custo: +1 LLM call em ~15% dos turnos.** Cap de retry = 1. Sem loop.

---

## 3. Escopo

### Dentro

#### Onda 1 — código MCP + run-agent (cura projetada: 85 casos / 59%)

- **A1.** Framework de envelope de tool: tipo TypeScript `ToolEnvelope<T>` com campos canônicos novos `_RESPOSTA: string`, `_listaTruncada: boolean`. Helper `buildEnvelope(...)` em `mcp/lib/envelope.ts`. Aplicação **gradual**: começa em 4 tools, expande.
- **A2.** Aplicação em **financeiro_contas_a_pagar**, **financeiro_contas_a_receber**, **financeiro_titulos_vencidos**, **financeiro_fluxo_caixa**. Cada uma ganha `_RESPOSTA` + `_listaTruncada` + `topPorParticipante: TopPart[]` (top 10 agrupado por `participanteNome`, somando `vrSaldo`).
- **A3.** Aplicação em **fiscal_notas_emitidas**, **fiscal_notas_recebidas**, **fiscal_notas_recebidas_por_fornecedor**, **fiscal_faturamento_periodo**, **fiscal_faturamento_por_cliente**, **fiscal_apuracao**.
- **A4.** Aplicação em **estoque_saldo_produto**, **estoque_top_movimentados**, **estoque_produtos_parados**, **estoque_concentracao**, **estoque_valor_armazem**, **estoque_entradas_saidas**, **estoque_produtos_saldo_zero**.
- **A5.** Aplicação em **comercial_pedidos_periodo**, **comercial_pedidos_por_etapa**, **comercial_pedidos_atrasados**, **comercial_parcelas_a_vencer**, **comercial_pedidos_por_vendedor**, **comercial_pedidos_listar_top_valor**, **preco_produto**, **preco_tabela**.
- **A6.** Aplicação em **cadastro_buscar_parceiro** (com novo parâmetro `papel`), **cadastro_parceiros_por_uf**, **cadastro_contar_parceiros**.
- **A7.** Aplicação em **contabil_plano_de_contas** (full-text via `pg_trgm`), **contabil_estrutura_conta**.
- **A8.** Aplicação em **registrar_lacuna** (resposta sugerida completa com sugestões inline) e **bi_consulta_avancada** (`_RESPOSTA` montada a partir de `_DESTAQUE`).
- **A9.** `estoque_saldo_produto`: match exato obrigatório quando `termo` é numérico ≥4 dígitos. Devolve `ambiguidade.exactMatchRequested: true` se não bater.
- **A10.** `financeiro_titulos_vencidos`: `tipo` (`a_receber|a_pagar`) vira obrigatório. Sem o parâmetro, retorna `erro: "tipoObrigatorio"`.
- **A11.** Helper de período `mcp/lib/periodo.ts`: aceita `periodoNome: "hoje"|"amanha"|"essa_semana"|"mes_corrente"|"mes_anterior"|"mes_passado"|"ano_corrente"|"semana_passada"` e converte para `periodoDe`/`periodoAte` ISO com timezone America/Sao_Paulo. Aplicar em todas as tools que aceitam período.
- **A12.** Camada de auto-validação no `run-agent.ts`:
  - **V1 (anti-truncamento):** rejeita resposta contendo regex `/(veio (truncad|cortad|incompleto)|listagem veio (truncad|cortad)|n[ãa]o consegui obter (esse|o) (total|dado|valor))/i` quando algum tool result do turno tem `_DESTAQUE`, `_RESPOSTA`, `_agregado.*` ou `totalA*` preenchido.
  - **V2 (anti-invenção):** extrai números (`\b\d{1,3}(?:\.\d{3})*(?:,\d+)?\b`, `\bR\$\s*[\d.,]+\b`) e contagens (`\b\d+\s+(pedidos|notas|cadastros|fornecedores|clientes|vendedores)\b`) da resposta; cada número deve aparecer **em algum** `_RESPOSTA`, `_DESTAQUE.*`, `_agregado.*`, `total*` ou em alguma linha de `toolResults[].linhas[]`. Senão, dispara retry.
  - **V3 (anti-recusa indevida):** rejeita resposta começando com `/^(Não consegui|Essa informação não está disponível|Você tem razão)/i` quando há `_RESPOSTA` curada para o turno.
  - **V4 (anti-placeholder em bullet):** rejeita resposta que tenha bullets `^[-\*]\s.*não consegui obter`.
  - Cap rígido: **1 retry**. Se retry falhar nas mesmas validações, **aceita** a resposta (não bloqueia o usuário).
  - Persiste `retryCount: 0|1` e `retryReason: V1|V2|V3|V4|none` em `ConversationQualityEvaluation`.
- **A13.** `registrar_lacuna.redirecionar` vira gate estrutural: se a tool devolveu `redirecionar.tool`, o `run-agent.ts` força o próximo turno do LLM a chamar essa tool (depth=1, sem loop).

#### Onda 2 — prompt (cura projetada: +20 casos / +14%)

- **B1.** Editar `src/lib/agent/prompt/identity-base.ts`:
  - § AGREGAÇÃO FORÇADA: adicionar item "**Pergunta quantitativa ('quanto', 'soma de', 'total de') com `_agregado.soma` ou `_RESPOSTA` disponível: nunca responda 'não consegui'.**"
  - § COMBINAÇÃO DE TOOLS: tom imperativo, sem subjuntivo; adicionar caso "vendedores cadastrados → `comercial_vendedores_cadastrados`".
  - § "Não inventar": F18 (`"Não consegui obter" substitui a resposta inteira, não bullet`).
  - **Novo § FOLLOW-UP:** "Pergunta curta de continuação ('e do mês passado?', 'e essa semana?') reusa indicador + tool do turno anterior, ajusta apenas o período."
  - **Novo § DATA RELATIVA:** "Use `periodoNome` em vez de calcular datas. Exemplos: 'amanhã' → `periodoNome: amanha`. 'do mês' → `periodoNome: mes_corrente`."
  - § EXTRAÇÃO DE IDENTIFICADORES: checklist obrigatório de 4 perguntas antes de chamar tool.
  - § TOOLS / Comercial: `comercial_pedidos_por_etapa` separa cancelados/concluídos.
- **B2.** Atualizar exemplos do prompt com 2 novos casos das rodadas R11-R16 (lista de fornecedores, mês a mês).

#### Onda 3 — tools novas/expansões (cura projetada: +15 casos / +10%)

- **C1.** `fiscal_faturamento_mensal_serie({ano})` — itera `fiscal_faturamento_periodo` para cada mês 01/{ano} até hoje, devolve `serie: [{mes, valorTotal, totalNotas}]` + `_RESPOSTA` formatada.
- **C2.** `cadastro_detalhar_parceiro({participanteId})` — recebe ID interno, devolve nome, doc, papel, endereço, condição de pagamento, ativo. Lê de `raw_res_partner` direto.
- **C3.** `comercial_vendedores_cadastrados()` — devolve lista mestra de vendedores (raw `res_users` filtrada por grupo `sales_team`), sem depender de pedidos.
- **C4.** `cadastro_parceiros_recentes({periodoDe, periodoAte})` — busca parceiros criados em período (campo `create_date` de `raw_res_partner`).
- **C5.** `estoque_locais_por_produto({termo})` — explode `numLocais` em lista detalhada por armazém/localização.
- **C6.** `comercial_pedidos_sem_vendedor({periodoDe, periodoAte})` — pedidos com `user_id` null no período.

#### Onda 4 — refinos finais (condicional, se R19 < 95%)

- Few-shot dinâmico (futuro, escopo separado).
- Tuning fino do `_RESPOSTA` por tool com base em achados de R19.
- Ajustes adicionais no prompt.

### Fora

- **Trocar modelo do agente** (gpt-5.4-mini → gpt-5.4 ou outro). O laudo mostra que problemas são de envelope/prompt, não capacidade do modelo. Postergar.
- **Tools de meta, margem, liquidez, faturamento por estado/região/marca, SLA logístico.** São pedidos legítimos fora do escopo do ERP atual (sem dado fonte). Permanecem em `registrar_lacuna`.
- **Mudar o judge.** O judge versionado (`v2-claude-code`) continua válido. Eventuais atualizações do briefing virão depois.
- **Reformular a UI `/agente/qualidade`.** Fora de escopo desta SPEC.
- **F5 (WhatsApp/agente externo).** Não afetar.
- **Migração de schema de mensagens.** Não tocar.

---

## 4. Arquitetura

### 4.1 Diagrama

```
┌──────────────────────────────────────────────────────────────────┐
│ src/lib/agent/run-agent.ts                                         │
│                                                                     │
│  request → buildContext → buildSystemPrompt                        │
│                                                                     │
│  ┌──── Loop de tool-calls (atual) ────┐                             │
│  │                                      │                             │
│  │  LLM call → toolCalls → exec MCP    │                             │
│  │                                      │                             │
│  └────────────────┬─────────────────────┘                             │
│                   │ mensagem final do LLM                              │
│                   ▼                                                     │
│  ┌──── NOVO: AutoValidator (síncrono) ──────┐                          │
│  │  V1 anti-truncamento                      │                          │
│  │  V2 anti-invenção                         │                          │
│  │  V3 anti-recusa indevida                  │                          │
│  │  V4 anti-placeholder em bullet            │                          │
│  └─────────────────┬──────────────────────────┘                          │
│         passou? ───┴── falhou (e ainda não retentou)                  │
│           │                       │                                    │
│           │                       ▼                                    │
│           │            LLM retry call (cap=1, instrução corretiva)    │
│           │                       │                                    │
│           ▼                       ▼                                    │
│  persistMessage(assistant) + persistMessage(retry tag)                 │
│  cria ConversationQualityEvaluation PENDENTE com retryCount/Reason   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Servidor MCP (mcp/server.ts)                                       │
│                                                                     │
│  tool exec → helpers locais:                                       │
│    mcp/lib/envelope.ts  →  buildEnvelope({                          │
│      dados, _RESPOSTA, _listaTruncada, _agregado, ...               │
│    })                                                                │
│    mcp/lib/periodo.ts   →  resolverPeriodo(periodoNome | from/to)   │
│    mcp/lib/agrupador.ts →  topPorParticipante(titulos[])            │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Tipos canônicos novos

```typescript
// mcp/lib/envelope.ts
export interface ToolEnvelope<TLinhas = unknown> {
  /** Texto pronto descrevendo o resultado, gerado pelo servidor (TS).
   *  LLM DEVE usar literalmente quando pergunta cair no canônico. */
  _RESPOSTA: string;

  /** True só se a lista foi cortada por limite explícito da tool. */
  _listaTruncada: boolean;

  /** Mantido: total estruturado. */
  _DESTAQUE?: Record<string, string | number>;

  /** Mantido: agregados pré-computados. */
  _agregado?: {
    soma?: number;
    contagem?: number;
    media?: number;
    [k: string]: number | undefined;
  };

  /** Lista crua, paginada se grande. */
  linhas: TLinhas[];

  /** Atualização do cache. */
  atualizadoEm: string;
  atualizadoHa: string;

  /** Indicação de ambiguidade quando aplicável. */
  ambiguidade?: {
    requiredExactMatch?: boolean;
    candidatos?: Array<{ id: string; nome: string; contexto?: string }>;
    [k: string]: unknown;
  };

  /** Top por participante (financeiro). */
  topPorParticipante?: Array<{ nome: string; soma: number; n: number }>;
}
```

### 4.3 AutoValidator

```typescript
// src/lib/agent/validation/auto-validator.ts
export interface ValidationContext {
  question: string;
  llmResponse: string;
  toolResults: ToolEnvelope[];
}

export type ValidationFailReason = "V1" | "V2" | "V3" | "V4" | null;

export interface ValidationOutcome {
  ok: boolean;
  reason: ValidationFailReason;
  hint: string;  // texto pra retry
}

export function validateResponse(ctx: ValidationContext): ValidationOutcome {
  // V1, V2, V3, V4 em ordem; primeira falha vence.
}
```

### 4.4 Mudanças no `run-agent.ts`

Adicionar bloco antes do `persistMessage` final:

```typescript
// pseudo
const finalMsg = ...; // resposta final do LLM
const outcome = validateResponse({
  question: args.userMessage,
  llmResponse: finalMsg,
  toolResults: collectedToolResults,
});

let retryCount = 0;
let retryReason: ValidationFailReason = null;

if (!outcome.ok) {
  retryCount = 1;
  retryReason = outcome.reason;
  const retryMsg = await llmRetryWith(outcome.hint, ...);
  // aceita retryMsg mesmo se ainda falhar (não bloqueia usuário)
  finalMsg = retryMsg;
}

await persistMessage(...);
await createPendingEvaluation({ retryCount, retryReason });
```

---

## 5. Schema delta

```prisma
model ConversationQualityEvaluation {
  // ... campos existentes ...

  /// Quantas vezes o auto-validator retentou na geração desta resposta. 0 ou 1.
  retryCount Int @default(0) @map("retry_count")
  /// V1|V2|V3|V4|null. Qual validador disparou (null se aceito de primeira).
  retryReason String? @map("retry_reason")
}
```

Migration aditiva (sem perda).

---

## 6. Plano de testes

### 6.1 Unitários

- `mcp/lib/envelope.test.ts`: builder cobre todos os campos canônicos.
- `mcp/lib/periodo.test.ts`: cada `periodoNome` resolve corretamente em DST e timezone São Paulo.
- `mcp/lib/agrupador.test.ts`: `topPorParticipante` lida com null, dedupe por nome, ordena por soma desc.
- `src/lib/agent/validation/auto-validator.test.ts`: cada validator (V1-V4) com casos positivos e negativos, baseados em respostas reais das rodadas R11-R16.

### 6.2 Integração

- `mcp/tools/financeiro/contas-a-receber.test.ts`: envelope completo com `_RESPOSTA`, `topPorParticipante`.
- `mcp/tools/estoque/saldo-produto.test.ts`: match exato numérico.
- `src/lib/agent/run-agent.test.ts`: retry dispara quando validator falha; cap=1.

### 6.3 End-to-end contra cache real (REGRA DE RAIZ)

Cada onda tem **suite de regressão** com subconjunto curado dos 144 casos das rodadas R11-R16 (mas com perguntas reformuladas, não literais). Suite roda contra o cache Postgres real. Conforme `docs/RADAR.md` R2 e CLAUDE.md §6, code review **não** substitui esse teste.

- Arquivo: `scripts/quality-audit/regression-r11-r16.json`.
- Script: `pnpm tsx scripts/quality-audit/run-regression.ts`.
- Critério: cada caso deve mover de PARCIAL/ERRADO para CORRETO **OU** ficar igual; nenhum CORRETO atual pode regredir.

### 6.4 Bateria nova (R17, R18, R19)

Após cada onda, criar nova bateria de 100 turnos. **Não reusar literalmente** os 100 turnos das rodadas anteriores — variar paráfrases, períodos, identificadores. Manter taxonomia de áreas (estoque 30%, financeiro 25%, comercial 20%, fiscal 15%, cadastros 7%, contábil 3%).

---

## 7. Não-funcionais

### 7.1 Performance

- `_RESPOSTA` é string ≤500 chars por tool, gerada em TS puro: custo desprezível.
- `topPorParticipante` adiciona ~2KB ao payload das 4 tools financeiras. Aceitável.
- AutoValidator é regex+JSON walk: <5ms por turno.
- Retry quando dispara: +1 LLM call (~3-5s). Estimativa: ~15% dos turnos disparam (baseline laudo). Custo agregado: +0.7s no p50 do turno do agente.

### 7.2 Segurança

- Sem novos endpoints expostos. Toda mudança fica no MCP (já gated) e no `run-agent.ts` (já gated por sessão).
- Validators não vazam estrutura interna: instruções de retry mencionam só "valores presentes nos resultados" (sem nome de tool/campo).
- Schema delta é interno, não exposto via API pública.

### 7.3 Observabilidade

- `retryCount` e `retryReason` em `ConversationQualityEvaluation` → KPI no `/agente/monitoramento`.
- Log estruturado em `run-agent.ts` com `validator.passed` / `validator.failed.{V1|V2|V3|V4}`.
- Health check no judge: rodadas seguintes devem mostrar `retryCount=1` em ~10-15% dos turnos. Se zero → validador silenciosamente quebrado.

### 7.4 Compatibilidade retroativa

- Envelope `_RESPOSTA` é aditivo: tools antigas que não setarem o campo continuam funcionando (LLM cai no caminho atual).
- `cadastro_buscar_parceiro.papel` default = "todos" mantém comportamento atual.
- `financeiro_titulos_vencidos.tipo` obrigatório quebra chamadas existentes — **breaking, mitigar com prompt atualizado simultâneo**.
- `estoque_saldo_produto` match exato breaking para termos numéricos curtos — mitigar com mensagem clara de ambiguidade.

---

## 8. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|----------------|---------|------------|
| `_RESPOSTA` curada vira engessada e pior que LLM livre | Média | Médio | Validator V2 não vincula LLM a usar literal; só rejeita se LLM inventar. Métrica de regressão por sub-domínio bloqueia merge. |
| Retry dispara em respostas legítimas (falso positivo) | Média | Médio | V3 só dispara quando há `_RESPOSTA` ou `_DESTAQUE` ou `_agregado`. V1 só dispara se algum tool result tem agregado. V2 ignora números mencionados na pergunta original. |
| Loop infinito de retry | Baixa | Alto | Cap rígido = 1 retry. Hard-coded no `run-agent.ts`. |
| Latência total ultrapassa 10s p50 | Baixa | Médio | Retry é serializado mas cap=1; timeout de 3s no retry; aceita resposta original se retry crashar. |
| `financeiro_titulos_vencidos.tipo` obrigatório quebra integrações externas | Média | Alto | Logar chamadas sem `tipo` por 1 semana antes de remover o default. Devolver `tipoSugerido` se LLM não passou. |
| `estoque_saldo_produto` exato bloqueia buscas legítimas com 4 dígitos | Baixa | Médio | Limiar ≥4 dígitos numérico estrito; testar 50 buscas reais. |
| Performance do `topPorParticipante` em listas de 5k+ títulos | Baixa | Médio | Agregação no Postgres com `GROUP BY` + `LIMIT 10` direto na query da tool. |
| Validador anti-invenção (V2) tem falso positivo com agregações compostas | Média | Médio | Aceita números que sejam soma/média/contagem **derivada** das linhas (regex matching menos estrito). Lista de exceções no validator. |
| LLM ignora `_RESPOSTA` e gera resposta própria pior | Média | Médio | V2 ainda valida números; mesmo livre, número inventado é rejeitado. |
| Bateria de regressão R17 vaza para o prompt como few-shot | Baixa | Alto | Nunca colocar perguntas literais da bateria no prompt; varia paráfrase a cada rodada. |

---

## 9. Sequência de execução

1. **Onda 1 — código MCP + run-agent**, sub-fases A→F em PRs separados:
   - PR1: A1 (framework envelope) + A11 (helper periodo) + testes.
   - PR2: A2 (financeiro), A3 (fiscal), A4 (estoque), A5 (comercial), A6 (cadastros), A7 (contábil), A8 (registrar_lacuna + bi).
   - PR3: A9 (match exato saldo), A10 (tipo obrigatório), A13 (gate redirecionar).
   - PR4: A12 (auto-validator) + schema delta + integração no `run-agent.ts`.
   - **Verificação Onda 1:** rodar R17 com gpt-5.4-mini; bateria 100 turnos; meta ≥85%.
2. **Onda 2 — prompt**, 1 PR único editando `identity-base.ts`:
   - **Verificação Onda 2:** R18 (100 turnos diferentes); meta ≥89%.
3. **Onda 3 — tools novas**, 1 PR por tool ou 1 PR único com as 6:
   - **Verificação Onda 3:** R19; meta ≥92%.
4. **Onda 4 — condicional**, se R19 < 95%, novo laudo focado e refinos.

Cada onda **NÃO** pode iniciar antes da anterior atingir o piso de meta.

---

## 10. Decisões que entram firmes a partir desta spec

1. **Auto-validador é síncrono no `run-agent.ts`.** Custo aceito.
2. **`_RESPOSTA` é gerada por TS, não LLM.** Determinismo > variedade.
3. **Validador roda no servidor (não no MCP).** O MCP é stateless; validação precisa do contexto da pergunta + tool results agregados.
4. **Cap de retry = 1 (hard-coded).**
5. **Schema delta aditivo** (`retryCount`, `retryReason`) sem renomes.
6. **Bateria de regressão R11-R16** vira artefato versionado em `scripts/quality-audit/regression-r11-r16.json` — **mas com perguntas reformuladas**, nunca literais.
7. **Tools fora de escopo legítimo (meta/margem/liquidez/etc) ficam em `registrar_lacuna`.** Não são objetivo desta spec.
8. **Sem mudança de modelo.** Continua `gpt-5.4-mini`.

---

## 11. Open questions

1. **Onda 1 deve ir num PR único ou em 4 PRs sequenciais?** Recomendação: 4 PRs sequenciais (PR1→PR2→PR3→PR4), mais fácil de auditar e revertendo se quebrar.
2. **AutoValidator passa por code review de quem?** Recomendação: `/gsd-code-review` automatizado + revisão manual obrigatória nos 4 validators (V1-V4) — são o coração da onda.
3. **`_RESPOSTA` deve ter limite de tamanho?** Recomendação: 500 chars hard cap, com truncamento por elipse no servidor.
4. **`topPorParticipante` em `financeiro_fluxo_caixa` faz sentido?** Provavelmente não (fluxo é movimento, não saldo por participante). Confirmar na execução.
5. **`registrar_lacuna` deve mesmo virar gate quando devolve `redirecionar`?** Pode irritar o LLM em casos legítimos. Alternativa: log + warning, não bloqueio. **Recomendação:** gate só quando `redirecionar.confianca >= 0.8`. Tool passa a retornar `confianca`.
6. **Devemos deletar o briefing do judge (`SUBAGENT-BRIEFING.md`) e refazer pós-Onda 1?** Recomendação: **manter por enquanto**, atualizar só após R17 medir o impacto real.
7. **Cabe um experimento com gpt-5.4 (não mini) nas 100 perguntas de R16 para isolar a contribuição do modelo?** Fora desta spec; pode virar research separado.

---

## 12. Próximo passo

1. Review SPEC #1 — adversarial → SPEC v2.
2. Review SPEC #2 — ainda mais crítico → SPEC v3.
3. PLAN v1 (sobre SPEC v3) via `superpowers:writing-plans`.
4. 2 reviews do PLAN → PLAN v3.
5. Execução Onda 1 (PR1 → PR4).

---

## Anexos

- **Laudo:** `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`
- **Detalhe ERRADO:** `docs/superpowers/research/anexos-laudo-r11-r16/detail2_ERRADO.md`
- **Detalhe PARCIAL:** `docs/superpowers/research/anexos-laudo-r11-r16/detail2_PARCIAL.md`
- **Detalhe FORA_DO_ESCOPO:** `docs/superpowers/research/anexos-laudo-r11-r16/detail2_FORA_DO_ESCOPO.md`
- **Input bruto JSONL:** `docs/superpowers/research/anexos-laudo-r11-r16/cases_v2.jsonl` (144 turnos)
