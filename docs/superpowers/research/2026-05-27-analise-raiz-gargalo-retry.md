# Análise raiz — gargalo do retry rate 41% na R17

**Data:** 2026-05-27
**Pergunta:** por que o LLM "erra direto" em 41% das respostas e o AutoValidator precisa corrigir?

## Dados

41/100 turnos da R17 dispararam o validator. Distribuição:
- **V2 (anti-invenção): 35 casos**
- **V3 (anti-recusa): 6 casos**
- **V1, V4: 0**

## Achados (após inspeção turno-a-turno)

### Achado #1 — Freshness textual era o motor principal (~28 dos 35 V2)

O prompt antigo (§6 pré-Bloco A) **mandava** o LLM emitir `(atualizado há X)` em quase toda resposta. O V2 extraía números como "22" (em "atualizado há 22h"), não achava nos toolResults → retry. Exemplos:

- "Pedidos cancelados esse mês" → "...Atualizado há **22h**." → V2 extraía "22h" → fired
- "Conta corrente principal qual o saldo?" → "...saldo consolidado é **R$ -24.242.300,29** (atualizado há **22h**)." → fired

**Pré-Bloco A:** ~28 retries eram esse padrão. **Não era LLM errando o conteúdo — era LLM seguindo a regra antiga.**

**Pós-Bloco A:** prompt PROÍBE freshness textual + `stripFreshnessFromText` no run-agent. Esses retries somem.

### Achado #2 — `array.length` não era aceito como valor derivado (~5 dos 35 V2)

V2 verificava se valores estavam em `_DESTAQUE`/`_agregado`/campos das linhas, **mas não considerava `array.length`**. Casos:

- "Quantos pedidos abertos temos?" → "**1.571 pedidos** em **47 etapas**" — 1571 está em `_DESTAQUE.totalGeral` (OK), mas **47** é `linhas.length` → V2 fired indevidamente.
- "Resume o financeiro pra mim" → cita números agregados que somam campos diferentes das linhas (média, contagem distintos) → V2 fired.

**Fix aplicado (T-23):** `apareceLiteralEmEnvelope` agora aceita:
1. `array.length` de `titulos`, `linhas`, `serie`, `top`, `topMaiores`.
2. Soma agrupada por campo numérico das linhas (cobre "soma do vrSaldo dos visíveis").

### Achado #3 — V3 anti-recusa pega casos genuínos (6 dos 6)

Olhei os 6 V3:
- "Notas emitidas para o cliente Smartfit Alphaville" → LLM recusou tendo `_DESTAQUE` populado. V3 correto.
- "Cliente que comprou mais notas esse mês" → recusa indevida. V3 correto.
- "Vai ter halteres pra entrega amanhã?" → recusa, mas pergunta é fora-de-escopo (não tem dado de entrega). **V3 falso positivo.** Adicionar "entrega" ao termos fora-de-escopo.
- "Faturamento pra rede de academias" → recusa, pergunta sem contexto claro. Discutível.
- "Pedido sem nota emitida ainda" → V3 fired, mas pergunta é legítima fora-de-escopo (já existe LACUNA_REAL). FP. Adicionar termo.
- "Fornecedor sem cadastro" → V3 fired, mas a tool retornou "10 parceiros encontrados" (não é recusa). Verificar.

**Fix:** atualizar `TERMOS_FORA_ESCOPO` no V3 com `"entrega"`, `"sem nota emitida"`, `"sem cadastro"`.

## Projeção do retry rate pós-fixes

| Fonte de retry | R17 (atual) | R18 (projetado) |
|------|------|------|
| Freshness vazada (V2) | 28 | 0 (Bloco A) |
| `array.length` não aceito (V2) | 5 | 0 (T-23) |
| Soma de subset linhas (V2) | 2 | 0 (T-23) |
| Invenção REAL (V2) | ~0 | ~0 |
| V3 anti-recusa legítimo | 3 | 3 |
| V3 FP (entrega/sem nota emitida) | 3 | 0 (T-23) |
| **Total** | **41** | **~3-5** |

## Projeção %CORRETO R18

R17: 78% CORRETO.
- Os 41 retries que "corrigiam" agora não disparam — então o LLM emite resposta direta. **Se a resposta direta era de qualidade equivalente à do retry**, %CORRETO mantém ou melhora.
- Pré-Bloco A, retries removendo freshness eram "limpeza cosmética", não correção factual. Sem retry: respostas com freshness textual (heuristica do meu audit marca como CORRETO ainda).
- Pós-Bloco A: respostas SEM freshness textual emitida pelo LLM (prompt proíbe). Heurística do audit continua marcando como CORRETO.

**Estimativa R18:** %CORRETO entre 82-88%, retry rate ≤ 15%.

## Conclusão

O retry rate de 41% **não era LLM ruim**. Era validador disparando em:
- 70% padrão de freshness do prompt antigo
- 15% `array.length` não aceito
- 15% V3 com lista de termos incompleta

O LLM gpt-5.4-mini está acertando o conteúdo. O "lixo de 37% sem retry" era ilusão estatística do retry mascarando comportamento esperado do prompt antigo.

**Próximo passo:** rodar R18, medir e comparar.
