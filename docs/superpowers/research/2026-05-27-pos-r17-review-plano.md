# Review Pós-R17 e Plano de Execução

**Data:** 2026-05-27
**Contexto:** Após R17 (78% correto, 41 retries do AutoValidator), usuário apontou 7 problemas específicos. Esta revisão lista o que **realmente** foi feito, o que **escapou**, o que **falta**, e a ordem de execução.

---

## 1. Pedidos do usuário (8 itens) — checklist de cobertura real

| # | Pedido | Status real | Detalhe |
|---|--------|-------------|---------|
| 1 | "atualizado há X" não aparecer no texto | ⚠️ PARCIAL | Prompt §6 alterado ✓; `stripFreshnessFromText` criado ✓; **MAS** `fmtGenerico` em `responder.ts:100` ainda emite `(atualizado ha X)` — tools sem formatador real (preco_*) vazam |
| 2 | `[[suggestions]]:` vazando no texto | ⚠️ PARCIAL | Regex permissivo ✓, `stripCanalSuggestionsResidual` ✓ na pipeline, `registrar-lacuna.ts` corrigido ✓; **MAS** `fmtRegistrarLacuna` em `responder.ts:86` ainda concatena `[[suggestions]]` no `_RESPOSTA` — conflito que precisa ser sincronizado |
| 3 | Pergunta sem sentido → "não entendi sua pergunta" | ⚠️ SÓ PROMPT | Regra 12b adicionada ✓; **sem trava de código** — depende 100% do LLM seguir |
| 4 | Diferenciar fora-de-escopo legítimo vs pergunta-sem-sentido | ⚠️ SÓ PROMPT | Coberto pela regra 12b; **classificação heurística da auditoria não distingue** ainda |
| 5 | Aviso "listando 10 de N" em listas grandes | ⚠️ SÓ PROMPT | Regra 12c ✓; **sem trava de código** — LLM pode esquecer |
| 6 | Top 10 maiores contas a receber abertas | ❌ INSUFICIENTE | Adicionei só `topMaiorValor`/`topMaiorParticipante` (o 1º). User pediu **top 10**, lista. Falta `topMaiores: [{nome, valor, n}]` |
| 7 | "Hoje" exato em titulos_vencidos | ⚠️ PARCIAL | Parâmetro `janela='hoje'` adicionado ✓; **prompt não foi atualizado** para o LLM saber quando usar |
| 8 | Por que erra direto sem retry (gargalo) | ❌ NÃO FEITO | Sem análise; sem investigação caso-a-caso dos 41 retries |
| extra | Auditoria turno-a-turno R17 | ❌ NÃO FEITA | Só classificação heurística; auditoria manual genuína dos 22 não-CORRETO pendente |

---

## 2. O que escapou (achados desta revisão)

### E1 — `fmtGenerico` ainda emite freshness
- Arquivo: `mcp/lib/responder.ts:100`
- Código: `partes.push(\`(atualizado ha ${env.atualizadoHa})\`);`
- Impacto: qualquer tool sem formatador real (`preco_produto`, `preco_tabela`, tools de escrita) vaza freshness no `_RESPOSTA`. O `stripFreshnessFromText` no run-agent é trava final, mas o ideal é não gerar.
- Fix: remover linha 100.

### E2 — `fmtRegistrarLacuna` ainda concatena `[[suggestions]]`
- Arquivo: `mcp/lib/responder.ts:86`
- Código: `sugStr = \` [[suggestions]]:${sugs.join("|")}\`;`
- Impacto: o servidor cria `_RESPOSTA` com canal embutido (mesmo que `registrar-lacuna.ts` `montarRespostaCompleta` não inclua mais). Quando o LLM copia `_RESPOSTA`, vaza o canal.
- Fix: remover linhas 84-87 do `fmtRegistrarLacuna`. Manter só `respostaSugerida`.

### E3 — `topMaiorValor` é insuficiente
- User pediu: "top 10 maiores contas a receber abertas"
- Implementado: só o 1º (`topMaiorValor`, `topMaiorParticipante`)
- Fix: expor `topMaiores: TituloAResumido[10]` no envelope; atualizar formatador para mencionar top 3 explicitamente.

### E4 — Prompt não menciona `janela='hoje'`
- Parâmetro existe na tool, mas LLM não sabe quando usar.
- Fix: adicionar entrada na seção "Defaults" ou nos exemplos.

### E5 — Aviso de truncamento depende só do LLM
- Regra 12c instrui, mas LLM pode esquecer.
- Fix: gerar campo `_AVISO_TRUNCAMENTO` no envelope quando aplicável; formatador injeta no `_RESPOSTA`.

