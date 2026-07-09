# F6 , Jornada Guiada de Construção de Relatório (design / spec v3)

> Data: 2026-06-27. Branch: `feat/nex-reconstrucao`. Fase: F6 (Construtor).
> **REGRA DURÁVEL: F6 só local. Nada de merge/deploy sem aprovação explícita do usuário.**
> Histórico: v1 -> review adversarial #1 (arquitetura/código) -> review adversarial #2
> (produto/UX/prompt) -> **v3** (este documento). As correções das duas reviews estão
> aplicadas; a seção 18 lista o que mudou e por quê.

## 1. Contexto e problema

O construtor atual deixa o usuário "pedir um relatório do nada": manda um prompt e
recebe uma ficha, sem acompanhamento, sem entender o que pode pedir, sem saber o que o
sistema faz ou não. Resultado raso, usuário no escuro.

Esta feature substitui isso por uma **jornada guiada**: a IA conduz uma conversa
adaptativa, entende a fundo o que o usuário quer, orienta sobre o que é possível, e só
gera quando entendeu o suficiente, com muito mais assertividade. Meta emocional:
"a IA me entendeu, estamos na mesma sintonia".

## 2. Princípios (regem toda a spec)

1. **Adaptativo, nunca engessado.** Não é formulário nem wizard de passos fixos. O
   prompt decide quais perguntas, em que ordem, mesclando quando o usuário já
   respondeu, aprofundando quando é complexo, pulando o que não se aplica. Número de
   perguntas relativo à complexidade/clareza (simples ~3 a 4; complexo ~10+).
