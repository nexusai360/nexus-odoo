# SPEC v2 — Agente Nex: Caminho para ≥90% de Acerto

**Data:** 2026-05-27
**Autor:** Claude Code (Opus 4.7)
**Branch:** `feat/agente-nex-90pct`
**Status:** v2 (incorpora achados da review v1)
**Laudo-fonte:** `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`
**Review v1:** `docs/superpowers/specs/reviews/2026-05-27-agente-nex-90pct-spec-review-1.md` (24 achados endereçados abaixo)

---

## 1. Objetivo

Elevar a assertividade do Agente Nex de **65–75%** (média R11–R16) para **≥85% após Onda 1, ≥90% após Onda 2 (prompt), ≥95% como meta final**, em incrementos seguros e mensuráveis. Mover o máximo de lógica do LLM (`gpt-5.4-mini`) para o servidor MCP — sempre que possível, o servidor entrega resultado pronto e o LLM só formata.

### 1.1 Metas calibradas (mais conservadoras que v1, endereçando CRIT-2)

| Marco | Critério | Como medir |
|-------|----------|------------|
| Saída Onda 1 (código MCP + validador shadow) | %CORRETO ≥ 78% **E** retryRate (shadow) entre 5% e 25% | Bateria R17 |
| Saída Onda 1.5 (validador active + prompt fix data) | %CORRETO ≥ 85% | Bateria R18 |
| Saída Onda 2 (prompt completo) | %CORRETO ≥ 89% | Bateria R19 |
| Saída Onda 3 (tools novas) | %CORRETO ≥ 92% | Bateria R20 |
| Saída final | %CORRETO ≥ 95% | Bateria R21+ |

**Critério adicional (HIGH-17):** cada pergunta em Rxx vem com `dominio_canonico` no JSON (estoque/financeiro/fiscal/comercial/cadastros/contábil/cross). Nenhum sub-domínio pode regredir mais de **-2 pp** vs rodada anterior (cross é exceção: -5 pp).

**Critério de SLA (HIGH-15):** p50 ≤ 6s, p95 ≤ 12s. Medido em bateria de benchmark de 50 perguntas isoladas (sem retry forçado).

### 1.2 Critério de rollback (HIGH-18)

| Resultado R17 | Ação |
|----------------|------|
| ≥ 85% | Segue para Onda 1.5 |
| ∈ [78%, 85%) | Promover validator de shadow → active (Onda 1.5) |
| ∈ [70%, 78%) | Não seguir Onda 2; novo laudo focado nos novos casos; adicionar Onda 1.6 |
| < 70% | Rollback total da Onda 1; novo laudo + re-spec |

---

## 2. Princípios de design

1. **Determinismo > LLM.** Toda lógica que pode ser código vai para código.
2. **Tool entrega resposta pronta.** Campo `_RESPOSTA` curado em TS puro, gerado a partir de `_agregado`/`_DESTAQUE` via templates — não string hardcoded (MED-19, MED-20).
3. **Auto-validação no servidor, com feature flag (CRIT-5).** Estágios: `off` → `shadow` (loga, não retenta) → `active`.
4. **Prompt cirúrgico em paralelo (CRIT-4).** A regra "use `_RESPOSTA` literal" entra no prompt junto com Onda 1.
5. **Compatibilidade retroativa.** Tools antigas continuam funcionando se ignorarem `_RESPOSTA`.
6. **Observabilidade desde o dia 1.**
7. **Limite de custo: cap rígido de 1 retry. SLA p95 ≤ 12s.**
8. **Bateria de medição cega (CRIT-7).** Quem gera R17+ não é quem escreveu o laudo.

---

## 3. Escopo

### Dentro

#### Onda 1 — código MCP + run-agent + prompt mínimo (cura estimada: 30–50 casos = 21–35%)

Estimativa recalibrada (CRIT-2): assume cura ~40% dos casos atacados (não 100%) e desconta sobreposição de patterns.

##### Onda 1.A — Infraestrutura
- **A1.** Framework `mcp/lib/envelope.ts` com tipo `ToolEnvelope<T>` (ver § 4.2) e helper `buildEnvelope({...})`. **`_RESPOSTA` é gerado por template do tipo `formatador<T>(envelope) → string` registrado por tool** (MED-19/20).
- **A11.** Helper `mcp/lib/periodo.ts` com `resolverPeriodo(periodoNome | from/to)` cobrindo `hoje|amanha|essa_semana|mes_corrente|mes_anterior|mes_passado|ano_corrente|semana_passada` em timezone America/Sao_Paulo.
- **A14 (HIGH-14).** Pipeline de rebuild dos containers `mcp` e `app` integrado ao script de regressão. Antes de cada bateria, `docker compose build mcp app && docker compose up -d mcp app worker`.

