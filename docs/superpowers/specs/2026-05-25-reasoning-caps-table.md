# REASONING_CAPS - Tabela canônica de capability por modelo

Tabela única referenciada por
`docs/superpowers/specs/2026-05-25-llm-adapters-modernization-design.md`
(SPEC v3) e implementada em `src/lib/agent/llm/catalog.ts`.

## Schema

```ts
export interface ReasoningCap {
  /** Niveis aceitos no parâmetro reasoningEffort. */
  levels: ReasoningEffort[]; // ["minimal","low","medium","high"] | ["auto"] | ["low","medium","high"] | ...
  /** false = card UI desativa quando este modelo for o ativo. */
  enabled: boolean;
  /** Tools + reasoning simultâneos? (Haiku 4.5 = false). */
  supportsWithTools: boolean;
  /** O provider decide internamente quando/quanto pensar? (Anthropic adaptive, Gemini -1). */
  adaptiveMode: boolean;
  /** Endpoint canônico da OpenAI. */
  openaiEndpoint?: "responses" | "chat-completions";
  /** Anthropic: tipo de thinking. */
  anthropicThinking?: "adaptive" | "enabled";
  /** Anthropic: precisa de beta header interleaved? */
  anthropicInterleavedAuto?: boolean;
  /** Faixa numerica do budget (Anthropic tokens, Gemini thinkingBudget). */
  budgetRange?: [number, number];
  /** Gemini: shape do parametro (3.x usa thinkingLevel string; 2.5 usa thinkingBudget int). */
  geminiShape?: "level" | "budget";
  /** OpenRouter: como passar reasoning (effort string vs max_tokens int). */
  openrouterShape?: "effort" | "max_tokens";
  /** Cap de output_tokens conhecido do modelo. Opcional (Anthropic obrigatorio, OpenAI opcional). */
  outputCap?: number;
  /** Quando adaptiveMode=true OU levels=["auto"], texto curto para subtitulo da UI. */
  autoModeHint?: string;
  /** Timeout customizado em ms (alto custo de reasoning pode exigir +). */
  requestTimeoutMs?: number;
}
```

## Tabela inicial

> Linhas ausentes ou `enabled:false` => `reasoningCapsOf` retorna `null`
> => card UI desativa o "Modo raciocínio".

### OpenAI (sempre `openaiEndpoint:"responses"`, sempre `supportsWithTools:true`, `enabled:true`)

| id                  | levels                                | adaptive | outputCap | timeoutMs |
|---------------------|---------------------------------------|----------|-----------|-----------|
| gpt-5.5             | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.5-pro         | low,medium,high                        | false    | -         | 180000    |
| gpt-5.4             | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.4-mini        | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.4-nano        | minimal,low,medium,high               | false    | -         | 60000     |
| gpt-5.4-pro         | low,medium,high                        | false    | -         | 180000    |
| gpt-5               | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5-mini          | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5-nano          | minimal,low,medium,high               | false    | -         | 60000     |
| gpt-5.3-codex       | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.2             | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.1             | minimal,low,medium,high               | false    | -         | 90000     |
| gpt-5.1-codex-mini  | minimal,low,medium,high               | false    | -         | 60000     |
| gpt-5-codex         | minimal,low,medium,high               | false    | -         | 90000     |
| o3                  | low,medium,high                        | false    | -         | 120000    |
| o3-pro              | low,medium,high                        | false    | -         | 240000    |
| o1                  | low,medium,high                        | false    | -         | 120000    |
| o1-pro              | low,medium,high                        | false    | -         | 240000    |

### Anthropic (sempre `supportsWithTools:true` exceto Haiku 4.5)

| id                  | levels                       | adaptive | thinking | interleavedAuto | budgetRange       | outputCap | autoHint     |
|---------------------|------------------------------|----------|----------|-----------------|-------------------|-----------|--------------|
| claude-opus-4-7     | low,medium,high              | true     | adaptive | true            | [1024, 24000]     | 128000    | -            |
| claude-sonnet-4-7   | low,medium,high              | true     | adaptive | true            | [1024, 24000]     | 64000     | -            |
| claude-opus-4-6     | low,medium,high              | true     | adaptive | true            | [1024, 24000]     | 128000    | -            |
| claude-sonnet-4-6   | low,medium,high              | true     | adaptive | true            | [1024, 24000]     | 64000     | -            |
| claude-opus-4-5     | low,medium,high              | false    | enabled  | false (beta)    | [1024, 16000]     | 64000     | -            |
| claude-sonnet-4-5   | low,medium,high              | false    | enabled  | false (beta)    | [1024, 16000]     | 64000     | -            |
| claude-haiku-4-5    | low,medium,high              | false    | enabled  | false (no beta) | [1024, 8000]      | 64000     | -            |

