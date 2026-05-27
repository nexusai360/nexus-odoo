# Review #1 (adversarial) — SPEC v1 Agente Nex ≥90%

**Reviewer:** Claude Code (Opus 4.7), modo crítico
**Spec revisada:** `docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md`
**Postura:** caçar erros, premissas frágeis, ambiguidades, inconsistências, escopo mal definido, estimativas otimistas, contratos implícitos.
**Resultado:** **24 achados materiais** organizados por gravidade. SPEC tem boa estrutura mas tem furos importantes — precisa ir para v2.

---

## Achados críticos (CRIT — bloqueiam a execução)

### CRIT-1: Validador V2 (anti-invenção) tem falso positivo gigante por construção

> SPEC § 3.1 Onda 1 / A12 V2: "extrai números... cada número deve aparecer em algum `_RESPOSTA`, `_DESTAQUE.*`, `_agregado.*`, `total*` ou em alguma linha de `toolResults[].linhas[]`. Senão, dispara retry."

**Problema:** o prompt manda o agente **somar linhas, contar grupos, calcular percentual**. Esses números **NUNCA** estão nos toolResults — eles são derivados. Exemplo concreto do laudo (R11 Total em aberto a pagar): o agente deveria pegar `titulos[]` e somar `vrSaldo` ⇒ resultado é uma soma que **não aparece em nenhuma linha do toolResults**.

Aplicando V2 cegamente, esse tipo de resposta **correta** dispararia retry. Isso quebra o objetivo (prompt manda somar, validator pune por somar).

**Mitigação proposta na spec (§ 8): "lista de exceções no validator"** é mão de obra perpétua e frágil. Precisa de algoritmo:
- Aceitar números que sejam **somas, contagens, médias, ranking ou percentuais** derivados das linhas (verificar plausibilidade dentro de margem ε).
- Ignorar números mencionados na pergunta original.
- Ignorar datas, percentuais < 100%, contagens ≤ comprimento da lista.

**Sem isso, V2 é não-viável.** Precisa de pseudocódigo concreto e teste empírico contra os 75 acertos atuais (CORRETO) das rodadas R11-R16 para garantir 0 falsos positivos.

---

### CRIT-2: Estimativas de cura são otimistas em 2-3x

> SPEC § 1.1 e § 4: "Onda 1 → 85 casos curados (59%) → %CORRETO ~85%."

**Problemas:**
1. Casos têm múltiplos patterns (ex: R16 "Vendedores cadastrados" tem `dado_inventado` E `fluxo_tool_incompleto`). A soma "F1=25 + F4=8 + F9=12..." conta dupla.
2. Histórico recente do projeto: cada wave (Onda A, B, C, D, F) entregou **2-5 pp** de melhora, não 12-15 pp.
3. Estimativa qualitativa, não baseada em A/B real.

**Implicação:** se R17 vier com 78% (não 85%), todo o roadmap atrasa e a credibilidade da spec sofre.

**Recomendação:** dividir cada fix por **% provável de cura por caso individual** (P=0,3 a 0,8) e somar com **deduplicação por evalId**. Estimativa esperada provavelmente cai para 30-50 casos / 25% de melhora em Onda 1, levando %CORRETO para ~80% (ainda bom, mas honesto).

---

### CRIT-3: F23 (helper de período) tem dependência circular com Onda 2

> SPEC § 3.1: A11 (helper `periodoNome`) está em Onda 1, mas só vale se LLM **chamar tools com `periodoNome`**, o que exige prompt atualizado (Onda 2, B1).

**Implicação:** Onda 1 sozinha não cura `erro_data` (R16 "Parcelas que vencem amanhã"). Os 3 casos de F23 só são curados depois de Onda 2.

**Fix na spec:** mover F23/B1-data-relativa para "Onda 1.5" ou explicitar que F23 só consolida em Onda 2. Atualizar estimativa.

---

### CRIT-4: Mesma dependência circular para `_RESPOSTA`

> SPEC § 4.2: "_RESPOSTA é texto pronto... LLM DEVE usar literalmente quando pergunta cair no canônico."

**Problema:** "DEVE" não é mecanismo. O prompt atual não menciona `_RESPOSTA`. Sem regra no prompt, o LLM vai ignorar. Onda 1 sozinha não cura.

