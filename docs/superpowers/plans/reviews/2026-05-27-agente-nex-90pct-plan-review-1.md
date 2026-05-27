# Review #1 (adversarial) — PLAN v1 Agente Nex ≥90%

**Reviewer:** Claude Code (Opus 4.7), modo crítico
**Plan revisado:** `docs/superpowers/plans/2026-05-27-agente-nex-90pct-plan.md`
**Postura:** caçar gaps de decomposição, ambiguidades, bugs ocultos no código exemplificado, sequência mal definida.

## Achados

### CRIT-A: Bug oculto no `periodo.ts` por uso de Date local em container UTC
Em produção, container roda em UTC. `getDate()`/`setDate()` no Node usam timezone local. Resultado: em horário noturno (após 21h em GMT-3), `new Date()` em UTC já é dia seguinte. Helper devolve data errada para "hoje".

**Fix:** trocar implementação para usar `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date)` ou biblioteca como `date-fns-tz`. Sem isso, todo o sistema de período está bugado.

### CRIT-B: Task 4 não tem mecanismo para garantir que PR2-PR8 adicionem formatadores
PR2 pode aplicar envelope em `financeiro_contas_a_receber` mas esquecer de promover o formatador real (deixar fallback `fmtGenerico`). Sem contrato, regressão muda silenciosamente.

**Fix:** adicionar `mcp/lib/responder.ts` exportar `TOOLS_QUE_PRECISAM_FORMATADOR` (lista hard-coded) + teste que falha se `formatadorPorTool` retornar `fmtGenerico` para qualquer tool dessa lista. PR2 obrigatoriamente preenche e move tool para lista positiva.

### CRIT-C: PR10 agrega 5 mudanças críticas, difícil de revisar
PR10 = AutoValidator (~400 linhas) + schema delta + prompt edit + briefing v3 + integração run-agent. Reviewer humano cansa, qualidade do review cai.

**Fix:** dividir PR10 em PR10a (schema delta + auto-validator standalone com testes), PR10b (integração run-agent), PR10c (briefing v3 + prompt mínimo `_RESPOSTA`).

### HIGH-D: Falta documento `casos-x-fixes.csv` mencionado na SPEC §13
SPEC menciona artefato; PLAN ignora.

**Fix:** adicionar Task 0.5 ou Task 6.5: gerar CSV com mapeamento `evalId → fix_aplicavel → onda → prob_cura_pct` a partir do `cases_v2.jsonl`. Usado pela regressão para validar caso a caso.

### HIGH-E: PR1 deve smoke-test `docker compose build mcp`
Mesmo PR1 não chamando os helpers em tool, o container `mcp` os carrega no bundle. Build do container muda; precisa verificar que não quebra.

**Fix:** Step 6.2.5 (entre 6.2 e 6.3): `docker compose build mcp` deve passar com 0 erros.

### HIGH-F: Sub-planos para PR2-PR18 fazem o ciclo todo da metodologia explodir em ~13 invocações
Cada sub-plano = writing-plans + 2 reviews = ~3h de "planejamento" mínimo. 13 sub-planos = 39h de overhead. Pode não caber em prazo razoável.

**Fix:** consolidar PR2-PR8 (Onda 1.B+1.C) num **sub-plano único** com 7 tasks (uma por domínio). Reduz overhead. Justificativa: os 7 PRs seguem o **mesmo padrão estrutural** (aplicar envelope + formatador). Não merece 7 ciclos de plan+review.

### HIGH-G: Bug no `startOfWeekISO` na fronteira de domingo
`day === 0 ? -6 : 1 - day`. Domingo deveria retornar segunda **anterior** (a segunda que iniciou aquela semana ISO terminando no domingo) — sim, recua 6 dias = segunda anterior. OK até aqui.

Mas o teste `essa_semana` quando hoje = domingo 31/05/2026 retornaria 25/05–31/05. Não há teste pra esse caso de fronteira.

**Fix:** adicionar teste explícito de `essa_semana` em domingo. Adicionar teste de `essa_semana` em segunda (deveria retornar a própria segunda como início).

### HIGH-H: Tipo `LinhaFinanceira` não exportado em `responder.ts`
PR2 vai precisar do tipo para tipar parâmetros. Mantê-lo `internal` força duplicação.

**Fix:** exportar `export interface LinhaFinanceira`.

### MED-I: Falta `git status -s` antes de iniciar cada task
Se uma task falhar no meio (ex: testes verdes mas commit não rodou), a próxima task começa em estado sujo. Pequeno.

**Fix:** adicionar primeiro step de cada task: "verificar árvore limpa após task anterior".

### MED-J: Step 6.4 "26 testes" depende de números exatos
`Esperado: same total + 26` é frágil. Se outro PR mudar a baseline, expectativa quebra.

**Fix:** mudar para "PR1 adiciona pelo menos 4 suites em mcp/lib/" com nomes verificáveis (`envelope`, `periodo`, `agrupador`, `responder`).

### MED-K: `run-regression.ts` Step 5.2 dá impressão de cobertura
Smoke test "imprime e sai" não testa rebuild real. Aceitável para PR1 mas registrar como dívida (PR2 deve rodar rebuild real).

### MED-L: Não há plano de comunicação ao usuário entre PRs
Após PR1 mergiado (decisão humana), próximo passo precisa de input/decisão do usuário (aprovar PR2, etc.). Plan não menciona.

**Fix:** Step ao final do Task 6 (PR1): "Aguardar aprovação humana de merge antes de iniciar sub-plano PR2."

---

## Resumo
- CRIT: 3 (`periodo` em UTC, contrato de formatadores, PR10 grande)
- HIGH: 5 (CSV, smoke build, sub-planos, teste fronteira, tipo exportado)
- MED: 4 (status check, números exatos, dívida regressão, comunicação)

PLAN v2 deve endereçar os 3 CRIT e 5 HIGH; MEDs viram ajustes pontuais.
