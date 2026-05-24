# Review #2 — SPEC v2 (mais profunda)

Data: 2026-05-23
Alvo: `2026-05-23-agente-nex-polish-config-v2.md`

## Achados materiais (B-series)

### B1. SSE: `meta.source` não pode quebrar contrato existente
Adicionar `meta.source` no body do POST do endpoint SSE precisa ser
**opcional** e **backwards-compatible**. O WhatsApp do F5 nunca envia.
Definir: `meta` é objeto opcional, `source` ∈ `{ "bubble" | "suggestion"
| "whatsapp" | "playground" }`, default `"bubble"`.

### B2. Source `playground` afeta o prompt?
Não. Só `suggestion` muda comportamento. Os outros são para telemetria.

### B3. Cards expansíveis — accessibility
Chevron precisa ser `button` com `aria-expanded` + `aria-controls` para o
painel. Sem isso, screen reader não consegue. Já está implícito no
"chevron" mas precisa estar explícito na SPEC.

### B4. `localStorage` em SSR
Acessar `localStorage` durante render quebra hidratação. Pattern:
inicializar `useState` com default, `useEffect` lê do storage e
sincroniza. Adicionar nota.

### B5. ToolCallChip — id determinístico
LLM stream emite `tool_call_id` próprio. Usar isso como id do chip
(evita colisão e dá robustez a retries). Quando ausente (fallback),
gerar `crypto.randomUUID()`.

### B6. Custo qualitativo — usa o que como base?
Não temos número científico. Decidir uma fonte:
- OpenAI docs: minimal ≈ 1.0x base; low ≈ 1.5x; medium ≈ 3x; high ≈ 6x.
- Esses são chutes razoáveis para UI educacional, não cobrança.
- Adicionar nota explícita no tooltip: "estimativa, não valor de
  fatura".

### B7. Whitelist — manutenção mínima
B7.1. Documentar como atualizar a whitelist (PR comentado).
B7.2. Modelos da F4 onda 1 já em uso (gpt-5.4-nano, gpt-4o-mini, etc.)
**precisam** estar na whitelist desde o primeiro deploy ou o sync vai
ignorá-los.
B7.3. Definir whitelist inicial para os 4 providers:
- openai: `gpt-5\\..*`, `gpt-4o(-mini)?(-realtime)?`,
  `text-embedding-3-(small|large)`, `whisper-1`, `tts-1`.
- anthropic: `claude-(opus|sonnet|haiku)-4(-\\d+)?(-\\d{8})?`,
  `claude-3-(5|7)-sonnet.*`.
- google: `gemini-2\\..*`.
- openrouter: aceita o mesmo padrão; OpenRouter agrega múltiplos.

### B8. Reset de modelo após sync — risco de UX ruim
Se o usuário tem o modelo X selecionado e o sync remove X (porque o
provider retirou do catálogo), o agente para de funcionar. UX:
- Em vez de cair para tier production na hora, **manter** X em estado
  "deprecated" no banco (flag `deprecated` no `LlmModelEntry`) e mostrar
  banner amarelo "este modelo foi descontinuado, escolha outro".
- Só remove de verdade quando o usuário troca.

Vai exigir coluna `deprecated_at` na tabela `LlmModelEntry`.

### B9. Migrations — números e ordem
Convenção do repo: `<YYYYMMDDHHMMSS>_nome`. Vou usar `20260523HHMMSS_*`.
Ordem:
1. `whatsapp_enabled`
2. `search_unaccent_pg_trgm`
3. `llm_model_entry_deprecated`

### B10. Largura de tela — quebra a Plug MCPs
Plug MCPs hoje tem coluna sidebar fixa de ~360px. Se eu apertar para
`max-w-4xl`, a sidebar fica em ~120px, ilegível. Solução:
- Plug MCPs usa `max-w-5xl` (mais largo) e mantém `1fr,320px`.
- Outras telas usam `max-w-4xl`.
- Configuração ganha `max-w-3xl` (formulário central, sem sidebar).

Confirma na SPEC v3.

### B11. ResourceCard rename + componente compartilhado com ReasoningCard
Hoje o `ResourceCard` é privado do `resources-toggles.tsx` e o
`ReasoningCard` reimplementa o mesmo wrapper. Quero unificar:
- Promover `ResourceCard` para `src/components/agent/resource-card.tsx`
  com props `{ id, icon, title, subtitle, checkpoint, onCheckpoint…
  loading, defaultCollapsed?, collapsible? }`.