##### Onda 1.B — Aplicação do envelope em tools financeiras (alto impacto)
- **A2.** Aplicar em `financeiro_contas_a_pagar`, `financeiro_contas_a_receber`, `financeiro_titulos_vencidos`. Cada uma ganha:
  - `_RESPOSTA: string` (template a partir de `_DESTAQUE`).
  - `_listaTruncada: boolean`.
  - `topPorParticipante: [{nome, soma, n}]` (top 10).
- **A2-fluxo (HIGH-16).** `financeiro_fluxo_caixa` ganha `_RESPOSTA` e `_listaTruncada`, **mas NÃO `topPorParticipante`** (sem semântica para movimento).

##### Onda 1.C — Aplicação em demais domínios (rollout incremental, PRs separados)
PRs separados, cada um cobre 1 domínio (revisão isolada, rollback granular):
- **A3.** Fiscal: `fiscal_notas_emitidas`, `fiscal_notas_recebidas`, `fiscal_notas_recebidas_por_fornecedor`, `fiscal_faturamento_periodo`, `fiscal_faturamento_por_cliente`, `fiscal_apuracao`.
- **A4.** Estoque: `estoque_saldo_produto`, `estoque_top_movimentados`, `estoque_produtos_parados`, `estoque_concentracao`, `estoque_valor_armazem`, `estoque_entradas_saidas`, `estoque_produtos_saldo_zero`.
- **A5.** Comercial: `comercial_pedidos_periodo`, `comercial_pedidos_por_etapa`, `comercial_pedidos_atrasados`, `comercial_parcelas_a_vencer`, `comercial_pedidos_por_vendedor`, `comercial_pedidos_listar_top_valor`. **YAGNI:** `preco_*` ficam de fora desta onda (não aparecem nos 144 casos).
- **A6.** Cadastros: `cadastro_buscar_parceiro` (com `papel`), `cadastro_parceiros_por_uf`, `cadastro_contar_parceiros`. **Pré-requisito (CRIT-6):** spike de research em `raw_res_partner` para determinar como filtrar transportadoras (vide § 7.5).
- **A7.** Contábil: `contabil_plano_de_contas` (full-text via `pg_trgm` com normalização de acentos+plural), `contabil_estrutura_conta`.
- **A8.** Sistema: `registrar_lacuna` (resposta sugerida completa com sugestões inline), `bi_consulta_avancada` (`_RESPOSTA` a partir de `_DESTAQUE`).

##### Onda 1.D — Ajustes pontuais em tools (alto leverage)
- **A9 (HIGH-11).** `estoque_saldo_produto`: match exato quando `termo` é numérico ≥ N dígitos, onde N é determinado por research na tabela `raw_product_product` (vide § 7.5). Se não bater, devolve `ambiguidade.exactMatchRequested: true`.
- **A10 (HIGH-12).** `financeiro_titulos_vencidos.tipo` em **transição 2-fases:**
  - **Fase 1 (Onda 1):** aceita sem `tipo`, devolve `aviso: "tipoSugerido=a_receber"` no envelope, loga chamadas sem `tipo`.
  - **Fase 2 (após R17, se prompt entendeu):** rejeita sem `tipo`.
- **A13 (HIGH-13).** `registrar_lacuna.redirecionar` vira gate **suave**, não hard:
  - Tool retorna `redirecionar: { tool, motivo, confianca: 0..1 }`.
  - Se `confianca >= 0.8`, `run-agent.ts` faz **system message inline** para o LLM no próximo passo: "considere chamar tool X conforme indicado pela tool anterior".
  - Sem `tool_choice` forçado (evita bloqueio).
  - Se LLM ainda não chamar, validador V2 captura caso o número for inventado.
  - Sem loop: gate só dispara 1 vez por turno.

