# SPEC v3 — Agente Nex: Caminho para ≥90% de Acerto

**Data:** 2026-05-27
**Autor:** Claude Code (Opus 4.7)
**Branch:** `feat/agente-nex-90pct`
**Status:** v3 (incorpora achados Review #1 e Review #2)
**Laudo-fonte:** `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`
**Reviews:** `reviews/2026-05-27-agente-nex-90pct-spec-review-1.md` (24 achados) + `reviews/2026-05-27-agente-nex-90pct-spec-review-2.md` (19 achados)

---

## 1. Objetivo

Elevar a assertividade do Agente Nex de **65–75%** (média R11–R16) para **≥85% após Onda 1.5, ≥89% após Onda 2 (prompt), com meta final ≥95% após Onda 3 + 4**, em incrementos seguros, mensuráveis e auditáveis. Mover lógica do LLM (`gpt-5.4-mini`) para servidor MCP sempre que possível.

### 1.1 Metas calibradas (CRIT-F endereçado)

Bandas conservadoras com base em histórico do projeto (Ondas A-D entregaram ~2-5pp cada):

| Marco | %CORRETO esperado (banda) | Piso de gating | Como medir |
|-------|----------------------------|------------------|------------|
| Baseline (R11-R16 média) | 71% | — | — |
| Saída Onda 1 (shadow) | 71-78% | **74%** | R17 com validator em shadow |
| Saída Onda 1.5 (active + prompt fix data) | 76-85% | **78%** | R17/R18 active |
| Saída Onda 2 (prompt completo) | 81-89% | **83%** | R19 |
| Saída Onda 3 (tools novas) | 85-93% | **88%** | R20 |
| Saída Onda 4 (tuning + few-shot) | 90-95%+ | **93%** | R21 |

**Critério multi-domínio (HIGH-17 v1 mantido):** cada pergunta em Rxx vem com `dominio_canonico` (estoque/financeiro/fiscal/comercial/cadastros/contábil/cross). Nenhum sub-domínio pode regredir mais de **−2 pp** vs rodada anterior (cross: −5 pp).

**SLA (HIGH-L v2 endereçado):** p50 ≤ 6s, p95 ≤ 12s. Mecanismo automático: se p95 do dia anterior > 12s, sistema move `autoValidatorMode` de `active` para `shadow` automaticamente.

### 1.2 Critério de rollback (HIGH-18 v1)

| %CORRETO em R17 | Ação |
|------------------|------|
| ≥ 78% | Promove validator de shadow → active (Onda 1.5) |
| 74-78% | Mantém em shadow, ajusta regex de validadores, re-roda R17 |
| 70-74% | Roll-forward parcial: mantém envelope/tools, desliga validator, reavalia |
| < 70% | **Rollback total**: PR10 e schema delta revertidos; novo laudo focado |

---

## 2. Princípios de design

1. **Determinismo > LLM.**
2. **Tool entrega resposta pronta** via formatador TS template-based parametrizado.
3. **Auto-validação com 3 estados** (off → shadow → active), flags por validador.
4. **Prompt cirúrgico em paralelo** (regra `_RESPOSTA` entra em Onda 1).
5. **Compatibilidade retroativa.**
6. **Observabilidade desde o dia 1.**
7. **Cap de retry = 1**, timeout 3s (HIGH-L v2 endereçado).
8. **Bateria R17 com cegamento estruturado** (CRIT-B v2 endereçado).
9. **Plano de medição A/B por validador** antes de promover para active (HIGH-I v2 endereçado).

---

## 3. Escopo

### Dentro

#### Onda 1 — Infraestrutura, envelope, validador shadow (estimativa: 6-9 dias úteis)

##### Onda 1.A — Infraestrutura (1-2 dias)
- **A1.** `mcp/lib/envelope.ts` + tipo `ToolEnvelope<T>`.
- **A11.** `mcp/lib/periodo.ts`.
- **A14.** Script `scripts/quality-audit/run-regression.ts` que: (1) faz `docker compose build mcp app worker`, (2) checa exit code, (3) sobe containers, (4) roda bateria, (5) coleta resultados.
- **A1.5 (HIGH-H v2 endereçado).** `mcp/lib/responder.ts` com **tabela de formatadores por tool** — todos os 25 esqueletos enumerados em § 4.5.

##### Onda 1.B — Tools financeiras (1 dia)
- **A2.** Envelope + `topPorParticipante` em `contas_a_pagar`, `contas_a_receber`, `titulos_vencidos`.
- **A2-fluxo.** `fluxo_caixa` ganha envelope **sem** `topPorParticipante`.

##### Onda 1.C — Demais tools (2-3 dias, PRs separados)
- **A3-A8** por domínio (fiscal, estoque, comercial, cadastros, contábil, sistema).

##### Onda 1.D — Ajustes pontuais (1 dia)
- **A9, A10 fase 1, A13.**

##### Onda 1.E — AutoValidator + prompt mínimo + briefing v3 (2-3 dias)
- **A12** com algoritmo V2 **concreto** (§ 4.3, CRIT-A v2 endereçado).
- **B0** prompt mínimo (regra `_RESPOSTA`).
- **Briefing v3** anexo completo (§ 4.6, CRIT-D v2 endereçado).
- **Schema delta** (`retryCount`, `retryReason`, `retryHint`, `autoValidatorMode` + flags).

#### Onda 1.5 — Promoção shadow → active + fix `data relativa` (1 dia)
- Após validar resultados shadow + ativar prompt rule de `periodoNome` (B1 partial).

#### Onda 2 — prompt completo (1 dia)
- **B1** edits restantes em `identity-base.ts`.

#### Onda 3 — tools novas (2-3 dias)
- **C1-C6** (6 PRs, 1 por tool).

#### Onda 4 — refinos finais (condicional, 1-2 dias)

### Fora (mantido v2)

- Mudança de modelo.
- Tools de meta/margem/liquidez/etc.
- Reformulação UI `/agente/qualidade`.
- F5 WhatsApp.
- Migração schema de mensagens.

---

## 4. Arquitetura

### 4.1 Diagrama (mantido v2 com ajustes)

Vide v2 § 4.1 — sem mudança estrutural.

### 4.2 Tipos canônicos (mantido v2)

Vide v2 § 4.2 — adicionado:

```typescript
// Lista de cálculos canônicos por tool, registrada em mcp/lib/responder.ts
export interface CalculoCanonico {
  nome: string;          // ex: "soma_vrSaldo"
  computar: (linhas: any[], filtros?: any) => number;
}

// Exemplo:
const CALCS_CONTAS_A_RECEBER: CalculoCanonico[] = [
  { nome: "soma_vrSaldo", computar: (l) => l.reduce((s,r)=>s+r.vrSaldo,0) },
  { nome: "contagem", computar: (l) => l.length },
  { nome: "media_vrSaldo", computar: (l) => l.reduce((s,r)=>s+r.vrSaldo,0) / l.length },
  { nome: "max_vrSaldo", computar: (l) => Math.max(...l.map(r=>r.vrSaldo)) },
  { nome: "soma_vrSaldo_vencidos", computar: (l) => l.filter(r=>r.diasAtraso>0).reduce((s,r)=>s+r.vrSaldo,0) },
  { nome: "contagem_distinct_participante", computar: (l) => new Set(l.map(r=>r.participanteNome)).size },
  // top 5/10/20:
  { nome: "soma_top5_vrSaldo", computar: (l) => [...l].sort((a,b)=>b.vrSaldo-a.vrSaldo).slice(0,5).reduce((s,r)=>s+r.vrSaldo,0) },
  // ... etc
];
```

Cada tool tem **conjunto finito** de cálculos canônicos enumerados. V2 verifica apenas esses (CRIT-A v2 endereçado).

### 4.3 AutoValidator (CRIT-A v2 endereçado)

```typescript
// src/lib/agent/validation/auto-validator.ts

export interface ValidationContext {
  question: string;
  llmResponse: string;
  toolResults: ToolEnvelope[];
  /** Para cada toolResult, o conjunto de cálculos canônicos disponíveis */
  calcsCanonicos: Map<string, CalculoCanonico[]>;
}

export type ValidationFailReason = "V1" | "V2" | "V3" | "V4" | null;

export interface ValidationOutcome {
  ok: boolean;
  reason: ValidationFailReason;
  hint: string;
  detalhe: string; // categorizado, sem PII (HIGH-K v2)
}

export function validateResponse(ctx: ValidationContext): ValidationOutcome;

// V2 algoritmo concreto:
function validateV2(ctx: ValidationContext): ValidationOutcome | null {
  const numeros = extrairNumeros(ctx.llmResponse);
  for (const num of numeros) {
    // 1. Literal em envelope?
    if (apareceLiteralEmEnvelope(num, ctx.toolResults)) continue;
    // 2. Mencionado na pergunta original?
    if (apareceNaPergunta(num, ctx.question)) continue;
    // 3. Cálculo canônico bate (ε = R$0,01 + 0,1%)?
    if (bateComCalculoCanonico(num, ctx)) continue;
    // Falhou.
    return {
      ok: false,
      reason: "V2",
      hint: `O número ${num.texto} que você citou não está nos resultados nem é um cálculo derivado das linhas. Cite só valores presentes.`,
      detalhe: `V2:numero_nao_derivado:${num.tipo}`,
    };
  }
  return null;
}

function bateComCalculoCanonico(num: NumeroExtraido, ctx: ValidationContext): boolean {
  const TOLERANCIA = Math.max(0.01, num.valor * 0.001); // R$0,01 ou 0,1%
  for (const [toolName, calcs] of ctx.calcsCanonicos) {
    const linhas = ctx.toolResults.find(t => t.toolName === toolName)?.linhas ?? [];
    for (const calc of calcs) {
      try {
        const resultado = calc.computar(linhas);
        if (Math.abs(resultado - num.valor) <= TOLERANCIA) return true;
      } catch { /* skip */ }
    }
  }
  return false;
}
```

**Teste mandatório antes do merge (HIGH-G v2 endereçado):**
1. Rodar `validateResponse` contra **as 281 respostas CORRETO** de R11-R16. Critério: **0 falsos positivos**.
2. Adicional: rodar contra **base completa de CORRETO histórico** (~4914 rows com `aderencia >= 4`). Critério: **≤ 0,5% FP rate**.
3. Rodar contra **17 ERRADO**. Critério: **≥ 12 disparam (≥70% true positive rate)**.

### 4.4 Mudanças no `run-agent.ts` (HIGH-L v2 endereçado)

```typescript
// timeout retry reduzido para 3s (margem do SLA p95)
const retryMsg = await llmCall({
  messages: [...existingMessages, {
    role: "system",
    content: `Sua resposta anterior tinha um problema: ${outcome.hint}. Reescreva.`,
  }],
  timeoutMs: 3000, // <- 3s (era 5s na v2)
});
```

Demais aspectos mantidos da v2.

### 4.5 Tabela de formatadores `_RESPOSTA` por tool (HIGH-H v2 endereçado)

| Tool | Esqueleto `_RESPOSTA` | Campos `_DESTAQUE` usados |
|------|------------------------|----------------------------|
| `financeiro_contas_a_pagar` | "Total em aberto a pagar: R$ X em N títulos. Maior fornecedor: Y (R$ Z)." | totalAPagar, contagem, topParticipante[0] |
| `financeiro_contas_a_receber` | "Total em aberto a receber: R$ X em N títulos. Maior cliente: Y (R$ Z)." | totalAReceber, contagem, topParticipante[0] |
| `financeiro_titulos_vencidos` | "Total vencido ({tipo}): R$ X em N títulos. Maior atraso: P dias." | totalVencido, contagem, maxDiasAtraso |
| `financeiro_fluxo_caixa` | "No período: previsto entrar R$ X, previsto sair R$ Y, saldo previsto R$ Z." | previstoEntradas, previstoSaidas |
| `financeiro_saldo_contas` | "Saldo total das contas: R$ X em N contas." | saldoTotal, contagem |
| `financeiro_caixa_periodo` | "Caixa realizado no período: entradas R$ X, saídas R$ Y, saldo R$ Z." | entradas, saidas |
| `fiscal_faturamento_periodo` | "Faturamento no período: R$ X em N notas." | valorTotal, totalNotas |
| `fiscal_faturamento_por_cliente` | "Top cliente: Y com R$ X. Total: R$ Z em N clientes." | topCliente, totalGeral |
| `fiscal_notas_emitidas` | "N notas emitidas no período, total R$ X." | totalNotas, valorTotal |
| `fiscal_notas_recebidas` | "N notas recebidas no período, total R$ X." | totalNotas, valorTotal |
| `fiscal_notas_recebidas_por_fornecedor` | "Do fornecedor Y: N notas totalizando R$ X." | totalNotas, totalAgregado, fornecedor |
| `fiscal_apuracao` | "Apuração {tipo} {periodo}: R$ X a recolher, R$ Y saldo credor." | tipo, periodo, aRecolher, saldoCredor |
| `fiscal_produtos_faturados` | "Top produto faturado: Y com R$ X em N unidades." | topProduto, valorTotal |
| `fiscal_impostos_periodo` | "Impostos no período: R$ X total." | totalImpostos |
| `estoque_saldo_produto` | "Saldo de Y: N unidades em K locais (R$ X)." OU "Não encontrei Y exato. {Listagem ambígua}." | produto, saldoTotal, numLocais, valorTotal OU ambiguidade |
| `estoque_top_movimentados` | "Top {N} produtos movimentados no período. Maior: Y (M movimentos)." | topProduto |
| `estoque_produtos_parados` | "N produtos parados, R$ X imobilizados." | totalProdutos, valorImobilizado |
| `estoque_produtos_saldo_zero` | "N produtos com saldo zero." | totalProdutos |
| `estoque_concentracao` | "Gini do estoque: G. Top {N} produtos concentram P% do valor." | gini, topNPercentual |
| `estoque_valor_armazem` | "Valor total em estoque: R$ X em N armazéns." | valorTotal, contagemArmazens |
| `estoque_entradas_saidas` | "No período: entradas N produtos, saídas M produtos." | entradas, saidas |
| `comercial_pedidos_periodo` | "No período: N pedidos, valor total R$ X." | totalPedidos, valorTotal |
| `comercial_pedidos_por_etapa` | "Pedidos por etapa: {etapa1: N, valor R$}, {etapa2: ...}. Total: N pedidos." | etapas[], totalGeral |
| `comercial_pedidos_atrasados` | "N pedidos atrasados, R$ X em risco. Maior atraso: P dias." | totalAtrasados, valorEmRisco, maxDias |
| `comercial_parcelas_a_vencer` | "N parcelas a vencer em {janela}, total R$ X." | totalParcelas, valorTotal |
| `comercial_pedidos_por_vendedor` | "Top vendedor: Y com R$ X em N pedidos." | topVendedor, valorTopVendedor |
| `comercial_pedidos_listar_top_valor` | "Top N pedidos por valor. Maior: pedido Y com R$ X." | topPedido, valorTopPedido |
| `preco_produto` | "Preço de Y: R$ X (lista de regras: N)." | precoBase, regras |
| `preco_tabela` | "Tabela Y: N regras." | nomeTabela, totalRegras |
| `cadastro_buscar_parceiro` | "N parceiros encontrados com termo Y." OU "{1 parceiro: Z, doc W, papel P, ativo}." | totalEncontrados, parceiro |
| `cadastro_parceiros_por_uf` | "Distribuição por UF: top {UF: N}. N total com UF, M sem UF." | topUF, totalComUF, totalSemUF |
| `cadastro_contar_parceiros` | "Total: N parceiros, {X clientes, Y fornecedores, Z ativos}." | total, totalClientes, totalFornecedores, totalAtivos |
| `contabil_plano_de_contas` | "Conta {codigo} - {nome}." OU "{N contas} encontradas com termo Y." | conta OU listaContas |
| `contabil_estrutura_conta` | "Conta {codigo} - {nome}: {N filhos diretos, X movimentos}." | codigo, nome, totalFilhos |
| `registrar_lacuna` | "{respostaSugerida completa, com [[suggestions]]:...|...|...}" | respostaSugerida + sugestoesRelacionadas inline |
| `bi_consulta_avancada` | "{Resumo do _DESTAQUE: total/contagem/etc.}." | _DESTAQUE livre |

Cada formatador tem `≤ 500 chars` hard cap (MED-19 v1).

### 4.6 Briefing v3 do judge (anexo, CRIT-D v2 endereçado)

Arquivo separado: `scripts/quality-audit/SUBAGENT-BRIEFING-POS-V3.md`. Conteúdo (resumo):

**Novos patterns positivos (judge adiciona se aplicável):**
- `usou_resposta_canonica`: LLM usou texto do `_RESPOSTA` como base da resposta.
- `usou_top_por_participante`: LLM citou `topPorParticipante` apropriadamente.
- `usou_periodo_nome`: LLM usou `periodoNome` em vez de calcular data.
- `acertou_apos_retry`: V1-V4 disparou, retry resolveu.

**Novo pattern negativo:**
- `ignorou_resposta_canonica`: `_RESPOSTA` existia mas LLM divergiu em fatos.

**Regras envolvendo `retryReason`:**
1. **`retryReason != null && resposta final está CORRETO`** → marca `acertou_apos_retry`. Conta para %CORRETO. Sinal de validator efetivo.
2. **`retryReason != null && resposta final está ERRADO`** → conta para %ERRADO. Investigar se retry piorou (raro mas possível).
3. **`retryReason != null && resposta original (antes do retry) já estava CORRETO`** → marca `falso_positivo_validador`. Sinal pra ajustar regex.

**Briefing v3 congelado** (`briefing-v3.lock.json` com SHA-256 antes de R17 rodar).

### 4.7 Roteiro de ativação em produção (HIGH-N v2 endereçado)

1. PR10 mergiado → schema delta + `autoValidatorMode = "off"`.
2. Super_admin habilita `shadow` via UI `/agente/configuracao` campo `autoValidatorMode`.
3. Aguarda 48h em shadow.
4. Verifica:
   - `retryRate ∈ [5%, 25%]`.
   - `retryReason distribution` razoável (V2 ≤ 60%, V1 ≤ 30%, V3+V4 ≤ 10%).
   - Sem alertas de `falso_positivo_validador` no `/agente/monitoramento`.
5. Se OK, promove para `active`.
6. **Kill switch automático:** job diário verifica `p95_24h`. Se > 12s, move automaticamente para `shadow` e dispara notificação.

### 4.8 Plano A/B de validadores (HIGH-I v2 endereçado)

Antes de promover Onda 1 para `active`, rodar R17 4x em `shadow`:
- Configuração 1: só V1 ativo.
- Configuração 2: só V2 ativo.
- Configuração 3: só V3 ativo.
- Configuração 4: só V4 ativo.

Medir `retryRate` em cada configuração. Decide quais validadores ligar (todos vs subset).

---

## 5. Schema delta (mantido v2 com pequenos ajustes)

```prisma
model ConversationQualityEvaluation {
  // ... existentes ...

  retryCount Int @default(0) @map("retry_count")
  retryReason String? @map("retry_reason")
  /** Detalhe categorizado, sem PII. Ex: "V2:numero_nao_derivado:moeda" */
  retryDetail String? @map("retry_detail")
}

model AgentSettings {
  // ... existentes ...

  autoValidatorMode String @default("off") @map("auto_validator_mode")
  validatorV1Enabled Boolean @default(true) @map("validator_v1_enabled")
  validatorV2Enabled Boolean @default(true) @map("validator_v2_enabled")
  validatorV3Enabled Boolean @default(true) @map("validator_v3_enabled")
  validatorV4Enabled Boolean @default(true) @map("validator_v4_enabled")
}
```

**`retryHint` substituído por `retryDetail`** categorizado (HIGH-K v2 endereçado, sem texto livre, sem PII).

---

## 6. Plano de testes

### 6.1 Unitários (mantido v2)

### 6.2 Integração (mantido v2)

### 6.3 E2E contra cache real (mantido v2)

### 6.4 Bateria R17 — composição (MED-P v2 + CRIT-B v2 endereçados)

**Composição definida:**
- **30 perguntas inéditas** geradas pelo **usuário humano** (você) — operacionais, em 6 domínios, sem revisar laudo/spec.
- **70 perguntas parafraseadas** dos R11-R16, geradas por subagent Opus chamado com:
  - `subagent_type=Plan` (sem context da conversa atual).
  - Input: lista de 100 perguntas originais + instrução "reescreva cada uma com variação de fraseado, mantendo intent semântica. Não mude o domínio canônico."
  - **Output esperado:** 70 paráfrases + `dominio_canonico` por pergunta.

**Judge:**
- Subagent Opus diferente, com `subagent_type=Plan`, recebe **briefing v3 congelado** apenas (sem laudo, sem spec).
- **Cross-check opcional:** repetir avaliação com GPT-4 ou Gemini via API externa para 10% da bateria (10 turnos), comparar concordância. Se < 80% concordância, levantar bandeira.

### 6.5 Benchmark de latência (mantido v2)

---

## 7. Não-funcionais (mantido v2 com timeouts ajustados)

- Retry timeout: **3s** (era 5s).
- Estimativa de `retryRate`: **medir em shadow antes de definir** (MED-O v2).

### 7.5 Research tasks bloqueadoras (mantido v2)

- R-1, R-2, R-3 como spike antes da Onda 1.C/D.

---

## 8. Riscos (mantido v2 com adições)

Vide v2 § 8 + adições:

- **V2 falso positivo derruba prod:** mitigação adicional — teste contra 4914 CORRETO históricos com FP rate ≤ 0,5%.
- **A13 gate suave ignorado pelo LLM:** monitorar `gateRedirectFollowed` em `McpAuditLog`. Se < 60%, escalar para `tool_choice` forçado em Onda 1.6.
- **Lista de termos V3 cresce sem mecanismo:** dívida técnica registrada (HIGH-J v2). v3 mantém hardcoded; futuro pode mover para `AgentForbiddenTerms`.
- **R17 produzido por subagent não totalmente cego (CRIT-B v2):** mitigação parcial — 30 perguntas humanas + cross-check opcional com judge externo. Risco residual aceito.

---

## 9. Sequência de execução com estimativa de tempo (CRIT-C v2 endereçado)

| Onda | PR | Conteúdo | Duração (dias úteis) | Bloqueadores |
|------|-----|-----------|------------------------|----------------|
| 1.A | PR1 | Framework `envelope`/`periodo`/`responder`/`agrupador` + testes | 1-2 | — |
| 1.B | PR2 | Tools financeiras (4) | 1 | PR1 |
| 1.C | PR3 | Fiscal | 0.5 | PR1 |
| 1.C | PR4 | Estoque | 0.5 | PR1 |
| 1.C | PR5 | Comercial | 0.5 | PR1 |
| 1.C | PR6 | Cadastros (depende de R-1, R-2) | 0.5 | PR1 + research |
| 1.C | PR7 | Contábil | 0.5 | PR1 |
| 1.C | PR8 | Sistema (registrar_lacuna, bi) | 0.5 | PR1 |
| 1.D | PR9 | A9, A10 fase 1, A13 (precisa de R-1, R-3) | 1 | PR4, PR8, research |
| 1.E | PR10 | AutoValidator + schema delta + prompt mínimo + briefing v3 | 2-3 | PR2-PR9, briefing-v3.lock.json criado |
| — | — | Aguardar 48h shadow + verificar shadow dashboard + A/B de validadores | 2-3 (calendar, não úteis) | PR10 |
| 1.5 | PR11 | Promover para active + prompt fix de `periodoNome` | 0.5 | shadow validado |
| 2 | PR12 | Edits completos `identity-base.ts` | 1 | PR11 |
| 3 | PR13-PR18 | 6 tools novas | 2-3 | PR12 |
| 4 | PR19+ | Refinos condicionais | 1-2 | R20 measure |

**Total estimado: 10-15 dias úteis de trabalho focado (sem paralelização — CLAUDE.md proíbe Sonnet).**

Após cada bateria (R17, R18, R19, R20), pode haver iteração curta (1-2 dias) para ajustar antes da próxima onda.

**Dependências formais entre PRs (CRIT-E v2 endereçado):**
- PR2-PR8 dependem de PR1.
- PR9 depende de PR4 e PR8 + research R-1, R-3.
- PR6 depende de research R-2.
- PR10 depende de TODOS os PRs anteriores E `briefing-v3.lock.json`.
- Rastreamento via `TaskUpdate` com `addBlockedBy` no plano.

---

## 10. Decisões firmes desta SPEC v3

Mantidas da v2 + adicionadas:

1-12. Mantidas da v2.
13. Retry timeout = 3s (não 5s).
14. `retryHint` substituído por `retryDetail` categorizado.
15. Conjunto **finito** de cálculos canônicos por tool em `mcp/lib/responder.ts`.
16. Bateria R17 = 30 perguntas humanas + 70 paráfrases de subagent + judge subagent isolado.
17. Briefing v3 congelado por hash antes de R17.
18. Roteiro de ativação shadow → active manual, kill switch automático para p95.
19. A/B de validadores antes de active.
20. Estimativa de tempo formalizada.
21. PR10 bloqueado por todos os PRs 1-9 (formal via TaskUpdate).
22. Bandas de %CORRETO em vez de single point.

---

## 11. Open questions remanescentes

1. Limiar exato de match numérico em `estoque_saldo_produto` — depende de R-1.
2. Suporte a "transportadora" — depende de R-2.
3. Timeout do n8n — depende de R-3.
4. `_RESPOSTA` deveria suportar variantes por intent? **v3 mantém string única com template parametrizado**; reavaliar pós-R17 se necessário.
5. Mecanismo de evolução de `AgentForbiddenTerms` — **dívida técnica registrada**, fora desta spec.
6. Onde armazenar JSONL de anexos a longo prazo — reavaliar pós-R17.
7. Briefing v3 deve mencionar `retryReason` explicitamente para auditor — **sim, incluído em § 4.6**.
8. Concordância entre judges (Opus interno vs GPT-4 externo) — **mensurar mas não bloqueante**.

---

## 12. Anexos

- Laudo: `docs/superpowers/research/2026-05-27-laudo-agente-nex-r11-r16.md`
- Detalhe casos: `anexos-laudo-r11-r16/*.md`
- Input JSONL: `anexos-laudo-r11-r16/cases_v2.jsonl`
- Review #1: `reviews/2026-05-27-agente-nex-90pct-spec-review-1.md`
- Review #2: `reviews/2026-05-27-agente-nex-90pct-spec-review-2.md`

## 13. Mapping de fix por caso

Tabela CSV em `docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv` — **a produzir no PLAN** (antes da execução de PR2). Formato:

```
evalId, rodada, status, pattern_principal, fixes_aplicaveis, onda, prob_cura_pct
```

Será usada pela regressão para validar caso a caso.

---

## 14. Próximo passo

SPEC v3 fechada. Iniciar PLAN v1 via `superpowers:writing-plans`, sobre esta spec, com decomposição máxima (PR-level + task-level dentro de cada PR). Plan recebe 2 reviews adversariais (v2, v3) antes da execução de PR1.