**Fix:** ou (a) adicionar regra no prompt como parte de Onda 1 (mover B1 parcial), ou (b) validator V5 que detecta divergência entre `_RESPOSTA` curada e resposta gerada. Optar por (a) — mais simples.

---

### CRIT-5: AutoValidator não tem feature flag — entra em produção sem rollback granular

> SPEC § 8 não menciona feature flag.

**Problema:** se V1-V4 disparam falso positivo em produção, o WhatsApp/in-app começa a ter retry em 60% dos turnos. Latência explode. Sem flag, rollback é PR + deploy.

**Fix obrigatório:** `AgentSettings.autoValidatorEnabled: boolean` (default false em prod até ramp-up), `autoValidatorMode: "shadow" | "active"`:
- `shadow`: roda validadores, loga `retryReason` mas **não dispara retry**. Coleta dados por 1 semana, depois ativa.
- `active`: roda completo.
- Cada validador (V1-V4) tem flag independente para ligar gradualmente.

---

### CRIT-6: A6 (cadastro_buscar_parceiro.papel) precisa de fato e de dado, não só de filtro

> SPEC § 3.1 A6 e § 6.3 mencionam papel `cliente|fornecedor|transportadora|todos`.

**Problema:** o dado de "papel" em `res_partner` do Odoo está em campos como `customer_rank`, `supplier_rank`, e **"transportadora" não é um papel cadastrado** — é uma categoria (`category_id`). Spec assume que é trivial filtrar, mas exige investigação:
1. Verificar campos disponíveis em `raw_res_partner`.
2. "Transportadora" provavelmente exige cruzamento com `res.partner.category` (precisa estar no cache).
3. Pode exigir nova ingestão F2.

**Fix:** investigar antes de prometer. Adicionar tarefa de research na spec.

---

### CRIT-7: Bateria R17 (medição de Onda 1) tem viés metodológico crítico

> SPEC § 6.4: "criar nova bateria de 100 turnos... judge Claude Code."

**Problema:** sou eu (o judge) que escrevi o laudo. Escrevi a spec. Vou criar R17 e julgar R17. **Contaminação metodológica completa.** Não há controle.

**Fix obrigatório:**
- R17 deve ser criado por uma **fonte cega**: idealmente humano + perguntas reais de usuário de produção (extraídas de `Conversation` com `title NULL`, evitando AUDIT-POS).
- Critérios de avaliação devem ser **escritos antes** de rodar R17 e congelados.
- Idealmente um judge **diferente** (outro sub-agente Opus com prompt isolado, sem ter lido o laudo) avalia.

Sem isso, R17 vira self-fulfilling prophecy.

---

## Achados altos (HIGH — afetam corretude)

### HIGH-8: Inconsistência entre "aceita resposta original" e "aceita resposta retry"

> § 4.4: "Cap rígido = 1 retry. Se retry falhar... aceita a resposta (não bloqueia)."
> § 8 risco: "aceita resposta original se retry crashar."

Quando o retry falha **na validação** (não crasha) — aceita qual? Original ou retry? Spec ambígua.

**Fix:** decidir explicitamente. Recomendação: aceita o **retry** (mesmo se ainda falhou validação) porque foi a 2ª tentativa com contexto corretivo, supostamente melhor. Se retry **crashou** (exceção), aceita original.

---

### HIGH-9: V1 (anti-truncamento) menciona "totalA*" mas não cobre `previstoEntradas`/`previstoSaidas` do fluxo de caixa

> § 3.1 A2 inclui `financeiro_fluxo_caixa` no scope mas V1 só checa `totalA*`.

**Fix:** generalizar V1 para checar **qualquer campo** `total*`, `previsto*`, `_RESPOSTA`, `_DESTAQUE.*`, `_agregado.*`. Ou explicitar lista completa de campos canônicos.

---

### HIGH-10: F22 (registrar_lacuna respostaSugerida completa) assume copy-paste literal pelo LLM

> § 3.1 A8 e § 2.8 fix.

**Problema:** evidência de R16 ("Tempo médio de fechamento do pedido" → resposta cortada em "Posso te ajudar com:") mostra que o LLM **truncou** a respostaSugerida da tool. Não fez copy-paste literal.