##### Onda 1.E — AutoValidator no `run-agent.ts`
- **A12 (CRIT-1, CRIT-5, HIGH-8, HIGH-9).** Camada de auto-validação:
  - **V1 (anti-truncamento):** rejeita resposta que contém regex
    `/(veio (truncad|cortad|incompleto)|listagem veio (truncad|cortad)|n[ãa]o consegui obter (esse|o)? (total|dado|valor)|sem somat[óo]rio|sem o total fechado)/i`
    **quando algum tool result do turno tem** `_DESTAQUE`, `_RESPOSTA`, `_agregado.*`, `total*`, `previsto*` preenchido.
  - **V2 (anti-invenção):** algoritmo concreto (resolve CRIT-1):
    1. Extrai números monetários (`/R\$\s?[\d.]+(?:,\d+)?/g`) e quantitativos (`/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b\s+(?:pedidos?|notas?|cadastros?|fornecedores?|clientes?|vendedores?|t[íi]tulos?|locais?|armaz[ée]ns?)/gi`) da resposta do LLM.
    2. Para cada número extraído:
       - Se aparece **literal** em algum `_RESPOSTA`, `_DESTAQUE.*`, `_agregado.*`, `total*`, `previsto*`, ou em `linhas[].vrSaldo|valor|qtd|total` → **OK**.
       - Senão, calcula **somas, contagens, médias e percentuais** plausíveis das linhas e verifica se o número bate dentro de ε=1% (tolerância para arredondamento de centavos).
       - Senão, verifica se foi mencionado na **pergunta original** (ex: usuário disse "top 10", "30 dias").
       - Senão, marca como suspeito.
    3. Se ≥1 número suspeito → dispara retry **com hint específico:** "o número X que você citou não está nos resultados nem é soma/contagem das linhas; cite só valores presentes."
    4. **Teste obrigatório:** validador roda contra todas as 281 respostas CORRETO de R11–R16. **0 falsos positivos** antes do merge.
  - **V3 (anti-recusa indevida):** rejeita resposta começando com
    `/^(Não consegui|Essa informação não está disponível|Você tem razão|Não consigo)/i`
    **quando há** `_RESPOSTA` curada **OU** `_DESTAQUE`/`_agregado` preenchido **E** a pergunta original não menciona conceito sem tool (verificado por lista de termos: "meta", "margem", "liquidez", "região", "estado", "marca", "vendedor cadastrado", etc.).
  - **V4 (anti-placeholder em bullet):** rejeita resposta com `/^\s*[-\*]\s.*n[ãa]o consegui obter/m` (bullets de lista contendo "não consegui obter").
  - **Cap rígido: 1 retry.** Se retry **falhar na mesma validação ou em outra**, aceita **o retry** (não a original) — HIGH-8 endereçado.
  - Se retry **crashar** (exceção), aceita **a original**.
  - **Feature flag (CRIT-5):** `AgentSettings.autoValidatorMode: "off"|"shadow"|"active"`:
    - `off`: não roda.
    - `shadow`: roda, loga `retryReason` em `ConversationQualityEvaluation.retryReason`, mas **não dispara retry**.
    - `active`: roda completo.
  - **Flags por validador:** `validatorV1Enabled`, `validatorV2Enabled`, `validatorV3Enabled`, `validatorV4Enabled` (todos default true quando modo ≠ `off`).
  - **Timeout do retry:** 5s hard cap; se exceder, aceita original.

##### Onda 1.F — Prompt mínimo (CRIT-4)
- **B0.** Editar `identity-base.ts` para incluir **uma única adição na Onda 1**:
  > **`_RESPOSTA`:** Se o tool result trouxer campo `_RESPOSTA`, **use-o literalmente como base da sua resposta** (pode adaptar para fluir com a pergunta, mas mantenha todos os números e fatos). É o resultado pré-processado pelo servidor.

  Demais 6 ajustes de prompt ficam para Onda 2.

#### Onda 2 — prompt completo (cura estimada: +10–15 casos = +7–10%)

- **B1.** Editar `identity-base.ts`:
  - § AGREGAÇÃO FORÇADA: "Pergunta quantitativa ('quanto', 'soma de', 'total de') com `_agregado.soma` ou `_RESPOSTA` disponível: nunca responda 'não consegui'."
  - § COMBINAÇÃO DE TOOLS: tom imperativo; adicionar "vendedores cadastrados → `comercial_vendedores_cadastrados`" (que entra em Onda 3).
  - § "Não inventar": "'Não consegui obter' é resposta inteira, não substitui valor dentro de bullet de lista."
  - **Novo § FOLLOW-UP:** "Pergunta curta de continuação ('e do mês passado?'): reuse indicador + tool do turno anterior, ajuste apenas o período."
  - **Novo § DATA RELATIVA:** "Use `periodoNome` em vez de calcular datas. Exemplos: 'amanhã' → `periodoNome: amanha`."
  - § EXTRAÇÃO DE IDENTIFICADORES: checklist de 4 perguntas antes de chamar tool.
  - § TOOLS / Comercial: `comercial_pedidos_por_etapa` separa cancelados/concluídos/em digitação.