2. **Entendimento (não "maturidade burocrática") gateia a geração.** A IA só leva o
   usuário a gerar quando entende o suficiente. "Entender o suficiente" é verificado
   por EVIDÊNCIA OBJETIVA da ficha em construção (seção 6), não por auto-declaração do
   modelo. Antes disso o usuário não gera; se apressar, a IA não bloqueia secamente:
   ela reflete o que já entendeu, diz o que ainda falta, e oferece sempre uma saída
   digna ("posso montar uma primeira versão com o que entendi e você ajusta no
   editor"). Quem tem um pedido claro de primeira atinge o entendimento rápido.
3. **Sempre fechar com reflexão de entendimento.** Antes de oferecer a geração, a IA
   sempre devolve, em linguagem natural, o que entendeu ("deixa eu confirmar: você
   quer ver X, recortado por Y, com Z, é isso?"). Esse gesto transmite "entendi" tanto
   no caso rápido quanto no longo, e fecha o interrogatório.
4. **Honestidade de capacidade, proativa.** A IA declara o escopo logo na abertura
   (hoje: estoque), de forma convidativa, para o usuário se reorientar antes de pedir
   o impossível. Para o que não dá: sempre "ainda não é possível" (nunca "não dá"),
   com o caminho mais próximo. Gaps de capacidade durante a conversa são tratados
   CONVERSACIONALMENTE (a jornada continua), não encerram o turno.
5. **Reuso total.** Mesma ficha (`BuilderReportEntry`), mesmas tools de mutação, e os
   mesmos componentes visuais do "Consumo do Agente Nex" que o renderer já usa.

## 3. Escopo

**Dentro (v1):**
- Conversa adaptativa com histórico (entrevista) + reflexão de entendimento.
- Gate de entendimento baseado em EVIDÊNCIA da ficha (não auto-relato).
- Catálogo de capacidades (capability map) com KPIs e visualizações CURADOS por fonte,
  alimentando prompt e opções; declaração de escopo proativa; lista de "ainda não".
- Reflexo de entendimento em LINGUAGEM NATURAL (não um checklist de 7 caixas).
- Cards de OPÇÃO leves (thumbnails estáticos/ilustrativos) para escolha de
  visualização/arranjo, via tool estruturada + evento SSE.
- Tela de resumo (com itens contestáveis) + botão "Gerar" + animação + transição para
  o 2-pane atual (refino).
- Histórico de conversa threaded no `runBuilder`; tools novas de jornada plumbed pelo
  `executarTool`/`ToolExec`/loop; estado de jornada persistido na conversa.

**Fora (ondas futuras):**
- **Prévia viva do componente real em miniatura dentro do chat.** Cortada da v1 (cara,
  arriscada visualmente, e a prévia viva real já existe no 2-pane do refino). Entra
  numa onda seguinte se provar valor. Decisão tomada apesar da preferência inicial
  "híbrido": as duas reviews apontaram como o maior risco/custo sem ganho proporcional;
  o "uau" da v1 vem da conversa fluida + do 2-pane real.
- Novos domínios de dado além de estoque (vendas/pedidos/financeiro). Tratados como
  "ainda não é possível".
- Reforma estética do preview do 2-pane (remover canvas, rolagem vertical, 75%, botão
  expandir com animação). Onda própria depois.
- Tipos de gráfico novos (3D etc.).

## 4. Arquitetura (Opção A , blueprint incremental, com correções)

A jornada é uma fase conversacional dentro do construtor. A IA monta a MESMA ficha
(`BuilderReportEntry`) com as tools existentes (`criar_relatorio`, `adicionar_secao`,
`definir_filtro`, `mover_secao`, `definir_cor_secao`...) + tools novas de jornada
(seção 8). Correções estruturais que a v1 não tinha:

- **Histórico threaded.** Hoje `runBuilder({prompt, fichaAtual, user})` é stateless por
  turno (reconstrói `messages = [system, ficha?, prompt]`). Sem o histórico, não há
  entrevista. v3: `runBuilder` ganha `historico: {role, content}[]` (lido de
  `builder_messages`), e o `messages` passa a incluir os turnos anteriores. Muda a
  assinatura do `runBuilder` e do `/api/builder/stream`.
- **Ficha não vira SavedReport abrível antes de Gerar.** Hoje todo turno com ficha
  válida cria/atualiza um `SavedReport` rascunho e o botão "Abrir relatorio" já navega
  pra ele. Isso esvazia o gate. v3: durante a ENTREVISTA a ficha vive no
  `journeyState` (rascunho em memória/JSON), NÃO como `SavedReport` abrível. O
  `SavedReport` (abrível, listável em "Meus relatórios") só é promovido no "Gerar" da
  tela de resumo. A "animação de geração" passa a ter substância (é a promoção +
  primeira resolução completa), não é cosmética.
- **Tools de jornada plumbed.** `executarTool(name, args, ficha, journeyState)` e o
  tipo `ToolExec` ganham a variante `{ tipo: "jornada"; journeyState }`. O loop do
  `runBuilder` carrega e devolve `journeyState`; `RunBuilderResult` inclui
  `journeyState`. (A v1 dizia "despachadas no executarTool" sem reconhecer que o canal
  não existe.)

## 5. Fases da conversa

- **ENTREVISTA (chat centralizado).** A IA conduz a conversa adaptativa, reflete
  entendimento, monta a ficha por baixo (no journeyState). Gaps de capacidade são
  conversados, não encerram o turno. A geração não está disponível enquanto o
  entendimento (seção 6) não for atingido; ao apressar, a IA reflete + oferece a saída
  digna sem bloquear secamente.
- **RESUMO.** Disparada quando (a) o entendimento é elegível por evidência E (b) o
  usuário aceita a oferta de gerar. A IA monta um resumo estruturado, com cada item
  CONTESTÁVEL ("ajustar isso" devolve a pergunta certa ao chat e volta para
  ENTREVISTA). Só aqui aparece o botão "Gerar relatório".
- **REFINO (2-pane atual).** Após "Gerar": animação, promoção a `SavedReport`, e o
  layout 2-painéis atual (chat à esquerda, preview à direita). Edições manuais aqui
  (mover/remover/cor/inline) NÃO precisam sincronizar journeyState (o refino não
  depende mais de cobertura). Transição reversível: pedir mudança estrutural grande
  pode voltar à conversa, mas isso é tratado pelo fluxo normal de tools.

## 6. Entendimento por evidência (substitui o "gate de maturidade circular")

O problema da v1: quem marcava cobertura E declarava maturidade era o mesmo LLM, então
o backend validava auto-relato contra auto-relato (não era estrutural). v3 amarra o
gate a EVIDÊNCIA OBJETIVA da ficha + sinais independentes:

**`entendimentoElegivel(journeyState, ficha, historico)` (puro, testável)** retorna
true só quando TODAS as condições objetivas valem:
1. **Dados**: a ficha tem ≥1 seção com `fato` que existe no registry (fonte real).
2. **Visualização**: a ficha tem ≥1 seção com template válido que renderiza.
3. **Indicadores**: a ficha tem ≥1 `KPIRow` OU o usuário declarou explicitamente não
   querer KPIs (registrado via tool).
4. **Objetivo**: houve ≥2 turnos de usuário com conteúdo substantivo (evita "1 clique
   e pronto") OU o 1º pedido já satura Dados+Visualização+Indicadores (atalho de
   pedido claro, conciliando o "fecha rápido").

A IA só pode chamar `oferecer_geracao` quando `entendimentoElegivel` é true; o backend
RECUSA a oferta/resumo se a evidência não bate (defesa estrutural real, independente da
palavra do modelo). A cobertura auto-declarada pela IA (seção 7) serve para a reflexão
em linguagem natural e para a UX, NÃO como gate.

**Anti-loop e anti-pressa:** teto suave , após K turnos (ex.: 8) sem elegibilidade, a
IA passa a propor ativamente uma primeira versão ("monto com o que entendi?") em vez de
seguir perguntando. Piso , o atalho do item 4 exige saturar Dados+Visualização (que são
evidência objetiva), então "pedido claro" não vira relatório vazio.

## 7. Reflexo de entendimento (substitui a trilha de 7 caixas)

A v1 expunha 7 dimensões nomeadas acendendo de `pendente` a `coberta`. As reviews
apontaram que isso É o checklist engessado que o dono rejeita (denuncia o esqueleto,
mata o "ela me entendeu"). v3:

- **Não há HUD de 7 caixas.** O progresso aparece como um **resumo em linguagem
  natural que cresce**: um bloco discreto ("Até aqui entendi: você quer o estoque
  parado, recortado por marca, com valor imobilizado e uma tabela") que a IA atualiza
  via tool `atualizar_entendimento({ texto })`. É emocional e não-enumerado.
- Internamente, as 7 dimensões (Objetivo, Dados, Indicadores, Visualização, Filtros,
  Layout/Cor, Período) seguem existindo como CHECKLIST INVISÍVEL no journeyState, para
  o prompt saber o que ainda falta perguntar. Mas NÃO viram UI de caixas. O usuário vê
  conversa + o resumo natural crescendo, nunca rótulos técnicos como "recorte" ou
  "temporalidade".

## 8. Tools novas de jornada (plumbed pelo executarTool/loop)

Todas atuam no `journeyState` (não na ficha). `executarTool` e o loop passam a
carregar/devolver `journeyState`; `ToolExec` ganha `{ tipo: "jornada"; journeyState }`.

- `atualizar_entendimento({ texto })` , define/atualiza o resumo natural mostrado ao
  usuário (seção 7). Também marca internamente quais dimensões a IA considera tocadas.
- `oferecer_opcoes({ titulo, opcoes: [{ id, rotulo, descricao, tipoVisual? }] })` ,
  emite cards de escolha leves (thumbnails) via evento SSE; o backend VALIDA cada
  opção contra o capability map e descarta inválidas. (Tool estruturada, não markup
  inline no texto, que modelos pequenos quebram.)
- `oferecer_geracao({ motivo })` , a IA sinaliza que dá para gerar. O backend só aceita
  se `entendimentoElegivel` (seção 6) for true; caso contrário responde ao modelo que
  ainda falta evidência X, e a conversa continua. Disparar a oferta aceita -> fase
  RESUMO.
- `montar_resumo()` , monta o snapshot estruturado (objetivo, dados, indicadores,
  visualizações, filtros, layout, período) lido da ficha + entendimento, para a tela
  de resumo. Cada item carrega a "dimensão" que o originou, para o "ajustar isso".

A ficha continua mexida pelas tools existentes.

## 9. Capability map (catálogo de capacidades CURADO)

`src/lib/reports/builder/capabilities.ts`, fonte única consumida pelo prompt (repertório
+ honestidade) e pela UI (opções). Vai ALÉM de derivar `listarFontes()`: é curado.

- **escopoAtual**: frase de abertura honesta ("hoje monto relatórios ricos sobre o seu
  estoque: saldo, parados, movimentação, por marca/armazém/família; vendas e financeiro
  estão chegando").
- **fontes[]**: por fato, além do `SourceContract`: rótulo amigável, exemplos de
  perguntas, **KPIs sugeridos curados** (ex.: para `fato_estoque_parados`: "valor
  imobilizado", "itens parados", "dias médio parado") e **visualização recomendada**
  (ex.: parados -> KPIRow + DataTable; marca -> KPIRow + Pie/Bar). Isso dá ao modelo
  pequeno munição para "sugerir KPIs inteligentes" sem inventar.
- **visualizacoes[]**: os 5 templates com "quando usar" + shape exigido.
- **filtros[]**: os 5 tipos + quando se aplicam.
- **cores**: tokens da paleta.
- **naoSuportado[]**: pedidos comuns fora do catálogo (vendas, faturamento, pedidos,
  3D, exportar PDF) cada um com a frase "ainda não é possível" + o caminho próximo.

## 10. Prompt da jornada (com munição concreta, não "o prompt resolve")

`agent/prompt-jornada.ts`. Além das regras, carrega o capability map e FEW-SHOTS
concretos (o coração da feature, não pode ficar vago):

- Few-shot de **reflexão + aprofundamento** ("entendi que... e pra deixar mais útil,
  você prefere ver por marca ou por armazém?").
- Few-shot de **abertura com escopo** (declara o que dá hoje, convida).
- Few-shot de **"ainda não é possível" + redirecionamento** (usuário pede vendas ->
  reconhece, explica que ainda não, oferece o que dá perto).
- Few-shot da **reflexão de entendimento final** antes de oferecer gerar.
- Few-shot do **caso rápido** (pedido claro de primeira -> reflete e já oferece gerar).
- Instrução para **agrupar perguntas** e **propor defaults** em vez de interrogar uma a
  uma. Reavaliar `temperature` para a entrevista (a atual 0.2 tende a rígido).

## 11. Cards de opção (v1 = thumbnails leves)

Quando a IA chama `oferecer_opcoes`, o `BuilderChatPanel` renderiza cards selecionáveis
(ícone + rótulo + 1 linha), via novo evento SSE `choices`. A seleção do usuário volta
como turno e a IA aplica via tools. v1 NÃO renderiza componente real em miniatura (ver
seção 3, fora de escopo). Thumbnails ilustrativos vivem em
`journey/option-thumbs.tsx`. Opções sempre validadas contra o capability map.

## 12. Estado/persistência

`BuilderConversation` ganha `journeyState` JSON (migration aditiva manual; F6 só dev):
```
{
  fase: "entrevista" | "resumo" | "refino",
  fichaRascunho?: BuilderReportEntry,   // ficha em construção ANTES do Gerar
  entendimento?: string,                // resumo natural mostrado (seção 7)
  dimensoesTocadas: Record<Dimensao, boolean>,  // checklist invisivel
  resumo?: {...},                       // montado na fase resumo
}
```
- **Default condicional (corrige o legado):** conversa SEM journeyState mas COM
  `savedReportId` linkado nasce em `fase="refino"` (é relatório já pronto do construtor
  antigo, não pode cair na entrevista). Conversa nova nasce em `fase="entrevista"`.
  Migration faz backfill: existentes com savedReport -> refino.
- O SSE `done` passa a incluir `journeyState` (além de ficha/savedId/etag). O
  workspace reage a `fase` para escolher o layout (centralizado x 2-pane).
- A `fichaRascunho` é a fonte da ficha durante a entrevista; no "Gerar" ela é promovida
  a `SavedReport` (aí sim abrível/listável) e a fase vira `refino`.

## 13. Honestidade conversacional (separar do SEM_FONTE terminal)

Hoje `SEM_FONTE:` no `run-builder` ENCERRA o turno com `recusa=true` + FeatureRequest.
Numa entrevista, pedir "vendas" no meio NÃO pode encerrar a jornada. v3: o "ainda não é
possível" é conversacional (a IA responde e segue nas dimensões cobríveis); o
`SEM_FONTE` terminal continua existindo só para o caso em que NADA do pedido é cobrível
(ex.: o relatório inteiro é de um domínio inexistente) , aí sim recusa honesta +
FeatureRequest. Gaps pontuais no meio de um relatório viável são redirecionados, não
recusados.

## 14. Custo (mitigação real)

Threadar histórico (seção 4) faz o custo crescer por turno. Mitigações na spec:
- **Prompt caching de prefixo**: system + capability map são estáveis -> cacheáveis.
- **Ficha compacta**: enviar a `fichaRascunho` ao modelo como resumo/diff, não o JSON
  inteiro a cada turno.
- **Teto de turnos** (seção 6) também limita custo.
- Reusa `logUsage origin="construtor"` e o teto de quota existente. Vigiar custo/relatório.

## 15. Métricas de sucesso (a v1 não tinha)

Instrumentar sinais proxy desde o início (sem eles, iterar o prompt é às cegas):
- **% de relatórios que chegam ao refino sem edição corretiva** (alta = o resumo bateu
  com o desejo = "ela entendeu"). Sinal primário.
- **Turnos até elegibilidade** (muito alto = interrogatório).
- **% de "gera logo" não atendidos por conversa** (alta = gate irritando).
- **Abandono na entrevista antes do resumo.**
- **Feedback de 1 clique** após a geração (joinha).
Reusar a infra de auditoria/usage existente onde der; o resto é evento leve.

## 16. Estratégia de testes

- **TDD puro**: `entendimentoElegivel` (todas as condições + atalho + teto), transições
  de fase (incl. reversível resumo->entrevista e default condicional do legado),
  capability map (forma + KPIs curados + naoSuportado), as 4 tools novas (validação +
  efeito no journeyState + recusa de `oferecer_geracao` sem evidência), montagem do
  resumo + itens contestáveis.
- **Componentes (jsdom)**: reflexo de entendimento (texto natural, não caixas), cards de
  opção (renderizam e selecionam, validados), tela de resumo (itens + "ajustar isso" +
  botão Gerar só na fase resumo), troca de fase no workspace.
- **E2E real (obrigatório)**: jornada contra o LLM real + cache de estoque real,
  conferindo: abertura declara escopo; entrevista adaptativa com reflexão; NÃO oferece
  gerar sem evidência; atalho de pedido claro funciona; "ainda não é possível"
  conversacional num pedido de vendas (sem encerrar a jornada); resumo coerente e
  contestável; "Gerar" promove a SavedReport e renderiza com os componentes reais;
  retomada de conversa (histórico) e reabertura de relatório legado caindo no refino.
- `tsc` raiz limpo; eslint (sem travessão); jest builder verde.

## 17. Componentes (novos x reuso)

**Reuso:** `ReportRenderer` + componentes do Consumo, `BuilderChatPanel` (ganha o
evento `choices` + o reflexo de entendimento + a casca centralizada), `BuilderWorkspace`
(ganha as fases), `runBuilder` (ganha histórico + journeyState), SSE, tools de mutação,
`SavedReport`/conversa.

**Novos:**
- `capabilities.ts` (capability map curado).
- `journey/state.ts` (tipos + `entendimentoElegivel` + transições puras).
- tools novas (`atualizar_entendimento`, `oferecer_opcoes`, `oferecer_geracao`,
  `montar_resumo`) + extensão de `executarTool`/`ToolExec`/`runBuilder`.
- `agent/prompt-jornada.ts` (entrevistador + few-shots + capability map).
- UI: `journey/understanding-summary.tsx`, `journey/option-cards.tsx` (thumbnails),
  `journey/journey-summary.tsx` (resumo contestável + Gerar), casca centralizada +
  animação de geração no workspace.

## 18. O que as reviews mudaram (v1 -> v3)

- **Guarda de maturidade circular** -> gate por EVIDÊNCIA da ficha (`entendimentoElegivel`),
  não auto-relato (seção 6). [crítico, ambas as reviews]
- **runBuilder stateless** -> histórico threaded; sem isso a entrevista não existe
  (seção 4). [crítico, review #1]
- **Ficha abrível antes da maturidade** -> `fichaRascunho` no journeyState; só vira
  `SavedReport` no Gerar; animação passa a ter substância (seções 4, 12). [crítico, review #1]
- **Tools de jornada sem canal** -> `ToolExec` variante "jornada", journeyState pelo
  loop, assinaturas explicitadas (seções 4, 8). [alto, review #1]
- **Trilha de 7 caixas = checklist odiado** -> reflexo de entendimento em linguagem
  natural; dimensões viram checklist invisível (seção 7). [alto, review #2]
- **Sem saída digna sempre-disponível** -> reflexão + oferta "monto e você ajusta",
  atalho de pedido claro, teto de turnos (seções 2, 5, 6). [alto, review #2]
- **"O prompt resolve" otimista** -> capability map com KPIs/visualizações curados +
  few-shots concretos no prompt (seções 9, 10). [alto, review #2]
- **Prévia viva no chat (cara/arriscada)** -> cortada da v1, só thumbnails; prévia viva
  real fica no 2-pane (seções 3, 11). [médio, ambas]
- **SEM_FONTE terminal conflita com jornada** -> honestidade conversacional separada do
  terminal (seção 13). [alto, review #1]
- **Legado reabrindo como entrevista** -> default condicional + backfill (seção 12).
  [alto, review #1]
- **Resumo sem discordância** -> itens contestáveis "ajustar isso" (seções 5, 8).
  [médio, review #2]
- **Custo subestimado** -> caching de prefixo + ficha compacta + teto (seção 14).
  [médio, review #1]
- **Sem métrica de sucesso** -> sinais proxy instrumentados (seção 15). [médio, review #2]
- **Tensão rápido x entrevistou de verdade** -> reflexão de entendimento sempre antes de
  oferecer gerar (seções 2.3, 10). [médio, review #2]

## 19. Riscos remanescentes

- **Prompt do entrevistador é o coração e o maior risco.** Mitiga: few-shots concretos
  (seção 10), E2E real conferindo a sensação, métricas (seção 15) para iterar com dado.
- **Modelo pequeno (gpt-5.4-mini) pode não conduzir bem.** Mitiga: gate por evidência
  (não depende da "inteligência" do modelo para barrar geração rasa); permitir trocar o
  modelo do construtor (já é configurável) se a condução exigir.
- **Custo por relatório.** Mitiga seção 14 + métricas.
```