**Fix:** F22 sozinho não basta. Precisa de validador V5 "resposta termina em :"$" ou "sem-listagem" → retry, OU pré-formatação no servidor que retorna texto sem ":" final.

---

### HIGH-11: Match exato numérico (A9) define limiar arbitrário "≥4 dígitos"

> § 3.1 A9: "match exato quando termo é numérico ≥4 dígitos".

**Problema:** justificativa "códigos da Matrix são 3 ou ≥10 dígitos" precisa **prova empírica**, não chute. Pode haver códigos de 4-6 dígitos legítimos que viram match exato e quebram.

**Fix:** rodar query no cache: `SELECT LENGTH(default_code), COUNT(*) FROM raw_product_product GROUP BY 1 ORDER BY 1`. Confirmar distribuição. Ajustar limiar com dado real.

---

### HIGH-12: A10 (financeiro_titulos_vencidos.tipo obrigatório) quebra contrato existente

> § 3.1 A10: "tipo (a_receber|a_pagar) vira obrigatório".
> § 7.4: "breaking, mitigar com prompt atualizado simultâneo."

**Problema:** se Onda 1 sai antes de Onda 2 (prompt), o LLM vai chamar sem `tipo`, tool retorna erro, e cada caso de R17 que toca essa tool falha. Mesmo problema da CRIT-3.

**Fix:** transição em 2 fases:
- Fase 1: aceita sem `tipo`, mas devolve `aviso: "tipoSugerido = X"` no envelope. Log de chamadas sem tipo.
- Fase 2 (após 1 semana): rejeita.

Sequenciar corretamente na ondas.

---

### HIGH-13: A13 (gate de redirecionar) pode gerar resposta "vazia" quando LLM resiste a redirect

> § 3.1 A13: "se a tool devolveu redirecionar.tool, o run-agent.ts força o próximo turno do LLM a chamar essa tool (depth=1, sem loop)."

**Problema:** como o run-agent.ts "força"? Inserindo system message? Reescrevendo tool_choice? Spec não define mecanismo. Se LLM ignorar a force, o gate vira loop infinito mascarado por depth=1 (sai sem resposta).

**Fix:** especificar mecanismo (tool_choice forçado via Anthropic/OpenAI API), e fallback (se gate falha, devolve respostaSugerida da tool original literal).

---

### HIGH-14: SPEC não menciona rebuild de containers (regra de raiz CLAUDE.md §2.1)

> SPEC ignora workflow de container.

**Problema:** mudanças em `mcp/**` exigem `docker compose build mcp`. Mudanças em `src/lib/agent/**` exigem `docker compose build app` ou worker. Sem isso, testes E2E falham.

**Fix:** adicionar § 9 (sequência) "antes de cada bateria de regressão, rebuildar containers afetados conforme mapa CLAUDE.md §2.1".

---

### HIGH-15: Latência do retry mal dimensionada

> § 7.1: "+1 LLM call em ~15% dos turnos. Estimativa: +0,7s p50."

**Problema:** se cada LLM call dura 3-5s e dispara em 15%, contribui 0.45-0.75s ao p50 médio — ok. Mas **p95 e p99** (que é o que mata UX) sobem dramaticamente: o turno de 15% pula de 8s para 13s, e isso desloca p95 para ~12s.

**Fix:** definir SLA explícito (p50 ≤ 6s, p95 ≤ 12s) e validar com benchmark antes do merge.

---

### HIGH-16: F4 (topPorParticipante) aplicado em fluxo_caixa não faz sentido conceitual

> § 3.1 A2 e § 11 open question #4.

**Problema:** `financeiro_fluxo_caixa` é movimento (entradas/saídas no período), não saldo por contraparte. Agrupar por participante não tem semântica clara.

**Fix:** remover fluxo_caixa de A2. Aplicar `topPorParticipante` apenas em `contas_a_pagar`, `contas_a_receber`, `titulos_vencidos`.

---

### HIGH-17: "Sem regressão > -2pp em sub-domínio" — sub-domínio mal definido

> § 1.1: "sem regressão > -2pp em sub-domínio (estoque/financeiro/fiscal/comercial/cadastros/contábil)".

**Problema:** "sub-domínio" é categoria de pergunta. Como é classificada cada pergunta de R17 em sub-domínio? Manual? Por tool chamada? Ambíguo.