- **B2.** Atualizar 2 exemplos do prompt com casos extraídos das rodadas (paráfrases).

#### Onda 3 — tools novas/expansões (cura estimada: +10 casos = +7%)

- **C1.** `fiscal_faturamento_mensal_serie({ano})`.
- **C2.** `cadastro_detalhar_parceiro({participanteId})`.
- **C3.** `comercial_vendedores_cadastrados()`.
- **C4.** `cadastro_parceiros_recentes({periodoDe, periodoAte})`.
- **C5.** `estoque_locais_por_produto({termo})`.
- **C6.** `comercial_pedidos_sem_vendedor({periodoDe, periodoAte})`.

#### Onda 4 — refinos finais (condicional, se R20 < 95%)

Determinado pós-R20 com base em laudo focado.

### Fora

- Mudança de modelo (postergada).
- Tools de meta/margem/liquidez/faturamento por estado/região/marca (FORA_DO_ESCOPO legítimo).
- Atualização do judge → **revisada (MED-21):** acontece como **parte de Onda 1.E** (junto com auto-validator), bumpando `judgeVersion` para `v3-claude-code`. Briefing v3 atualizado para mencionar `_RESPOSTA` e `retryReason`.
- Reformulação UI `/agente/qualidade`.
- F5 (WhatsApp/agente externo).
- Migração de schema de mensagens.

---

## 4. Arquitetura

### 4.1 Diagrama

```
┌──────────────────────────────────────────────────────────────────────┐
│ src/lib/agent/run-agent.ts                                             │
│                                                                         │
│  request → buildContext → buildSystemPrompt                            │
│                                                                         │
│  ┌──── Loop de tool-calls (atual) ────┐                                 │
│  │  LLM call → toolCalls → exec MCP    │                                 │
│  │   ↑                                  │                                 │
│  │   └─ se redirecionar.confianca≥0.8: insere system msg                │
│  │      "considere chamar tool X" (A13)                                  │
│  └────────────────┬─────────────────────┘                                 │
│                   │ mensagem final do LLM                                  │
│                   ▼                                                         │
│  ┌──── AutoValidator (síncrono, flag autoValidatorMode) ──────┐            │
│  │  if mode == "off":  skip                                    │            │
│  │  if mode == "shadow": run V1-V4, log retryReason, no retry  │            │
│  │  if mode == "active": run V1-V4, dispara retry se falhar    │            │
│  │                                                              │            │
│  │  V1 anti-truncamento (checa _DESTAQUE/_RESPOSTA/etc)         │            │
│  │  V2 anti-invenção (números literais OR derivados OR pergunta)│            │
│  │  V3 anti-recusa indevida                                     │            │
│  │  V4 anti-placeholder em bullet                                │            │
│  └─────────────────┬──────────────────────────────────────────────┘            │
│         passou? ───┴── falhou (mode==active e retryCount==0)            │
│           │                       │                                      │
│           │                       ▼                                      │
│           │            LLM retry call (cap=1, hint, timeout 5s)         │
│           │                       │                                      │
│           │            ┌──────────┴──────────┐                          │
│           │            ▼                     ▼                          │
│           │      retry crashou?         retry ok?                       │
│           │            │                     │                          │
│           │            ▼                     ▼                          │
│           │      usa resposta            usa resposta                   │
│           │      original                retry (mesmo se ainda inválida)│
│           ▼                                                              │
│  persistMessage(assistant) + persistMessage(retry tag se houver)        │
│  createPendingEvaluation({retryCount, retryReason, retryHint})          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Servidor MCP (mcp/server.ts)                                           │
│                                                                         │
│  tool exec → helpers:                                                  │
│    mcp/lib/envelope.ts  →  buildEnvelope({                              │
│      dados, formatadorRespostaCanonica, _DESTAQUE, ...                  │
│    })                                                                    │
│    mcp/lib/periodo.ts   →  resolverPeriodo(periodoNome | from/to)       │
│    mcp/lib/agrupador.ts →  topPorParticipante(titulos[], limite=10)     │
│    mcp/lib/responder.ts →  formatadores canônicos por tool              │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tipos canônicos

```typescript
// mcp/lib/envelope.ts
export interface ToolEnvelope<TLinha = unknown> {
  /** Texto pronto descrevendo o resultado, gerado por formatador TS. */
  _RESPOSTA: string;

