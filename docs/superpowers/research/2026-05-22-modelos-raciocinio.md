# Suporte a modo raciocínio por modelo — pesquisa

> Task 1 do plano `2026-05-22-agente-nex-config-recursos.md`.
> Data de verificação: 2026-05-22.
> Fontes: documentação de reasoning models da OpenAI (`reasoning_effort`),
> extended thinking da Anthropic, thinking do Gemini, e herança de família
> para os modelos pós-cutoff que o `catalog.ts` do projeto define
> (gpt-5.4/5.5, claude 4.6/4.7 etc.) — esses seguem o comportamento da família.

## Regra por família

| Família | Raciocínio? | Mecanismo | Níveis |
|---|---|---|---|
| OpenAI série `o*` (o1, o3, o1-pro, o3-pro) | Sim | `reasoning_effort` | low, medium, high |
| OpenAI série `gpt-5*` (todas as variantes 5, 5.1…5.5) | Sim | `reasoning_effort` | minimal, low, medium, high |
| OpenAI `gpt-4*` e anteriores | Não | — | — |
| OpenAI transcrição (transcribe, whisper) | Não | — | — |
| Anthropic Claude 4.x (opus/sonnet/haiku 4.5+) | Sim | extended thinking (budget de tokens) | wiring futuro |
| Anthropic Claude 3.x | Não | — | — |
| Gemini 2.5 (pro/flash/flash-lite) | Sim | thinking | wiring futuro |
| Gemini 2.0 / 1.5 | Não | — | — |
| DeepSeek R1 / Qwen QwQ / Perplexity Sonar Reasoning (via OpenRouter) | Sim | reasoning nativo | wiring futuro |
| Demais modelos chat (DeepSeek V3/V4, Llama, Mistral, Gemma, Grok, Phi, Command, Qwen instruct) | Não | — | — |

## Decisão de escopo para esta entrega

O **wiring** desta entrega cobre só o provider **OpenAI** (`reasoning_effort`).
Portanto o campo `reasoning` em `catalog.ts` é preenchido **somente nos modelos
OpenAI** que suportam — assim o card de Modo Raciocínio só destrava quando há
wiring real por trás, evitando o estado inconsistente "ligado mas sem efeito".

Anthropic, Gemini e os modelos de raciocínio via OpenRouter estão documentados
acima e entram no `catalog.ts` quando o wiring multi-provider for implementado
(extensão futura registrada na §5.4 e §8 da spec).

## Modelos OpenAI com `reasoning` no catálogo (esta entrega)

Níveis `["minimal","low","medium","high"]`:
gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.4-nano,
gpt-5.3-codex, gpt-5.2, gpt-5.1, gpt-5.1-codex-mini, gpt-5, gpt-5-codex,
gpt-5-mini, gpt-5-nano.

Níveis `["low","medium","high"]`:
o3-pro, o3, o1-pro, o1.

Sem `reasoning` (não suportam): gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini,
gpt-4-turbo, gpt-4, gpt-4o-transcribe, gpt-4o-mini-transcribe, whisper-1, e
todos os modelos Anthropic/Gemini/OpenRouter nesta onda.
