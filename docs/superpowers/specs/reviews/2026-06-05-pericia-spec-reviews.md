# Reviews da SPEC , Perícia agêntica + Reavaliação (2026-06-05)

Duas reviews adversariais da spec `2026-06-05-pericia-claude-juiz-reavaliacao-design.md`.
Cada achado material vira resolução incorporada na v2/v3.

## Review #1 (v1 → v2)

| # | Achado | Severidade | Resolução (v2) |
|---|---|---|---|
| 1 | R2 "usa o MCP" é hand-wave: o `claude -p` headless só chama o MCP se o servidor nexus estiver registrado na config dele. | Alta | Perícia refaz a consulta chamando a **camada de queries real** (`src/lib/reports/queries/**`, o que as tools MCP encapsulam) via tsx, OU o MCP se configurado. O que importa é re-buscar o dado REAL e comparar. Playbook especifica os dois caminhos; default = camada de queries (determinístico, sem depender de wiring de MCP). |
| 2 | Custo/tempo da perícia agêntica por item não bounded (MAX_RUN_MS=45min). | Média | Playbook processa em lote os PENDENTE/REAVALIAR existentes; perícia foca re-execução só das tools que respondem a pergunta. Backstop 45min mantido. |
| 3 | Boot-fire dispara `claude` a cada restart do dev (o design ANTIGO evitava isso de propósito). | Alta | Boot-fire com **guarda**: dispara ~3min após boot só se houver fila E `lastJudgeRunAt` (persistido) for mais antigo que o intervalo. |
| 4 | R5: quais votos disparam REAVALIAR? Voto que concorda não deveria gerar re-perícia. | Média | REAVALIAR só quando, após veredito terminal, o voto **diverge** do status efetivo OU traz **comentário**. Voto concordante sem comentário não dispara. |
| 5 | Precedência `humanStatus` × perícia não definida. | Alta | Se `humanStatus` setado (super_admin já decidiu), o voto NÃO marca REAVALIAR e a perícia NUNCA sobrescreve. Humano > perícia. |
| 6 | "ajuste pela perícia" no mesmo campo: falta marcador/rota. | Média | Re-perícia grava o novo veredito em `status`, anexa entrada em `razoes` com marcador `[AJUSTE-PERICIA <ts>]` (paralelo ao humano), e o drill-down rotula "ajuste pela perícia". Nunca toca `humanStatus`. |
| 7 | Forçar modelo Opus no juiz. | Média | `claude --model opus -p ...` (CLI suporta `--model`). |

## Review #2 (v2 → v3, mais profunda)

| # | Achado | Severidade | Resolução (v3) |
|---|---|---|---|
| 8 | `toolResults` SÃO persistidos (`Message.tool_results` Json) , a perícia pode LER o que a tool devolveu, mas o requisito é RE-EXECUTAR pra conferir verdade. | Alta | Dump inclui `toolCalls`+`toolResults` (contexto), mas o playbook ORDENA re-executar a query real e comparar , não confiar no result persistido. |
| 9 | Remover `auto-heuristic-config.tsx` quebraria a config de intervalo, que o cron do Claude REUSA (`qualityHeuristicIntervalMinutes`). | Alta | Não deletar a config de intervalo: **repropósito** do card para "Perícia (Claude)" mantendo o input de intervalo; remover só o que é específico da heurística. |
| 10 | Loop de REAVALIAR (usuário revota após reconciliação). | Baixa | Re-perícia volta o item a terminal; novo voto só re-dispara por ação manual do usuário. Sem auto-loop. |
| 11 | Verificar que a perícia REALMENTE re-executou é difícil (depende do prompt). | Média | Aceite por inspeção manual + razões devem citar a re-execução; não é unit-testável. Registrado como limitação. |
| 12 | Drift de versão: `pendentes-io` grava `claude-code-v1`, trigger usa `v2-claude-code`. | Baixa | Padronizar `judgeVersion="claude-pericia-v1"` em todo o pipeline novo. |
| 13 | Produção: juiz é local-only (container não vê `claude`). | Alta (conhecida) | Fora de escopo desta entrega; gap registrado. Em prod, PENDENTE/REAVALIAR acumulam até existir juiz remoto. |

## Critério de saída
Sem achado material novo após a review #2. Decisões D1–D7 (acima) incorporadas na spec v3.