  /** True só se a lista foi cortada por limite explícito da tool. */
  _listaTruncada: boolean;

  /** Total estruturado destacado. */
  _DESTAQUE?: Record<string, string | number>;

  /** Agregados pré-computados. */
  _agregado?: {
    soma?: number;
    contagem?: number;
    media?: number;
    [k: string]: number | undefined;
  };

  /** Lista paginada. */
  linhas: TLinha[];

  atualizadoEm: string;
  atualizadoHa: string;

  ambiguidade?: {
    requiredExactMatch?: boolean;
    candidatos?: Array<{ id: string; nome: string; contexto?: string }>;
    [k: string]: unknown;
  };

  /** Top por participante (apenas tools financeiras de saldo). */
  topPorParticipante?: Array<{ nome: string; soma: number; n: number }>;

  /** Aviso não-bloqueante (ex: parâmetro sugerido). */
  aviso?: string;

  /** Indicação de tool sugerida em vez desta. */
  redirecionar?: { tool: string; motivo: string; confianca: number };
}

// mcp/lib/responder.ts
export type FormatadorCanonico<TLinha> = (
  envelope: Omit<ToolEnvelope<TLinha>, "_RESPOSTA">,
) => string;

// Exemplo financeiro_contas_a_pagar:
const formatadorContasAPagar: FormatadorCanonico<TituloAPagar> = (env) => {
  const total = env._DESTAQUE?.totalAPagar;
  const n = env._DESTAQUE?.contagem;
  if (total && n) {
    return `Total em aberto a pagar: ${formatBRL(total)} em ${n} títulos.`;
  }
  return "Não há títulos a pagar em aberto no momento.";
};
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
  /** Texto pra usar como instrução do retry. */
  hint: string;
  /** Útil pra observabilidade. */
  detalhe?: string;
}

export function validateResponse(ctx: ValidationContext): ValidationOutcome;

// Helpers específicos exportados pra teste isolado:
export function extrairNumeros(texto: string): NumeroExtraido[];
export function verificaPlausibilidadeDerivada(
  numero: NumeroExtraido,
  linhas: unknown[],
  toleranciaPct: number,
): boolean;
```

**Teste obrigatório antes do merge:** rodar validateResponse contra as **281 respostas CORRETO de R11–R16** (extraídas no laudo). Critério: **0 falsos positivos**. Se >0, ajustar regras antes de prosseguir.

### 4.4 Mudanças no `run-agent.ts`

Pseudocódigo:

```typescript
const finalMsg = ...; // resposta final do LLM
const mode = await getAutoValidatorMode(); // off|shadow|active

let retryCount = 0;
let retryReason: ValidationFailReason = null;
let retryHint: string | null = null;
let acceptedResponse = finalMsg;

if (mode !== "off") {
  const outcome = validateResponse({
    question: args.userMessage,
    llmResponse: finalMsg,
    toolResults: collectedToolResults,
  });

  if (!outcome.ok) {
    retryReason = outcome.reason;
    retryHint = outcome.hint;

    if (mode === "active") {
      retryCount = 1;
      try {
        const retryMsg = await llmCall({
          messages: [...existingMessages, {
            role: "system",
            content: `Sua resposta anterior tinha um problema: ${outcome.hint}. Reescreva.`,
          }],
          timeoutMs: 5000,
        });
        acceptedResponse = retryMsg; // mesmo se ainda inválida (HIGH-8)
      } catch (err) {
        acceptedResponse = finalMsg; // retry crashou
        logger.warn("auto-validator retry crashed", { err });
      }
    }
  }
}

await persistMessage(acceptedResponse);
await createPendingEvaluation({
  ...,
  retryCount,
  retryReason,
  retryHint,
});
```

---

## 5. Schema delta

```prisma
model ConversationQualityEvaluation {
  // ... campos existentes ...

  /// Quantas vezes o auto-validator retentou. 0 ou 1.
  retryCount Int @default(0) @map("retry_count")
  /// V1|V2|V3|V4|null. Validador que disparou.
  retryReason String? @map("retry_reason")
  /// Texto da instrução corretiva usada (null se sem retry).
  retryHint String? @map("retry_hint")
}