### E6 — Heurística da auditoria classifica perguntas sem sentido como FORA_DO_ESCOPO
- Script `audit-r17.py` marca tudo que usou `registrar_lacuna` como FORA_DO_ESCOPO.
- Fix: detectar pergunta-curta-sem-identificador (≤4 palavras, sem CNPJ/código/nome próprio) e marcar como ERRADO + pattern `nao_entendeu_pergunta`.

---

## 3. Investigação pendente "por que erra direto sem retry"

**Hipóteses a verificar contra os 41 turnos com retry_count=1:**

H1. **LLM ignora `_RESPOSTA`**: o texto curado está lá, mas o LLM gera resposta diferente, depois é "consertado" pelo retry. → Investigar correspondência texto-LLM vs `_RESPOSTA`.

H2. **LLM cita números das linhas sem usar `_DESTAQUE.total`**: faz soma manual e erra. → Investigar se o número final bate com `_DESTAQUE.total*`.

H3. **LLM recusa com agregado disponível**: V3 dispara. → Quantos dos 9 V3 são genuínos vs falsos positivos.

H4. **LLM cita número plausível-mas-inventado**: V2 dispara. → Quantos dos 40 V2 disparam por número derivado (FP) vs número genuinamente inventado (TP).

H5. **Modelo gpt-5.4-mini é fraco demais**: testar 5 mesmas perguntas em gpt-5.4 (não mini) controlado.

---

## 4. Plano de execução (ordem firme)

### Bloco A — Fixes que escaparam (1 commit)
1. **T-18** Remover `(atualizado ha X)` de `fmtGenerico` em `responder.ts`
2. **T-19** Remover `[[suggestions]]:` de `fmtRegistrarLacuna` em `responder.ts`
3. **T-20** Adicionar `topMaiores: [...]` no envelope de `contas_a_receber/pagar` + formatador
4. **T-21** Adicionar regra "janela='hoje' para titulos_vencidos quando user diz 'hoje'" no prompt
5. **T-22** Adicionar campo `_AVISO_TRUNCAMENTO` no envelope quando aplicável + formatador injeta no `_RESPOSTA`

→ Commit "fix: 5 fixes que escaparam do commit pos-R17"

### Bloco B — Verificação E2E (sem rodar bateria ainda)
6. **T-25** Rebuild MCP+app, reiniciar dev, smoke test manual com 5 perguntas representativas:
   - "Top 10 maiores contas a receber abertas" → conferir top 10 listado, sem freshness, sem `[[suggestions]]`
   - "Títulos vencidos hoje" → conferir só os do dia
   - "Quais notas?" → conferir resposta "não entendi"
   - "Vai bater meta?" → conferir registrar_lacuna sem canal vazando
   - "Saldo total em estoque" → conferir resposta limpa
7. Documentar resultado em screenshots/notas.

### Bloco C — Investigação raiz (1 doc)
8. **T-23** Query no banco extraindo os 41 turnos com retry_count=1 + a resposta original (antes do retry) + a resposta final. Análise: quantos LLM gerou números corretos depois do retry vs falsos positivos. Output: `docs/superpowers/research/2026-05-27-gargalo-retry.md` com 3 causas raiz e fix proposto.

### Bloco D — Auditoria turno-a-turno R17
9. **T-24** Auditar manualmente os 22 não-CORRETO (15 minutos por turno × 22 = ~5h). Reclassificar e documentar.
10. Atualizar status no banco.

### Bloco E — R18
11. Rodar `03-run-test-questions.ts` com novas 100 perguntas (criar variações no test-questions.json para evitar contaminar). Comparar:
    - %CORRETO vs R17 (78%)
    - retryRate vs R17 (49%)
    - distribuição de validadores

### Critério de saída
- Bloco A: tsc verde, suite verde, sem regressão
- Bloco B: 5 smokes passam visualmente
- Bloco C: causa raiz identificada
- Bloco D: 22 turnos reclassificados; lista de fixes adicionais
- Bloco E: %CORRETO ≥ 83% (meta intermediária pré-95%)

---

## 5. O que NÃO está nesta rodada (postergado intencional)

- Tools fiscal/comercial restantes com formatador genérico (preco_*) — não apareceram no top 22 PARCIAL/ERRADO
- Trocar gpt-5.4-mini por gpt-5.4 — experimento controlado vem só após auditoria mostrar que prompt+envelope esgotaram
- F6 de tools de meta/margem/liquidez/etc — escopo F6 do projeto
