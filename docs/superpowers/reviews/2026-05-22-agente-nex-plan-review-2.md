# Review #2 — Plano Melhorias do Agente Nex (sobre a v2)

Auditoria adversarial profunda. Caçar conceito quebrado, premissa que mata a entrega, contradição interna.

## Achados graves (podem zerar o efeito da entrega)

**R9 (CRÍTICO). O prompt hardcoded pode não estar em uso.** `composeSystemPrompt` usa `AgentSettings.identityBase` (DB) NO LUGAR do `IDENTITY_BASE` hardcoded quando ele está setado; e `advancedOverride` faz bypass total. Se a instalação de produção tiver `identityBase` ou `advancedOverride` salvos no banco, TODAS as mudanças de A1/A2/A4 (que editam o arquivo `IDENTITY_BASE`) não têm efeito nenhum. A v2 não verifica o estado do banco. Sem endereçar isso, a entrega de comportamento pode ser inócua. **Correção:** Task A0 obrigatória e primeira — auditar a linha `AgentSettings` (`id="global"`): se `identityBase`/`advancedOverride` não-nulos, decidir entre atualizar o valor no banco ou mesclar as mudanças nele.

**R8 (grave). `DEFAULT_GUARDRAILS` é morto para instalações existentes.** `DEFAULT_GUARDRAILS` só semeia install NOVO; `loadAgentSettings` lê os guardrails do banco. Acrescentar itens ao array não atualiza a linha já gravada em produção. A3-step3 não chega ao usuário real. **Correção:** a regra de segurança precisa viver no `IDENTITY_BASE` (sempre aplicado, salvo R9), não só em `DEFAULT_GUARDRAILS`. Manter o array como secundário (novos installs).

## Achados materiais

**R2 (conceito quebrado). Contradição com "máximo 3 frases".** `IDENTITY_BASE` linha 14: "Máximo 3 frases por resposta". A mensagem de desambiguação (2 eixos + lista de produtos) excede 3 frases. Instruções conflitantes para o modelo. A1 precisa também emendar a regra de "Postura" abrindo exceção explícita para mensagens de desambiguação e listas.

**R3 (conflito real). Cap de sugestões vs "listar os 5".** `run-agent.ts`: `extractSuggestions` limita a `MAX_SUGGESTIONS = 3` e `MAX_SUGGESTION_LEN = 60`. O usuário pediu explicitamente "listar os cinco puxadores" como sugestões. Nomes como "PUXADOR CORDA ALCA DE NYLON - 093334" passam de 60 chars e seriam descartados. **Correção:** decidir — ou elevar os limites para o caso de desambiguação, ou padrão "3 sugestões + a desambiguação no corpo lista os 5". v3 deve travar essa decisão e, se elevar limites, criar task em `run-agent.ts`.

**R4 (risco de bug). `tool_call`/`tool_result` sem id de correlação.** D3b diz "marcar o passo correspondente done", mas os eventos só carregam `label` (genérico) — duas tools do mesmo domínio colidem. **Correção:** casar por FIFO (primeiro passo `running` com aquele label vira `done`) e especificar isso em D3b. Alternativa: propagar um índice/id de chamada.

**R1 (lacuna de verificação). Testes existentes vão quebrar.** `compose.test.ts` provavelmente tem asserts por string sobre o texto atual do prompt. Reescrever blocos de `IDENTITY_BASE`/`compose.ts` quebra esses asserts. A v2 não tem task para auditar e corrigir os testes existentes — execução bateria em vermelho não previsto. **Correção:** task de auditoria de `compose.test.ts` + `identity-base` antes de fechar a Fase A.

## Achados menores

**R5.** Inconsistência: v2 diz "Fase C independente" mas a ordem de execução põe C depois de B4. Limpar: C é independente de B/D de fato; a ordem só importa para B↔D. v3 deve separar "dependências" de "sugestão de ordem".

**R7.** A `ProgressTrail` é viva (efêmera): conversas recarregadas do histórico filtram `role:"tool"` e não reconstroem a trilha. É aceitável, mas v3 deve declarar "trilha é live-only".

**R10.** Verificar os valores válidos de `reasoning_effort` do modelo real em E2 (pode não haver `minimal`).

**R11.** ~28 tasks. v3 deve confirmar que A, C, E são PRs independentes e B+D um PR conjunto, para não virar um PR monstro.

## Veredito

PLAN v2 reprovado por R9 (pode zerar a entrega) e R8 (guardrail morto). Gerar PLAN v3: adicionar Task A0 (auditoria do AgentSettings de produção), mover guardrail de segurança para `IDENTITY_BASE`, emendar regra das 3 frases, resolver o cap de sugestões, especificar matching FIFO em D3b, adicionar task de auditoria de testes, limpar a seção de ordem/dependências.