- `ReasoningCard` consome `ResourceCard` em vez de duplicar.
- Garante consistência visual depois do expandir/recolher.

### B12. Animação de loading — variante
Em vez de só `Loader2.animate-spin`, usar shimmer text? Decisão:
Loader2 + texto "Consultando estoque…" piscando suavemente (CSS
`animate-pulse` no texto). Quando finishedAt setado, troca para
`Check` + "Consultado estoque" sem pulse.

### B13. Mapa de label de tool
Lista de tools atuais (a confirmar lendo `src/lib/agent/tools/`):
- `consultar_estoque` → "estoque"
- `consultar_financeiro` → "financeiro"
- `consultar_produto*` → "produto"
- `consultar_comercial*` → "comercial"
- `consultar_kb` → "base de conhecimento"
- `bi_consulta_avancada` → "consulta avançada"
- (catch-all: nome humanizado a partir do toolName)

### B14. Telas com largura — também o login?
Não. Foco é o módulo agente. Outras áreas (financeiro, etc.) ficam
fora desta SPEC. Reafirmar §9 "Fora do escopo".

### B15. Tooltip de raciocínio — espelhar com modelo
Quando o modelo é Gemini ou Anthropic e o reasoning é controlado de
forma diferente (Anthropic usa `thinking`, Gemini não tem ainda),
o ReasoningCard tem que refletir isso. Já está coberto pelo
`modelSupportsReasoning`. Só validar.

### B16. `whatsappEnabled` na bubble in-app
Lógica do `app/(protected)/layout.tsx` lê `bubbleEnabled` para montar
`<AgentBubble />`. Não tem que ler `whatsappEnabled`. Confirma na v3.

### B17. Persistência de toggle WhatsApp — feature flag
Se F5 ainda não está em produção, ligar `whatsappEnabled` no
backend não faz nada (não há webhook). Não é problema (decisão #5 da
v2). Para a UI, adicionar nota cinza embaixo do toggle: "Webhook
WhatsApp em entrega — a chave grava agora e passa a valer quando F5
for ativada."

### B18. Botão "Atualizar" — feedback durante o sync
Sync pode levar 3-10s (chamada de catálogo por provider). Botão precisa
ficar disabled + loader + texto "Atualizando…". Toast final com
sumário.

### B19. Botão "Atualizar" — escopo
Pergunta: atualiza só do provider atual selecionado ou de todos? Hoje
parece ser de todos. Confirmar no código. Decisão: manter como está
(todos), mas mostrar "Atualizando catálogo de N provedores…".

### B20. Texto de raciocínio — refinar mais
"Escolha um modelo compatível na seção de conexão para liberar o
recurso." → "Para usar raciocínio, escolha um modelo compatível na
seção de conexão."

Mais direto, voz ativa.

### B21. Testes — ferramenta
Verificar se o projeto usa Jest ou Vitest. Pelo `package.json` decidir.
Convenção do arquivo segue o existente.

### B22. Migration de extensão Postgres — permissão
`CREATE EXTENSION` exige superuser. Em prod (Portainer) o user de
aplicação pode não ter. Mitigação: deixar migration tentar com `IF NOT
EXISTS`; documentar em `docs/runbooks/` que o DBA precisa rodar a
extensão se a migration falhar. Em dev (Docker Compose) o user é
superuser → ok.

### B23. Tool label fallback
Se um tool name não está no mapa, exibir nome cru sem `consultar_`
prefix, substituindo `_` por espaço: `consultar_kb` → "kb" (que vira
"base de conhecimento" pelo mapa); `cancelar_pedido` → "pedido". OK.

### B24. Suggestion source — preservar metadata no log
Quando `meta.source === 'suggestion'`, gravar no `agent_chat_message`
para auditoria (saber quanto da operação vem de sugestão clicada vs
digitação livre). Não obrigatório mas faz parte do polish. Decisão:
adicionar coluna opcional `source TEXT NULL` em mensagens do agente.

### B25. Texto "Encerrar sessão" — verificar atual
Briefing do usuário mencionou "Encerrar sessão" como item novo já
adicionado pelo agente anterior. Confirmar que está OK e não precisa
mudar.

## Decisões pendentes não-materiais

- Default da animação: pulse + spinner combinados ou só pulse?
  Decisão: spinner enquanto inflight, pulse no texto, check sem pulse
  no done.
- Cor do "consumo intenso": amber-500 (warning) ou neutro? Neutro com
  ícone de chamas. Pode revisar na UI review.

## Próximo passo

Aplicar B1–B25 → gerar SPEC v3 (final, vai para o PLAN).
