# Review #1 da spec — Agente Nex: Configuração + Recursos

> Etapa [3] do workflow. Foco: lacunas, premissas frágeis, ambiguidade,
> o que está faltando. Alvo: spec v1
> (`docs/superpowers/specs/2026-05-22-agente-nex-config-recursos-design.md`).

## Achados materiais

1. **`reasoningEffort` inválido após troca de modelo** — a v1 define
   `reasoningEffort` como `String?` livre. Cada modelo aceita níveis
   diferentes. Se o usuário salva `high` e depois troca o modelo de produção
   para um que só vai até `medium` (ou não suporta raciocínio), o valor salvo
   fica inválido. **Falta:** regra de fallback — ao resolver o nível efetivo,
   se o `reasoningEffort` salvo não está em `model.reasoning.levels`, cair no
   maior nível disponível do modelo (ou no default do provider). A v2 precisa
   definir isso.

2. **Qual modelo determina o suporte a raciocínio** — §5.3 diz "modelo de
   produção ativo", mas o card de raciocínio tem 3 status, e o status
   `PLAYGROUND` exercita o agente no Playground. Ambiguidade: o travamento é
   sempre contra o modelo de produção (o do `LlmConfig` ativo)? E se o
   Playground usar outro modelo? **Resolução para a v2:** o suporte é checado
   contra o **modelo de produção ativo** (o `LlmConfig` ativo) — é o único
   modelo de conversação configurável; o Playground usa o mesmo modelo. Tornar
   isso explícito.

3. **Custo do raciocínio — definição vaga** — o usuário pediu "custo, preço,
   como a tabela de modelo, custo por 1M token". A v1 admite que a tag é só
   "indicação de impacto". Há tensão entre o pedido (custo concreto) e a
   realidade (tokens de raciocínio são variáveis). **Falta na v2:** definir
   concretamente o que o card exibe — proposta: o custo de **saída** do modelo
   ativo em `$/1M tokens` (é a tarifa real cobrada sobre os tokens de
   raciocínio) + a `TierBadge` do próprio modelo; e uma frase curta explicando
   que o raciocínio consome tokens de saída. Isso é honesto e concreto, sem
   inventar um preço/1M fictício para o nível.

4. **Catálogo síncrono → a spec não fixa a estratégia** — §6.1 reconhece o
   risco de `getModel`/`calculateCost` serem síncronos e usados no
   `usage-logger.ts`, mas joga a decisão para o plano. Isso é decisão de
   **design**, não de plano. **Resolução para a v2:** fixar — o catálogo
   efetivo é mantido num **cache em memória** do processo, carregado no
   primeiro acesso e revalidado após cada escrita na tabela de overrides
   (e por TTL). As funções públicas continuam **síncronas**, lendo do cache.
   Nenhum consumidor atual muda de assinatura.

5. **Wiring multi-provider — níveis vs budget de tokens** — §5.4 diz "OpenAI;
   o equivalente nos demais". Mas o conceito de nível (minimal/low/medium/high)
   é da OpenAI; Anthropic e Gemini usam orçamento de tokens de thinking. Mapear
   um para o outro não é trivial e a v1 não trata. **Resolução para a v2:** a
   entrega foca o provider **OpenAI** (o modelo ativo é OpenAI); o campo
   `reasoning.levels` no catálogo já permite cada modelo declarar seus níveis;
   o wiring para Anthropic/Gemini fica como extensão futura, registrada como
   não-objetivo desta entrega.

6. **`prompt/page.tsx` — o que permanece** — §4.1 diz que a `prompt/page.tsx`
   "para de carregar credenciais e initialResources", mas não afirma
   explicitamente que ela **continua** carregando `getAgentSettings` (para
   Identidade/Comportamento) e `listKbDocumentsAction` (para a Base de
   conhecimento). A v2 deve explicitar para não induzir a remover demais.

## Pontos menores (não bloqueiam, registrar)

- §6.2: a Server Action do botão "atualizar" deve ter rate limit / proteção
  contra cliques repetidos; a consulta à API de listagem é barata mas não é de
  graça. Registrar como detalhe de implementação.
- §10: a verificação deve incluir o caso "banco de overrides vazio → catálogo
  cai na base do código" como teste explícito.
- §4: vale uma frase confirmando que mover a *tela* de Recursos não afeta o
  componente do Playground (são coisas distintas).

## Veredito

6 achados materiais. A premissa central (3 frentes, híbrido, coordenação) é
sólida. Aplicar os achados gera a **spec v2**.
