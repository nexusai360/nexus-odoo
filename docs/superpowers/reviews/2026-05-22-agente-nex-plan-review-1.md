# Review #1 — Plano Melhorias do Agente Nex

Auditoria adversarial do PLAN v1 (`2026-05-22-agente-nex-melhorias.md`). Objetivo: achar lacuna, premissa frágil, task que esconde épico.

## Achados materiais

**M1. D3 é um épico disfarçado.** Junta 4 unidades: novo contrato SSE, máquina de estado da trilha, correção do caret órfão, congelamento da trilha no `done`. Precisa virar D3a/D3b/D3c/D3d, cada uma verificável isolada.

**M2. Risco B↔D mal mitigado.** v1 fala "feature flag ou commits encadeados" sem decidir. Solução firme: B2/B3 ADICIONAM `label` SEM remover `toolName`. Todo commit intermediário roda. D consome `label`. Uma task de limpeza final remove `toolName`. Assim nenhum commit deixa a UI quebrada.

**M3. Remoção do "atualizado há Xs" é incompleta.** v1/A2 tira a instrução do prompt, mas o timestamp vem DENTRO do payload das tools (a imagem 1 mostra "atualizado há 5s" no dado). Sem tocar `mcp/`, o modelo pode ecoar o que está no dado. Falta uma linha de prompt explícita: "os resultados podem conter um carimbo de atualização; ignore-o, nunca o repita".

**M4. A1 é abstrato demais para um modelo nano.** GPT-5.4 nano é pequeno; instrução conceitual sem exemplo é frágil. A1 precisa de 2-3 exemplos few-shot concretos (o caso puxador corda e um fiscal) dentro do prompt.

**M5. Fase E não é "opcional/última" — ela sustenta A1.** Habilitar raciocínio melhora a aderência a instruções complexas (justamente a desambiguação). E não pode ser tratada como acessório; a v2 deve registrar a dependência A1↔E e, no mínimo, garantir que o modelo de produção rode com raciocínio adequado antes de validar A1.

**M6. C3 mexe em componente compartilhado sem checar consumidores.** `MessageInput` é usado pela bubble, pelo playground e possivelmente outros lugares. Falta uma step de `grep -rn "MessageInput" src/` antes de mudar o padding, para não regredir outros usos.

**M7. Sem estratégia de teste de frontend.** v1 admite o problema mas não resolve. `ProgressTrail` é puramente apresentacional: testável com `@testing-library/react`. O gating (clip some/aparece) também. v2 deve adicionar tasks de teste de componente, senão a verificação vira "fake".

**M8. A2b é uma task condicional vaga** ("se for X faça Y"). Reescrever como auditoria definida: ler o arquivo, decidir, registrar a decisão no commit. Aceitável como task de auditoria, mas o texto precisa ser assertivo.

## Achados menores

**m9.** D1 cita colapso "+N" sem especificar regra; depende de `ui-ux-pro-max` — ok, já marcado `[UI]`.
**m10.** Playground com `promptConfigOverride` substitui guardrails — perde os guardrails de segurança A3 numa sessão de teste custom. É por design (playground é admin-only), mas a v2 deve registrar a nota explicitamente.
**m11.** Shippability: Fases A, C, E são independentes e entregáveis sozinhas; B+D são acopladas. v2 pode marcar isso para permitir PRs parciais.
**m12.** C1 assume que o resolver de recursos já é chamado em `(protected)/layout.tsx`; a primeira step de C1 deve VERIFICAR isso antes de assumir.

## Decisões de design já tomadas (mantidas)

- Dropar a palavra "MCP" da UI (D2) e usar rótulo humanizado: consistente com a regra do `identity-base` de não citar termos técnicos. Melhora sobre o pedido literal. Mantido.

## Veredito

PLAN v1 reprovado para execução: M1 (épico), M2 (commit quebrado), M3 (lacuna real de comportamento), M4 (fragilidade do nano), M7 (verificação fake). Gerar PLAN v2 aplicando M1-M8 + m10-m12.
