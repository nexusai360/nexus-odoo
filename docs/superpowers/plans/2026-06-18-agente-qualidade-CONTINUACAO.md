# Agente Nex , qualidade/assertividade + bugs de UX (CONTINUAÇÃO)

> Branch `feat/router-ativacao-r2`. Sessão de 2026-06-18 (tarde/noite).
> Tudo o que está marcado FEITO já foi deployado em produção e validado.
> O que está PENDENTE tem o root cause já achado , é só implementar.

## CONTEXTO
Usuário (Thiago/João) reclamou que o Agente Nex estava "burro": não raciocinava,
respostas inconsistentes/confusas, sem formatação. Diagnóstico + correções abaixo.

## ✅ FEITO E NO AR (prod)
1. **Raciocínio não era aplicado (root cause #1).** A UI mostrava "Alto/Produção",
   mas `reasoning_effort` no banco estava null e o runtime caía em `undefined`
   (`agentSettings.reasoningEffort ?? undefined`) = SEM raciocínio. O ReasoningCard
   mostra o nível efetivo como o maior do modelo quando null (resolveEffectiveLevel
   -> levels[last]), criando o mismatch UI-diz-Alto/código-manda-nada.
   - Fix de código (run-agent.ts ~923): null => maior nível do cap. (PR #133)
   - Fix de dado: prod `reasoning_effort=high`.
2. **Validador de resposta revertido pra `shadow`.** O modo `active` fazia chamada
   EXTRA à API OpenAI (retry corretivo, podendo escalar pro modelo forte) = gasto de
   token p/ auto-correção, PROIBIDO pelo usuário (correção é só aqui no cloud/Claude).
   Prod: `auto_validator_mode=shadow` (só loga; alimenta a correção offline).
3. **Regras de prompt (identity-base.ts):**
   - regra 5: negrito OBRIGATÓRIO nos números/nomes-chave (corrige a regressão de
     resposta crua que apareceu quando o raciocínio ligou , modelo formatava menos).
   - regra 12-real: ao detalhar "por empresa/CFOP/operação" após dar o faturamento
     REAL (sem intra-grupo), manter a base real e mostrar real + eliminado.
   - regra 12-nome: nome de empresa sempre completo/idêntico em todos os blocos.
4. **Perícia das configs do front (o que aplica x decorativo):**
   - APLICAM: disponibilidade (níveis canal), LLM provider/modelo/chave, checkpoints
     audio/image/feedback/suggestions/kb (via getPublicAgentFlags), maxSuggestions,
     janela de contexto, router (enabled+threshold+topK+modelos).
   - DECORATIVOS (não aplicam): **provider/modelo de ÁUDIO** (transcribe.ts hardcoda
     gpt-4o-mini-transcribe→whisper-1); **provider/modelo de IMAGEM** (imageProvider/
     imageModel não são lidos em runtime , imagem vai pro modelo da conversa).
5. **Verificação de dados (sem chute, via rerun-toolcall contra o cache):** os números
   das respostas estão CORRETOS. Ex.: Jds Comércio Matriz real R$1.200 / eliminado
   R$7,917M bate exato com a msg [10]. O agente, com raciocínio, acertou o cálculo
   real-por-empresa e foi HONESTO em "notas sem CFOP" (registrou lacuna, sem inventar).

## ⏳ PENDENTE (root cause já achado , só implementar)

### P1. Bubble desmonta ao fechar => perde pergunta/animação/indicador de áudio
- **Arquivo:** `src/components/agent/agent-bubble.tsx` (~linha 175: `{open ? <ChatPanel/> : null}`).
- **Root cause:** fechar a bubble DESMONTA a ChatPanel, perdendo todo o estado em
  andamento (pergunta otimista, animação "pensando", indicador de transcrição de áudio).
  Reabrir remonta e restaura do servidor; se a resposta ainda não foi persistida,
  parece que sumiu e a animação não volta.
- **Fix:** subir o estado da conversa (messages, pending/isThinking, optimistic user msg,
  flag de áudio) de ChatPanel para AgentBubble (lift state) OU manter ChatPanel montada
  e só ocultar (display:none) quando `!open`. ATENÇÃO ao comentário em agent-bubble.tsx
  linhas ~170-174: montar sempre já causou "FAB travado/cursor proibido" por causa do
  AnimatePresence , se for manter-montado, resolver a animação de saída junto.
- Testar local (sem token): abrir bubble, mandar pergunta, fechar, reabrir → pergunta +
  animação + indicador de áudio devem permanecer.

### P2. Onda de áudio feia na tela EXPANDIDA
- **Sintoma:** na bubble reduzida (canto inf. direito) a onda fica boa; na tela expandida
  fica espaçada, "nem dá pra saber que é onda".
- **Arquivos:** `src/components/agent/live-waveform.tsx` + `audio-recorder.tsx` (e o uso
  no chat-panel expandido). Provável: largura/quantidade de barras calculada pro tamanho
  reduzido; no expandido as barras esticam/espaçam. Igualar densidade/escala das barras
  ao modo reduzido (mesma aparência nos dois tamanhos).
- Testar local: gravar áudio na bubble e na expandida, comparar.

### P3. "12 tools" + inconsistência bruto x real (FALTA TOOL)
- **Root cause:** `fiscal_receita_consolidada` só dá o total do GRUPO (ou 1 empresa via
  empresaRef). Não existe tool que traga o faturamento REAL (sem intra-grupo) JÁ quebrado
  por empresa. Por isso, p/ "real por empresa", o agente chamou a tool 11x (uma por
  empresa) = as "12 tools" bizarras. E `fiscal_faturamento_por_empresa` só dá o BRUTO.
- **Fix (backend):** ou (a) adicionar um array `porEmpresa` ao output de
  `fiscal_receita_consolidada` (real + eliminado por empresa, em 1 chamada), ou (b) um
  param `excluirIntragrupo` em `fiscal_faturamento_por_empresa`. Tool em
  `mcp/tools/fiscal/receita-consolidada.ts`; query em `src/lib/reports/queries/fiscal.ts`
  (a eliminação intercompany é pairwise; replicar a lógica por empresa server-side).
  Depois, atualizar o catálogo (snapshot) e validar via `rerun-toolcall`.
- Com a regra 12-real do prompt, o agente já TENTA mostrar real+eliminado, mas sem a
  tool ele ainda faz N chamadas. A tool mata o over-tooling de vez.

### P4. Controles decorativos de áudio/imagem (decisão do usuário: consolidar)
- Recomendação aprovada: **largar o modelo de imagem** (5.4-mini, vision, já faz);
  **travar/honestar** o controle de áudio (transcrição é endpoint separado, só aceita
  gpt-4o-mini-transcribe/whisper). Remover/ajustar os dropdowns decorativos em
  `resources-toggles.tsx` + `reasoning-card`/cards de áudio/imagem, e (opcional) a action.

## MODELOS (recomendação dada)
2 modelos bastam: conversacional+visão = gpt-5.4-mini (sobe pro 5.4 full só se faltar
assertividade após as correções); transcrição = gpt-4o-mini-transcribe (obrigatório,
endpoint separado). Largar o 5.4-nano de imagem.

## REGRA DURÁVEL
Correção/julgamento NUNCA via API OpenAI (gasta token). Sempre offline, aqui no cloud
(Claude). Validador fica em `shadow`. Não ligar nada que faça retry/correção via request.
