# Review Crítica #2 — SPEC v2 Agente Nex Config Polish

> Achados profundos, foco em edge cases e inconsistências.

## S1 — TierBadge "free" precisa decidir símbolo

Os outros tiers usam símbolos curtos ($, $$, $$$, $$$$). "FREE" tem 4
chars. Largura visual diferente — pode quebrar layout dos cards.

→ **v3**: símbolo = "FREE" mesmo, com classe `text-xs font-bold` igual
aos outros e padding levemente reduzido para caber. Verde claro
`border-emerald-500/40 bg-emerald-500/15 text-emerald-600`.

## S2 — pinnedFirst + customMode interação

`SearchableSelect.customMode.sentinel` é o id especial ("__custom__").
Se eu colocar `pinnedFirst: [{value: "__custom__", label: "Outro..."}]`,
a lógica do trigger (que troca para input editable quando
`value === sentinel`) precisa continuar funcionando. Verificar render
do trigger em searchable-select.tsx:165-203.

→ **v3**: testar empiricamente. Se houver bug, a opção pinned passa
a ser um item normal que apenas dispara setValue(sentinel) externamente
(comportamento idêntico ao atual fromCatalog.push).

## S3 — `isLegacyModel` helper

Para mostrar "(legado)" no label. Função pura: `released && released < "2024-01"`.

→ **v3**: helper exportado de catalog.ts. UI usa `m.released && m.released < "2024-01" ? `${m.label} (legado)` : m.label`.

## S4 — `loadEffectiveModelsByProvider` callers

Outros consumidores:
- `configuracao/page.tsx:106` (LlmConfigForm)
- Não vejo outros via grep nominal

→ **v3**: filtro centralizado em `loadEffectiveModelsByProvider`
afeta só o config form. ResourcesToggles usa `listAudioModels`
/`listVisionModels` que filtram pelo capability — pré-2024 com
audio/vision continua aparecendo (R1 já cobre).

## S5 — Cleanup precisa varrer TODAS as referências

LlmModelEntry pode ser referenciado em:
- `LlmConfig.model` (string)
- `AgentSettings.audioModel` (string)
- `AgentSettings.imageModel` (string)
- `PlaygroundSession.model` (string) — verificar schema

→ **v3**: query single para coletar todos os ids referenciados:
```sql
SELECT model FROM llm_config WHERE model IS NOT NULL
UNION SELECT audio_model FROM agent_settings WHERE audio_model IS NOT NULL
UNION SELECT image_model FROM agent_settings WHERE image_model IS NOT NULL
UNION SELECT model FROM playground_session WHERE model IS NOT NULL
```

## S6 — Whitelist OpenRouter

Padrões propostos no v2 podem ser amplos. Vou restringir a famílias
conhecidas (não wildcards globais):

- `openai/gpt-(5|5\.[0-9]+|4o|4\.[0-9]+|o[1-9])(-[\w./-]+)?`
- `anthropic/claude-(opus|sonnet|haiku)-[34]([.-][\w./-]+)?`
- `google/gemini-(1\.5|2\.0|2\.5)([\w./-]+)?`
- `deepseek/deepseek-(chat|coder|r1|v[234])([\w./-]+)?(:free)?`
- `meta-llama/llama-(3\.3|4)([\w./-]+)?(:free)?`
- `mistralai/(mistral|codestral|mixtral)([\w./-]+)?`
- `qwen/qwen[\w.-]+(:free)?`
- `x-ai/grok-[34]([\w./-]+)?`
- `cohere/command-[\w.-]+`
- `perplexity/sonar([\w.-]+)?`
- `microsoft/phi-[34]([\w.-]+)?`
- `google/gemma-[\w.-]+(:free)?`

→ **v3**: padrões específicos por sub-família.

## S7 — Acentuação em strings existentes do refresh button

`llm-config-form.tsx:71-91` usa:
- "Catalogo sincronizado" → "Catálogo sincronizado"
- "Catalogo ja esta atualizado" → "Catálogo já está atualizado"
- "Falha ao atualizar." → "Falha ao atualizar." (OK)
- "novo(s)" / "atualizado(s)" / "reativado(s)" / "desativado(s)" — OK
- "fora da whitelist" → "fora da lista permitida"? "whitelist" é jargão
  técnico, manter
- "sem preco" → "sem preço"
- title: "Buscar modelos novos e atualizar precos do provedor" → "preços"

→ **v3**: revisar all strings do componente.

## S8 — fetchGemini supportedGenerationMethods

Modelos como `embedding-001` (embeddings, sem `generateContent`) não
servem para chat. Filtrar.

→ **v3**: fetchGemini filtra para apenas
`supportedGenerationMethods.includes("generateContent")`.

## S9 — Pricing oficial: fonte para curadoria

Já está no `catalog.ts` (base). Como sync NÃO modifica base, o pricing
oficial fica intacto. Anthropic/Gemini novos vão com pricing=null
→ exibem "preço sob consulta" → usuário pode atualizar manualmente
(há um campo `notes` mas não há UI de curadoria). Para esta onda:
deixar pricing=null e documentar débito de UI de curadoria.

## S10 — Reasoning Sync postergado: documentar débito

Adicionar entrada em `docs/RADAR.md` ou similar. Por agora: nota no
final do SPEC v3.

## S11 — Botão refresh — tooltip vs texto

Hoje tem só ícone com aria-label. Trocar para botão com texto NÃO
PRECISA de tooltip duplicado.

→ **v3**: remover `title` quando o texto já está visível.

## S12 — Card pai padding p-2

`<Card className="...p-2">`. Header pt-5 pb-5 adiciona 5+5 = 10
unidades verticais ALÉM do p-2 do card. Equilibrado com `pb-5` do
content que ALÉM do p-2 também (total p-2 + pb-5 = pb-7).
- Topo final: p-2 + pt-5 = pt-7
- Header → Content gap: pb-5 (do header) → conteúdo começa
- Content → Bottom: pb-5 + p-2 (bottom) = pb-7

Visualmente: pt-7 (topo) vs pb-7 (bottom). Simétrico. ✅

→ **v3**: confirma pt-5 pb-5 no header.

## S13 — Tests

Mudanças cobertas por testes existentes:
- TierBadge: precisa caso "free"
- catalog: filtros de listModels
- searchable-select: pinnedFirst + interação com filtro
- sync-catalog: fetchAnthropic / fetchGemini (mockados)
- cleanup script: classify logic com mocks

→ **v3**: plan inclui testes para cada novo helper.

## S14 — Resumo do que muda na v3

| # | Mudança vs v2 |
|---|---|
| S1 | TierBadge free: "FREE" texto, verde, pad reduzido |
| S2 | pinnedFirst + customMode: testar empiricamente |
| S3 | Helper `isLegacyModel(m)` em catalog.ts |
| S5 | Cleanup query única em todas as 4 tabelas |
| S6 | Whitelist OpenRouter padrões por sub-família |
| S7 | Acentuação em strings do llm-config-form |
| S8 | fetchGemini filtra por `generateContent` |
| S9 | Pricing Anthropic/Gemini = null (débito de UI registrada) |
| S10 | Reasoning sync postergado (registrar débito) |
| S11 | Remover title duplicado do botão refresh |
| S12 | Confirmado simétrico pt-5/pb-5 |
| S13 | Testes específicos por mudança |

Nenhum achado bloqueante. SPEC v3 é a final.
