# R2-ctx , Bateria de ajustes de UI/comportamento , Plan

> 2026-05-29. Ajustes pedidos pelo usuário sobre os blocos novos (Janela de contexto +
> Configuração de Router) e o painel. Uma task por ajuste, executadas uma a uma, com teste
> onde houver lógica. pt-br, sem em dash. UI via `ui-ux-pro-max` (consistência).

## Tasks (mapeamento 1:1 dos pedidos)

### T1 , ApiKeySelect com a MESMA cara do select de chave do LLM config (imgs 1, 2, 3)
- **Arquivo:** `src/components/ui/api-key-select.tsx`.
- **Problema:** a caixa de chave ficou mais escura (bg diferente) que Provedor/Modelo, fonte/estilo diferentes do padrão. O selecionado deve ficar branco (foreground); só "Nova chave de <Provedor>" em violeta; opção "Label · ••••XXXX".
- **Fix:** alinhar o `trigger` e o painel ao padrão do `CustomSelect` (mesma altura h-10, mesmo bg `bg-background`/borda, mesma fonte). Conferir as classes exatas do `CustomSelect` e replicar. Texto da chave selecionada = `text-foreground` (branco no dark), check para indicar seleção, ação "Nova chave" em `text-violet-...`. Garantir que a caixa de Chave fique IGUAL em cor às de Provedor/Modelo.
- **Aplica em:** áudio, anexo, e os 2 sub-blocos do Router (Construção da pergunta + Embeddings).
- **Verif.:** visual + `tsc`.

### T2 , Cor das caixas Provedor/Modelo/Chave iguais
- Decorre de T1 (a Chave usa o mesmo bg do CustomSelect). Conferir lado a lado no print.

### T3 , Tier badge (tag de preço colorida) nos modelos do Router (imgs 4 vs 5/8)
- **Arquivos:** `src/components/agent/router-config-card.tsx`.
- **Fix:** `modelOptions` deve incluir `endAdornment: <TierBadge tier={m.tier} />` e `notes: modelDescription(m)` (igual ao `modelOptions` de `resources-toggles.tsx`). Aplica nos selects de Modelo da Construção da pergunta E de Embeddings.
- **Verif.:** visual (coin colorido aparece) + `tsc`.

### T4 , Construção da pergunta = só modelos de conversação (img 5)
- **Arquivos:** `router-config-card.tsx` (+ helper de catálogo).
- **Problema:** o select mostra Text Embedding e Whisper (áudio). Deve mostrar só chat.
- **Fix:** filtrar `chatModelsByProvider[provider]` para excluir `use === "embedding"` e `audio === true`/`use === "áudio"`. Usar um helper `listChatModels(provider)` (novo em `catalog.ts`) OU filtrar o efetivo na page. Preferir helper no catálogo, com teste.
- **Verif.:** teste unit `listChatModels` + visual.

### T5 , Pesquisa: modelos de transcrição de áudio (img 4)
- **Arquivos:** `catalog.ts`.
- **Ação:** pesquisar quais modelos fazem transcrição (GPT-5.4 mini/nano? outros provedores?). Incluir no catálogo SÓ os reais, com `audio:true`, `use:"áudio"`, pricing e tier. NÃO inventar modelos.
- **Verif.:** lista de áudio reflete + `tsc`.

### T6 , Provedor de áudio/anexo: só provedores COM chave E capability (imgs 6, 7)
- **Arquivos:** `catalog.ts` (PROVIDERS_WITH_AUDIO/VISION) + `resources-toggles.tsx`.
- **Problema:** só aparece OpenAI; usuário tem OpenAI + OpenRouter.
- **Ação:** pesquisar capability de áudio/visão por provedor (OpenRouter expõe modelos de transcrição/visão?). Adicionar ao catálogo os modelos reais por provedor. O filtro de provedor já é `PROVIDERS_WITH_X ∩ (tem credencial)`; o que falta é o catálogo ter os modelos desses provedores. Manter a regra (provedor só aparece se tem chave E tem modelo da capability).
- **Verif.:** com chave OpenRouter, OpenRouter aparece (se tiver modelo de áudio/visão real no catálogo).

### T7 , Embeddings multi-provedor (imgs 8 + texto)
- **Arquivos:** `catalog.ts` (PROVIDERS_WITH_EMBEDDING + modelos), `router-config-card.tsx` (provedor selecionável), backend `embed.ts`/credencial.
- **Ação:** pesquisar modelos de embedding por provedor (OpenAI, OpenRouter, Gemini, Anthropic). Adicionar ao catálogo. Provedor de Embeddings deixa de ser fixo OpenAI: mostra provedores COM chave E COM modelo de embedding (usuário: OpenAI + OpenRouter). Modelo filtra para embeddings do provedor.
- **ATENÇÃO BACKEND (risco):** `embed()` é OpenAI-only e a credencial é fonte única do RAG; além disso os vetores de domínio (`embed-domains`) precisam usar o MESMO modelo/dimensão da pergunta, senão o cosseno quebra. Trocar provedor/modelo de embedding exige: (a) `embed()` honrar provider/model configurados; (b) re-embeddar os vetores de domínio; (c) checagem de dimensão. Decisão a cravar antes de liberar no UI: ou habilita o backend multi-provider de verdade, ou mantém execução OpenAI e só expande as opções quando o backend suportar. **Não liberar opção que o backend não executa.**
- **Verif.:** teste do filtro + (se backend habilitado) e2e de embedding com o provider escolhido.

### T8 , Slider da Janela de contexto fluido (img 9)
- **Arquivos:** `src/components/ui/range-slider.tsx`, `src/components/agent/context-window-card.tsx`.
- **Problema:** persiste a cada passo do arrasto (trava). Deve mover o indicador fluido e persistir só ao SOLTAR.
- **Fix:** RangeSlider separa `onChange` (live, evento `input`) de `onCommit` (evento `change`/pointerup). ContextWindowCard atualiza estado local no `onChange` e chama `persistResources` só no `onCommit`.
- **Verif.:** teste de que onCommit dispara no change e onChange no input + visual.

### T9 , Remover "Credencial OpenAI para embeddings" do Monitoramento > Router (img 10)
- **Arquivos:** `src/app/(protected)/agente/monitoramento/router/page.tsx` (+ remover uso de `router-embedding-credential.tsx` lá).
- **Fix:** tirar o bloco de credencial de embedding (agora vive em Configuração). Deixar só o bloco "Configuração" (parâmetros do router) e melhorar a descrição/título (ex.: "Configuração do router de catálogo" com texto completo). Não apagar a action/componente (ainda usados em Configuração via getEmbeddingCredentialStatus/setEmbeddingCredential).
- **Verif.:** painel sem o bloco de credencial + `tsc` + build.

## Ordem de execução
T8, T9, T3, T4, T1/T2 (quick, baixo risco) -> T5, T6 (pesquisa de catálogo) -> T7 (maior risco, backend). Cada uma: implementar + teste + `tsc` + commit atômico.

## Verificação final
`tsc` + `eslint` + `jest` + `next build`; rebuild containers; validação visual; atualizar PR #37.
