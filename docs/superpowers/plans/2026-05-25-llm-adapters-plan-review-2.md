# Review Adversarial #2 - PLAN v2 (Modernização adapters LLM)

**Data:** 2026-05-25
**Plan revisado:** `2026-05-25-llm-adapters-modernization-plan.md` (v2)
**Reviewer:** Claude (auditoria adversarial profunda)
**Foco:** o que sobrou após Review #1 ser aplicada.

> Critério: aplicar achados em PLAN v3 (final).

---

## Sumário

Encontrados **6 achados** materiais (2 críticos, 4 menores). A v2
está executável; achados são polish e completude.

---

## Críticos

### PR2-CRIT-1: T1.2 `effortToBudget` com `effort="auto"`

**Onde:** T1.2.

**Achado:** Spec §4.1 inclui `"auto"` em `ReasoningEffort`. Plan v2
não define o que `effortToBudget(model, "auto")` retorna. Adapter
Anthropic precisa de algum valor para `budget_tokens` mesmo em
modo adaptive (a doc Anthropic diz que budget é teto).

**Demanda:** especificar:

```ts
// effortToBudget mapping (todos clampados a budgetRange ?? [0, MAX_SAFE])
const baseFraction = {
  minimal: 0.0,
  low: 0.2,
  medium: 0.5,
  high: 1.0,
  auto: 1.0, // assume teto alto para deixar provider decidir
};
```

Adicionar teste em T1.5: `effortToBudget("claude-opus-4-7", "auto")`
retorna `budgetRange[1]` (24000).

---

### PR2-CRIT-2: Spikes T0.x — destino dos arquivos

**Onde:** Onda 0.

**Achado:** Plan diz "scripts/spike-*.ts (descartável)" mas não
documenta:
- Se commitar ou não.
- Quando deletar.
- Onde os snapshots de output ficam (`docs/spikes/` foi mencionado
  em T0.2 e T0.3 mas não T0.1).

**Demanda:** padrão único:

> Scripts ficam em `scripts/` e **NÃO são commitados** (adicionar
> `scripts/spike-*.ts` ao `.gitignore` se ainda não estiver).
> Snapshots de output ficam em `docs/spikes/2026-05-25-<provider>-<topic>.{md,json,txt}`
> **são commitados** (evidência de decisão). T8.9 limpa os scripts
> mas mantém os snapshots.

---

## Menores

### PR2-MIN-3: T5.5 dependência de T5.0 não-bloqueante

**Demanda:** documentar dependência explícita:

> **T5.5 - bloqueada por T5.0**: só executar após T5.0 confirmar
> presença de `thoughtSignature` mesmo com `includeThoughts:false`.

### PR2-MIN-4: T7.1 invocação da skill `ui-ux-pro-max`

**Demanda:** documentar a chamada literal:

```
Skill skill="ui-ux-pro-max" args="Componente: ReasoningCard. 5 estados a desenhar: no_reasoning, blocked_by_tools, auto_only, adaptive_with_ceiling, custom. Preciso de microcopy, hierarquia visual, cor/cursor/aria para disabled, animação de transição entre estados quando modelo muda."
```

E task de **registrar o output** da skill em
`docs/superpowers/specs/2026-05-25-reasoning-card-ui-design.md`.

### PR2-MIN-5: T8.3 ambiente da verificação

**Demanda:** explicitar:

> Verificação real roda contra **DB local** (`nexus_odoo_l1`) e
> backend local (`localhost:3000`). Produção (`grupojht.tauga.online`)
> NÃO é tocada até push em main. Para validar produção: PR para main
> e observar logs do redeploy.

### PR2-MIN-6: Credenciais para M3/M4/M7 — task de preparação

**Demanda:** adicionar **T8.2.1** antes de T8.3:

> Para cada credencial faltante:
> - Anthropic: criar credencial em `/agente/chaves` se Anthropic key
>   disponível.
> - Gemini: idem.
> - OpenRouter: idem.
> Se ausente, marcar M correspondente como "pulado por falta de
> credencial" no relatório de verificação, sem falhar a entrega.

---

## Validação positiva

- Decomposição agora cobre dependências de spike.
- Tasks de mock (T2.0) e infra UI (T7.0) entregam o que faltava.
- Branches A/B em T6.1 cobrem incerteza.

---

## Decisão de saída

**Plan v2 aprovado com 6 ajustes pontuais.** Aplicar em **PLAN v3**.
Plan v3 inicia execução.

Ajustes:
1. `effortToBudget("auto")` = teto do range.
2. Padrão de spikes documentado (scripts não-commit, snapshots sim).
3. T5.0 bloqueia T5.5.
4. T7.1 com chamada literal da skill.
5. T8.3 esclarece ambiente local.
6. T8.2.1 prepara credenciais.