**Fix:** definir taxonomia operacional. Recomendação: cada pergunta em R17 vem com `dominio_canonico` no JSON da bateria, escrito antes de rodar.

---

### HIGH-18: Falta critério de rollback explícito

> SPEC não define o que fazer se R17 entregar <85%.

**Possíveis caminhos:** (a) rollback total da Onda 1 e refazer; (b) aceitar e seguir; (c) novo laudo focado e Onda 1.5. Spec não decide.

**Fix:** § 9 deve incluir matriz "se R17 ∈ [80%, 85%] → segue + log de gap; se R17 ∈ [70%, 80%) → não bloqueia Onda 2 mas adiciona Onda 1.5; se R17 < 70% → rollback + novo laudo."

---

## Achados médios (MED — afetam qualidade ou rastreabilidade)

### MED-19: `_RESPOSTA` como string única perde tipos de pergunta

> § 4.2: "_RESPOSTA: string"

Limitar a 1 string força o LLM a escolher quando usar. Mas:
- "Total a pagar" → "_RESPOSTA: Total: R$ 4,2M em 218 títulos."
- "Top 5 devedores" → "_RESPOSTA: Top 5..." 
- "Há atrasos?" → "_RESPOSTA: Sim, 32 títulos em atraso."

Como uma única string atende todos? Talvez precise `_RESPOSTA: {total: string, top: string, resumo: string}` por intent.

**Fix sugerido:** v2 explora variantes; pode ficar string única se for genérica o suficiente.

---

### MED-20: Não há mecanismo de evolução do `_RESPOSTA` com base em casos novos

> SPEC não fala em iteração do `_RESPOSTA`.

Texto curado em TS vira código que cristaliza. Como evoluir? Cada vez que aparecer um novo padrão, edita TS, faz PR, rebuilda container — fricção alta.

**Fix:** considerar `_RESPOSTA` como template com placeholders preenchidos a partir do `_agregado/_DESTAQUE`, não string literal hardcoded.

---

### MED-21: SPEC menciona "v2-claude-code" judge mas R17 deveria invalidar versionamento

> § 6.4 e § 3 Fora ("Mudar o judge"). Conflito: se Onda 1 muda envelope, o judge precisa entender `_RESPOSTA` para avaliar se LLM usou ou não. Briefing do judge fica desatualizado.

**Fix:** atualizar briefing v2 do judge **junto com Onda 1**, bumpando `judgeVersion` para `v3-claude-code`. Não separar.

---

### MED-22: Custo de WhatsApp não modelado

> § 8 riscos não menciona WhatsApp.

Retry pode estourar timeout no n8n (default ~30s). Resposta tardia pode confundir o usuário no WhatsApp (chega depois de ele mandar outra mensagem).

**Fix:** validar timeout do n8n. Adicionar risco e mitigação.

---

### MED-23: Anexos do laudo viraram parte do repo — verificar tamanho

> § 12 Anexos: `cases_v2.jsonl` 1.2MB, vai pra git.

Não é problema crítico (1.2MB cabe), mas a versão 2 do laudo (após R17) gera outro JSONL. Cresce sem limite. Considerar ignorar JSONL ou armazenar em `.gitignore`d.

**Fix:** decidir: manter ou mover para `s3://` / artifact externo após referência inicial.

---

### MED-24: Falta tabela de "casos curados por fix" cruzando com evalId

> SPEC apresenta estimativas agregadas, sem traçar caso-a-caso → fix → onda.

Esse mapping vai ser necessário no PLAN para validar caso por caso na regressão. Antecipar agora evita retrabalho.

**Fix:** adicionar planilha (CSV/MD) `casos_x_fixes.md` em anexo da spec v2.

---

## Resumo dos achados

| Severidade | Quantidade | Bloqueia v2? |
|-------------|------------|----------------|
| CRIT (crítico) | 7 | Sim — todos devem ser endereçados |
| HIGH (alto) | 10 | Sim — todos devem ser endereçados |
| MED (médio) | 6 | Endereçar quando relevante, alguns viram open question |

**Recomendação:** SPEC v1 não está pronta. **Produzir SPEC v2** endereçando os 17 CRIT/HIGH como requisito firme + abordando os 6 MED com decisões claras (mesmo que "adiar"). Após v2, fazer review #2 ainda mais profundo (caçar o que ficou de fora desta review).