model AgentSettings {
  // ... existentes ...

  /// off | shadow | active. Default: off em produção até verificação.
  autoValidatorMode String @default("off") @map("auto_validator_mode")

  validatorV1Enabled Boolean @default(true) @map("validator_v1_enabled")
  validatorV2Enabled Boolean @default(true) @map("validator_v2_enabled")
  validatorV3Enabled Boolean @default(true) @map("validator_v3_enabled")
  validatorV4Enabled Boolean @default(true) @map("validator_v4_enabled")
}
```

Migration aditiva, sem perda.

---

## 6. Plano de testes

### 6.1 Unitários

- `mcp/lib/envelope.test.ts`: cobertura do builder.
- `mcp/lib/periodo.test.ts`: cada `periodoNome` resolve corretamente (incluindo virada de mês, ano bissexto, DST se aplicável).
- `mcp/lib/agrupador.test.ts`: `topPorParticipante` com null, dedupe.
- `mcp/lib/responder.test.ts`: cada formatador canônico (1 teste por tool).
- `src/lib/agent/validation/auto-validator.test.ts`: V1-V4 com casos positivos e negativos:
  - **Mandatório:** rodar contra as 281 respostas CORRETO de R11-R16, ≥99% pass-rate (0 falsos positivos).
  - **Mandatório:** rodar contra os 17 ERRADO e medir quantos disparam — alvo: ≥12 (70%).

### 6.2 Integração

- `mcp/tools/financeiro/contas-a-receber.test.ts`: envelope completo.
- `mcp/tools/estoque/saldo-produto.test.ts`: match exato numérico.
- `src/lib/agent/run-agent.test.ts`: retry dispara quando validator falha (cap=1, modos off/shadow/active).
- `src/lib/agent/run-agent.test.ts`: shadow loga sem retry; active retenta.

### 6.3 End-to-end contra cache real (REGRA DE RAIZ, HIGH-14)

- Script: `scripts/quality-audit/run-regression.ts`.
- Cada onda **rebuilda** os containers afetados antes de rodar:
  ```bash
  docker compose build mcp app worker
  docker compose up -d mcp app worker
  pnpm tsx scripts/quality-audit/run-regression.ts --rodada R17
  ```
- Bateria curada: `scripts/quality-audit/regression-r11-r16.json` com **paráfrases**, não literais.
- Critério: nenhum CORRETO atual pode regredir.

### 6.4 Bateria R17 (medição de Onda 1) — CRIT-7 endereçado

- **Fonte cega:** as 100 perguntas de R17 são geradas por **subagent Opus separado** com prompt isolado, sem acesso ao laudo nem à spec. Subagent recebe apenas: (a) lista de tools disponíveis (catálogo), (b) histórico de turnos de produção (Conversation com title NULL, anonimizado), (c) instrução "produza 100 perguntas operacionais variadas em 6 domínios".
- **Critérios de avaliação escritos antes:** judge briefing v3 congelado antes de R17 rodar. Hash do briefing salvo em `scripts/quality-audit/briefing-v3.lock.json`.
- **Cada pergunta de R17 vem com `dominio_canonico`** definido pelo subagent (HIGH-17).
- **Judge independente:** sub-agent Opus diferente, sem ter lido o laudo. Briefing v3 atualizado com `_RESPOSTA` e `retryReason`.

### 6.5 Benchmark de latência (HIGH-15)

- `scripts/benchmark/agent-latency.ts`: 50 perguntas isoladas, mede p50/p95/p99 com e sem auto-validator.
- Roda antes de cada merge para `main` da Onda 1+.

---

## 7. Não-funcionais

### 7.1 Performance

- `_RESPOSTA` template: <1ms por tool.
- `topPorParticipante`: agregação no Postgres com `GROUP BY` + `LIMIT 10` na query — não custa nada extra (mesma round-trip).
- AutoValidator: <5ms por turno.
- Retry: cap=1, timeout 5s. Estimativa pós-medição: dispara em **5-15%** dos turnos (medido em shadow antes de active).
- SLA: p50 ≤ 6s, p95 ≤ 12s.

### 7.2 Segurança

- Sem novos endpoints expostos.
- Validators não vazam estrutura interna.
- Schema delta interno.
- Feature flags em `AgentSettings` (tabela já gated por super_admin).

### 7.3 Observabilidade

- KPI no `/agente/monitoramento`: `% retry`, `retryReason distribution`.
- Log estruturado `validator.passed` / `validator.failed.{V1|V2|V3|V4}`.
- Métricas Prometheus (se houver) ou pelo menos `console.log` estruturado.

### 7.4 Compatibilidade retroativa

- `_RESPOSTA` aditivo.
- `cadastro_buscar_parceiro.papel` default = "todos".
- `financeiro_titulos_vencidos.tipo`: transição 2-fases (A10).
- `estoque_saldo_produto` match exato: limiar definido por research empírica (CRIT-6).
- `registrar_lacuna.redirecionar`: gate suave, não hard-block.

### 7.5 Tasks de research bloqueadoras (CRIT-6, HIGH-11)

**Antes de iniciar Onda 1.C/D, executar:**

- **R-1.** Query no cache para distribuição de `LENGTH(default_code)` em `raw_product_product`. Determinar limiar de match exato (provavelmente ≥5).
- **R-2.** Verificar se `category_id` (categoria de parceiro) está sincronizada em `raw_res_partner` para suportar filtro "transportadora". Se não estiver, **bloquear A6 transportadora-papel** e devolver tool `cadastro_buscar_parceiro` com `papel` apenas para `cliente|fornecedor|todos`.
- **R-3.** Verificar timeout do n8n no webhook do WhatsApp. Se <15s, considerar reduzir cap de retry timeout para 3s.

---

## 8. Riscos atualizados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|----------------|---------|------------|
| V2 falso positivo derruba taxa de acerto em produção | Alta | Alto | **Teste com 281 respostas CORRETO** (§ 6.1). Modo `shadow` antes de `active`. Métrica de regressão por sub-domínio bloqueia merge. |
| `_RESPOSTA` curado fica engessado / contraproducente | Média | Médio | Formatador é template; LLM ainda pode adaptar (prompt diz "use como base, pode adaptar"). Métrica de regressão. |
| Loop infinito de retry | Baixa | Alto | Cap = 1, timeout 5s, hard-coded. |
| Latência p95 ultrapassa 12s | Média | Médio | Benchmark obrigatório antes do merge. SLA explícito. |
| `financeiro_titulos_vencidos.tipo` quebra integrações externas | Baixa | Alto | Transição 2-fases (A10). |
| `estoque_saldo_produto` exato bloqueia buscas legítimas | Baixa | Médio | Limiar definido por research (R-1). |
| A13 gate cai em loop mascarado | Baixa | Médio | Gate suave (system msg), depth=1, não força tool_choice. |
| WhatsApp timeout estoura | Baixa | Alto | R-3 valida timeout n8n. Cap timeout retry ≤ n8n timeout − 5s. |
| Bateria R17 com viés metodológico | Média (mitigada) | Alto | Subagent cego gera R17 (§ 6.4). Judge independente. |
| Custo de regressão proibitivo (rebuild + 100 turnos × 5s) | Baixa | Baixo | ~10min por rodada. Aceitável. |
| Estimativas otimistas atrasam roadmap | Média | Médio | Critério de rollback explícito (§ 1.2). Conservar 78% como piso da Onda 1. |
| Anexos do laudo poluem repo | Baixa | Baixo | Reavaliar após R17. Se grande, mover para `.gitignored/` com referência por link externo. |

---

## 9. Sequência de execução

### Onda 1.A — Infraestrutura
- PR1: `mcp/lib/envelope.ts` + `mcp/lib/periodo.ts` + `mcp/lib/responder.ts` + `mcp/lib/agrupador.ts` + testes unitários. Sem mudanças em tools ainda.
- **Verificação:** `npx tsc --noEmit && npx eslint mcp/ && npx jest mcp/lib/`. Sem rebuild de container ainda (não toca tools).

### Onda 1.B — Tools financeiras
- PR2: aplica envelope + `topPorParticipante` em `contas_a_pagar`, `contas_a_receber`, `titulos_vencidos`, `fluxo_caixa`. Inclui formatadores canônicos.
- **Verificação:** rebuild `mcp`; rodar regressão financeira (subset dos 31 casos financeiros).

### Onda 1.C — Demais tools (PRs separados)
- PR3: estoque. PR4: fiscal. PR5: comercial. PR6: cadastros. PR7: contábil. PR8: sistema (registrar_lacuna, bi).
- Cada PR rebuilda `mcp` e roda regressão do sub-domínio.

### Onda 1.D — Ajustes pontuais
- PR9: A9 (match exato saldo, com limiar de R-1), A10 fase 1 (titulo vencidos tipo sugerido), A13 (gate suave).
- **Verificação:** regressão completa (100 casos R11-R16 parafraseados).

### Onda 1.E — AutoValidator + prompt mínimo + judge briefing v3
- PR10: schema delta + auto-validator + run-agent + identity-base.ts (apenas regra `_RESPOSTA`) + briefing v3.
- **Verificação obrigatória:**
  1. Validator V1-V4 contra 281 respostas CORRETO → 0 falsos positivos.
  2. Validator contra 17 ERRADO → ≥12 disparam.
  3. Rebuild `mcp app worker`.
  4. Bateria R17 em modo `shadow` → medir `retryRate` esperado entre 5% e 25%, sem mover %CORRETO.
  5. Se R17 shadow OK, promover para `active` e medir %CORRETO ≥ 78%.

### Onda 2 — prompt completo
- PR11: edita `identity-base.ts` com 7 ajustes.
- **Verificação:** R18 ≥ 85%. Se atingiu, continua. Se não, retorna a Onda 1.5.

### Onda 3 — tools novas (1 PR por tool)
- PR12-PR17: uma tool nova por PR.
- **Verificação:** R19 ≥ 89%, R20 ≥ 92% (cumulativo).

### Onda 4 — refinos finais (condicional)
- Pós-R20.

---

## 10. Decisões firmes desta spec

1. AutoValidator síncrono no `run-agent.ts`, com feature flag 3 estados.
2. `_RESPOSTA` gerada por formatador TS template-based (não hardcoded, não LLM).
3. Validador roda no servidor Next, não no MCP.
4. Cap de retry = 1 hard-coded; timeout 5s.
5. Schema delta aditivo (`retryCount`, `retryReason`, `retryHint`, `autoValidatorMode`).
6. R11-R16 viram bateria de regressão parafraseada em `scripts/quality-audit/regression-r11-r16.json`.
7. Tools FORA_DO_ESCOPO legítimo continuam em `registrar_lacuna`.
8. Sem mudança de modelo.
9. Briefing do judge bumpado para v3 junto com Onda 1.E.
10. `topPorParticipante` apenas em 3 tools de saldo financeiro (não fluxo).
11. Rebuild de containers integrado ao script de regressão.
12. Bateria de medição R17+ produzida por subagent cego; judge independente.

---

## 11. Open questions remanescentes

1. **Limiar exato de match numérico em `estoque_saldo_produto`** — depende de R-1.
2. **Suporte a "transportadora" em `cadastro_buscar_parceiro.papel`** — depende de R-2.
3. **Timeout do n8n no WhatsApp** — depende de R-3.
4. **`_RESPOSTA` deveria suportar variantes por intent (total/lista/comparação)?** Para v3 da spec se for o caso; v2 mantém string única com template parametrizado.
5. **Onde armazenar o JSONL dos anexos a longo prazo?** Reavaliar após R17.
6. **Judge briefing v3 deve mencionar especificamente `retryReason` para o auditor pesar?** Provavelmente sim (ajuda a separar erro do LLM vs erro do validador). Decidir antes de R17.

---

## 12. Anexos

- **Laudo:** `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`
- **Detalhe ERRADO:** `anexos-laudo-r11-r16/detail2_ERRADO.md`
- **Detalhe PARCIAL:** `anexos-laudo-r11-r16/detail2_PARCIAL.md`
- **Detalhe FORA_DO_ESCOPO:** `anexos-laudo-r11-r16/detail2_FORA_DO_ESCOPO.md`
- **Input JSONL:** `anexos-laudo-r11-r16/cases_v2.jsonl`
- **Review v1:** `docs/superpowers/specs/reviews/2026-05-27-agente-nex-90pct-spec-review-1.md`

## 13. Mapping de fix por caso (cobertura caso-a-caso, MED-24)

Tabela CSV separada em `docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv` a produzir durante o PLAN (antes da execução), formato:

```
evalId, rodada, status, pattern_principal, fixes_aplicaveis, onda, prob_cura
```

Permite que a regressão valide caso a caso (não só agregado).
