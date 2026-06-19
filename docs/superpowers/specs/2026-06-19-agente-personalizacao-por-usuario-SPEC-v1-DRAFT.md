# SPEC v1 (DRAFT, ENGATILHADO) , Personalização adaptativa do Agente Nex por usuário

> **Status:** rascunho engatilhado por decisão do usuário (2026-06-19). **NÃO implementar
> ainda.** Antes de virar código precisa percorrer a metodologia do projeto (CLAUDE.md §6):
> brainstorm → SPEC v1 → review #1 (v2) → review #2 (v3) → PLAN v1 → reviews → execução →
> verificação + E2E. Este documento é o ponto de partida (SPEC v1), a ser endurecido.
>
> **Gatilho:** o usuário quer que o Nex "pense do jeito de cada usuário": aprenda o
> vocabulário, as definições de negócio e o estilo que cada pessoa espera, e vá melhorando
> conforme a gente corrige/mapeia as conversas. Origem concreta: conversa da Mariane
> (`d08c6323`), em que ela ENSINOU a definição de "demanda em aberta" e o agente conduziu
> bem a conversa, mas não reteve isso para os próximos turnos/sessões dela.

---

## 1. Problema

Hoje o Nex é **igual para todos**. O prompt de identidade (`identity-base.ts`) é global; o
único traço por-usuário são as **sugestões iniciais personalizadas**
(`src/lib/agent/personalized-suggestions/`), que olham o histórico de uso de tools para
montar as chips de boas-vindas. Não existe:

- memória do **vocabulário/definições de negócio** de cada usuário (ex.: a Mariane define
  "demanda em aberta" = aprovado + financeiro lançado + sem carregamento/NF);
- memória do **estilo/expectativa** de cada usuário (objetivo x detalhado, consultivo x
  seco, quais métricas ele sempre pede, como ele chama as coisas);
- um mecanismo de **aprendizado** que transforme as correções que o usuário faz numa
  conversa (e os vereditos/diagnósticos que NÓS aplicamos nas avaliações) em melhoria
  duradoura do atendimento àquele usuário.

Consequência: o usuário precisa re-ensinar a mesma coisa toda sessão, e a sensação é de
"agente que não entende o que eu quero".

## 2. Resultado desejado (visão do usuário)

Cada usuário tem um **incremento de prompt próprio** (um "perfil de interação") que é
injetado SÓ para ele, somado ao prompt global. Esse perfil:

1. carrega as **definições de negócio** que ele já estabeleceu ("quando eu falo demanda,
   é X"), os **termos** que ele usa, e as **preferências de formato** (ex.: sempre quebrar
   por empresa, sempre mostrar real e não bruto, respostas curtas);
2. **aprende** ao longo do tempo, a partir de: (a) correções explícitas do usuário na
   conversa ("considere só pedidos em aberto", "use as etapas como base"); (b) os
   diagnósticos/vereditos que o time aplica nas avaliações (sistema de qualidade já
   existente: `status`, `patterns`, `razoes`); (c) padrões de uso (tools/métricas
   recorrentes);
3. é **editável e auditável** pelo super_admin (ver/ajustar o que o agente "aprendeu" de
   cada usuário), nunca uma caixa-preta.

## 3. O que JÁ temos (reaproveitar, não refazer)

- **`personalized-suggestions/`** , agregação por usuário do histórico de tools → chips.
  É o embrião do "perfil por usuário"; o perfil de interação pode morar ao lado.
- **Sistema de qualidade / avaliações** , `ConversationQualityEvaluation` com
  `status`/`humanStatus`/`patterns`/`razoes`/`recomendacaoPrompt`/`recomendacaoEmbedding`.
  Já existe o conceito de **recomendação de prompt** por avaliação , é a matéria-prima do
  aprendizado. Hoje alimenta a correção offline (no cloud), não um perfil por usuário.
- **Memória de conversa** , `focoAtual` na `Conversation`, `ConversationEntity`
  (entidades de recência), janela de contexto. É memória INTRA-conversa; falta a
  CROSS-conversa por usuário.
- **`identity-base.ts` + compose** , a montagem do prompt do sistema. O incremento por
  usuário entra como mais um bloco no `compose` (depois das regras globais).
- **AgentSettings** , configs globais. O perfil por usuário seria uma tabela nova
  (1:1 ou 1:N com User), NÃO no AgentSettings global.

## 4. Esboço de arquitetura (a validar no brainstorm)

```
Conversa do usuário ──► extrator de sinais ──► PerfilDeInteracao(userId)
   (correções,            (offline, no cloud,        │
    definições,            NUNCA via API OpenAI)      │  injeta
    estilo)                                           ▼
Avaliações (status/razoes/recomendacaoPrompt) ──► compose() ──► prompt do Nex p/ ESTE usuário
```

