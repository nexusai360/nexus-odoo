# Review #2 da spec — Agente Nex: Configuração + Recursos

> Etapa [4] do workflow. Review mais profunda e adversarial sobre a spec v2:
> caçar inconsistência restante, conceito que não fecha, integração frouxa.

## Achados materiais

1. **Frente 2 ↔ Frente 3 não estão amarradas** — a Frente 2 adiciona o campo
   `reasoning` ao `ModelEntry`; a Frente 3 torna o catálogo híbrido (base +
   tabela no banco). Consequência não dita: a tabela de overrides precisa
   **espelhar o `ModelEntry` inteiro**, incluindo `reasoning`, senão um modelo
   vindo do banco não consegue declarar suporte a raciocínio. **v3:** a tabela
   `LlmModelEntry` espelha todos os campos de `ModelEntry` (id, provider,
   label, tier, pricing, use, audio, vision, reasoning, released, notes); o
   merge preserva `reasoning`.

2. **Cache em memória é por instância** — §6.1 diz "revalidado após cada
   escrita na tabela". Em produção (Next.js, múltiplas instâncias / serverless)
   o cache vive em cada processo. A escrita numa instância **não** invalida o
   cache das outras. **v3:** precisar — o cache é por instância; a instância
   que escreve revalida na hora; as demais revalidam por **TTL** (curto, ex.
   alguns minutos). Para um catálogo de modelos isso é perfeitamente aceitável
   (não é dado quente que precisa de consistência imediata cross-instância).

3. **Seletor de nível quando o recurso está OFF** — §5.3 diz "quando suporta:
   aparece o seletor de nível". Mas se o `reasoningCheckpoint` está `OFF`, o
   recurso está desligado e mostrar o seletor é incoerente com os outros cards
   (que só expandem a área quando `!= OFF`). **v3:** o seletor de nível e o
   custo aparecem quando o modelo suporta **E** o status `!= OFF` — igual ao
   padrão de áudio/imagem.

4. **`updateAgentResources` ganha campos novos — e é arquivo compartilhado** —
   §5.1 fala da migration do schema, mas não diz que a action
   `updateAgentResources` (e seu schema Zod) precisa aceitar `reasoningCheckpoint`
   e `reasoningEffort`. Esse arquivo (`agent-config.ts`) é compartilhado com o
   `claude-agente-nex-melhorias`. **v3:** registrar explicitamente que a action
   e o Zod ganham os 2 campos, e que isso é feito respeitando a regra de
   coordenação (esperar o outro agente).

5. **Pesquisa sem rastro** — §7 manda preencher `catalog.ts`, mas modelos e
   suporte a raciocínio mudam. **v3:** além de preencher o catálogo, registrar
   um documento em `docs/superpowers/research/` com a tabela modelo → suporte →
   níveis, a fonte (doc oficial do provedor) e a data de verificação.

6. **Falta a diretriz de ordem de implementação** — a §3 lista o que é
   compartilhado mas não diz a ordem. A regra do usuário ("exclusivos primeiro,
   compartilhados só depois que o outro terminar") precisa virar uma diretriz
   explícita de sequência. **v3:** adicionar à §3 a ordem — implementar primeiro
   os arquivos exclusivos (catálogo, scripts, componente novo, `llm-config-form`,
   as duas pages); tocar os compartilhados (`resources-toggles`, `agent-config`,
   `schema.prisma`, `openai.ts`) só após confirmar que o `claude-agente-nex-melhorias`
   terminou neles.

## Pontos menores (registrar, não bloqueiam)

- §4: a tela de Configuração usa `PageShell variant="narrow"`; a seção Recursos
  tem cards com grid de 3 colunas. Verificar na implementação, com
  `ui-ux-pro-max`, se cabe bem em `narrow` ou se a tela passa a `wide`.
- §6.2: o botão "atualizar" age sobre o **provedor atualmente selecionado** no
  `LlmConfigForm`; os scripts CLI podem rodar um provedor ou todos.

## Veredito

6 achados materiais. A spec v2 já estava sólida; os achados são de integração e
precisão, não de concepção. Aplicar gera a **spec v3** — pronta para o plano.