`claude-haiku-4-5` tem **supportsWithTools=false**. Reasoning desliga
automaticamente quando agente tem tools (sempre).

Mapping effort → budget_tokens (clampado a budgetRange):

- minimal: range[0]
- low: range[0] + 0.20 * (range[1]-range[0])
- medium: range[0] + 0.50 * (range[1]-range[0])
- high: range[1]

### Gemini

| id                       | levels                       | adaptive | geminiShape | budgetRange      | outputCap | autoHint        |
|--------------------------|------------------------------|----------|-------------|------------------|-----------|------------------|
| gemini-2.5-pro           | low,medium,high              | false    | budget      | [128, 32768]     | 65535     | -                |
| gemini-2.5-flash         | minimal,low,medium,high      | false    | budget      | [0, 24576]       | 65535     | -                |
| gemini-2.5-flash-lite    | minimal,low,medium,high      | false    | budget      | [512, 24576]     | 65535     | -                |
| gemini-2.5-pro-thinking  | low,medium,high              | false    | budget      | [128, 32768]     | 65535     | -                |
| gemini-2.5-flash-thinking| minimal,low,medium,high      | false    | budget      | [0, 24576]       | 65535     | -                |
| gemini-3-pro             | low,medium,high              | false    | level       | -                | 65535     | -                |
| gemini-3.1-pro           | auto                         | true     | level       | -                | 65535     | baixo, médio, alto |
| gemini-3.5-flash         | minimal,low,medium,high      | false    | level       | -                | 65535     | -                |
| gemini-3-flash           | minimal,low,medium,high      | false    | level       | -                | 65535     | -                |

`enabled:true`, `supportsWithTools:true` para todos.

### OpenRouter (todos com `supportsWithTools:true`, `enabled:true`)

| id                                  | levels                  | adaptive | openrouterShape | autoHint        |
|-------------------------------------|-------------------------|----------|-----------------|------------------|
| deepseek/deepseek-r1                | low,medium,high          | false    | effort          | -                |
| deepseek/deepseek-r1:free           | low,medium,high          | false    | effort          | -                |
| deepseek/deepseek-r1-0528           | low,medium,high          | false    | effort          | -                |
| deepseek/deepseek-r1-0528:free      | low,medium,high          | false    | effort          | -                |
| qwen/qwq-32b                        | low,medium,high          | false    | effort          | -                |
| qwen/qwq-32b:free                   | low,medium,high          | false    | effort          | -                |
| anthropic/claude-opus-4.7           | low,medium,high          | true     | effort          | -                |
| anthropic/claude-sonnet-4.7         | low,medium,high          | true     | effort          | -                |
| anthropic/claude-opus-4.6           | low,medium,high          | true     | effort          | -                |
| anthropic/claude-sonnet-4.6         | low,medium,high          | true     | effort          | -                |
| anthropic/claude-opus-4.5           | low,medium,high          | false    | effort          | -                |
| anthropic/claude-sonnet-4.5         | low,medium,high          | false    | effort          | -                |
| google/gemini-2.5-pro               | low,medium,high          | false    | max_tokens      | -                |
| google/gemini-2.5-flash             | low,medium,high          | false    | max_tokens      | -                |
| google/gemini-3-pro                 | low,medium,high          | false    | max_tokens      | -                |
| google/gemini-3.1-pro               | auto                     | true     | max_tokens      | médio, alto      |
| openai/gpt-5.4                      | minimal,low,medium,high  | false    | effort          | -                |
| openai/gpt-5.4-mini                 | minimal,low,medium,high  | false    | effort          | -                |
| openai/gpt-5.4-nano                 | minimal,low,medium,high  | false    | effort          | -                |
| openai/o3                           | low,medium,high          | false    | effort          | -                |

## Modelos sem entrada

Qualquer modelo não listado retorna `reasoningCapsOf(id) = null`.
Card UI fica desativado. Adapter ignora `reasoningEffort` quando recebido.

## Próximos passos

- Implementação direta em `catalog.ts` (`REASONING_CAPS: Record<string, ReasoningCap>`).
- Plan terá task de "completar a tabela validando contra a doc oficial
  de cada provider" antes de marcar a entrega como pronta.