- **Tabela nova `AgentUserProfile`** (proposta): `userId` (1:1), `definicoes` (JSON:
  termo→significado de negócio, ex. "demanda em aberta"), `preferencias` (JSON: formato,
  verbosidade, métricas favoritas, real x bruto…), `incrementoPrompt` (texto curto
  derivado/curado), `aprendidoEm`, `revisadoPor`. Aditivo, sem quebrar nada.
- **Extração/aprendizado OFFLINE (regra de raiz do projeto):** o aprendizado NUNCA roda via
  chamada à API OpenAI em runtime. Ele é destilado **no cloud (Claude)** ou por um job
  offline a partir das conversas + avaliações, e gravado no perfil. Em runtime, só se LÊ o
  perfil e injeta no prompt , custo zero de "pensar" em produção.
- **Injeção no compose:** o `incrementoPrompt` (curto, ~5-15 linhas) entra como um bloco
  "Preferências deste usuário" no prompt, SÓ para aquele usuário. Mantém o token sob
  controle (ver §5).
- **UI (Monitoramento/Integrações):** o super_admin vê e edita o perfil aprendido de cada
  usuário (transparência + correção manual), espelhando o padrão de auditoria já usado.

## 5. Custo de token (resposta direta à dúvida do usuário)

Glossário grande no prompt global = **caro** (entra em todo turno, de todo usuário). Então:

- **Glossário de negócio amplo** (de-para de CFOPs, regras de regime, mapa de empresas):
  fica na **tool de referência** (`fiscal_referencia_buscar`, já existe) , on-demand, não
  pesa no prompt.
- **Núcleo pequeno e de alto valor** (real x bruto, etc.): poucas linhas no prompt global
  (já temos as regras 12-real/12-cfop).
- **Termos/definições do usuário**: vão no **incremento POR USUÁRIO** (pequeno, só para
  ele), não no global. Assim a Mariane carrega a definição de "demanda em aberta" sem
  custar token para os outros usuários.

Conclusão: a personalização **reduz** o desperdício (cada um carrega só o que precisa) em
vez de inflar o prompt global.

## 6. Itens de capacidade que esta frente destrava (achados das avaliações)

- **"Demanda em aberta" (comercial)** , a Mariane pediu e o agente não soube calcular
  (registrou lacuna, turno [15] da conversa `d08c6323`). A taxonomia de etapas do
  `fato_pedido` é heterogênea (customização Tauga: "Aguardando Autorização", "Em
  contagem", "VF - Emite NF", "Nota emitida e não entregue"…); **não dá para cravar quais
  etapas = demanda em aberta sem perícia com o cliente.** Esta SPEC deve incluir essa
  perícia + uma tool/critério `comercial_demanda_em_aberta` (aprovado + financeiro lançado
  + `vrNf=0`/não carregado), validada com a Mariane.
- O perfil dela já registraria a definição para os próximos turnos não precisarem
  re-ensinar.

## 7. Decisões a tomar no brainstorm (perguntas abertas)

1. Perfil **1:1 por usuário** ou também por **papel/segmento** (ex.: todo "comercial"
   herda definições do time)?
2. Aprendizado **automático** (job destila e grava) x **curado** (sugere e o super_admin
   aprova antes de virar prompt)? (recomendação inicial: sugerir → aprovar, para não
   "aprender" coisa errada sem revisão.)
3. Como evitar **drift/contradição** entre o incremento do usuário e as regras globais
   (precedência: global de segurança > preferência do usuário).
4. Escopo do MVP: começar só por **definições de negócio explícitas** (o caso da Mariane),
   deixando estilo/verbosidade para uma onda 2?
5. Privacidade/escopo: o perfil é visível só ao super_admin; o usuário comum vê?

## 8. Próximos passos (metodologia , NÃO pular)

1. **Brainstorm** (`superpowers:brainstorming`) sobre §7 com o usuário.
2. **Perícia completa do agente atual** (prompt, compose, qualidade, memória, suggestions)
   para casar o novo recurso com o que existe , antes de desenhar a tabela/fluxo.
3. SPEC v2 (review #1) → SPEC v3 (review #2).
4. PLAN v1 → reviews → PLAN v3.
5. Execução em ondas (MVP = definições de negócio por usuário + tool de demanda em aberta).
6. Verificação + **E2E contra dado real** (regra de raiz).

> **Regra de raiz herdada:** correção/aprendizado NUNCA via API OpenAI em runtime , sempre
> offline (cloud/Claude). O perfil é lido em runtime (barato), destilado offline.
