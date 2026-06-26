# F6 , Construtor de Relatórios (SPEC v1)

> **Status:** SPEC v1 (rascunho para as 2 reviews adversariais antes da v3).
> **Branch de trabalho:** `feat/nex-reconstrucao` (decisão do usuário 2026-06-26).
> **Regra de raiz (inegociável):** TUDO desta fase fica **somente local** e **não
> sobe para produção** sem aprovação explícita do usuário. Sem merge para `main`,
> sem deploy, sem migration em prod. Ver bloco no topo do `CLAUDE.md`.
> **Metodologia:** SPEC v1 → 2 reviews adversariais → v3 → PLAN v1 → 2 reviews →
> v3 → execução (superpowers, por ondas/tasks, TDD, `ui-ux-pro-max` em todo
> front-end, consistência com o design da plataforma).

---

## 1. Objetivo

Dar a `super_admin` e `admin` um **construtor de relatórios in-app** onde a pessoa
**descreve em linguagem natural** o relatório que quer e a plataforma o **monta
sozinha**, escolhendo a melhor visualização a partir de uma **biblioteca de
componentes padronizada**. Não é um editor "arrasta e solta": o caminho primário
é o **prompt**; a edição manual existe, porém **limitada** (ajustar o que já está
posto, nunca criar estrutura nova do zero).

Duas formas de entrega convivem:

- **Relatório de tela cheia:** uma página inteira de relatório, acessível por uma
  seção **Relatórios** na navegação. A pessoa vê cards organizados ("retângulos
  bonitos") e clica no relatório que quer abrir.
- **Widget:** um componente de relatório que pode ser adicionado a um **Painel**.
  Existe uma seção **Painéis** onde a pessoa monta um ou vários painéis,
  posicionando widgets. O tamanho dos widgets é flexível (com regras de encaixe
  que impedem bagunça), e a quantidade por painel é limitada por parâmetro.

O valor central: **unir os dois mundos** (montar por conversa + ajustar na mão)
sobre uma **mesma definição declarativa**, sem nunca gerar código em produção.

---

## 2. Decisões canônicas (travadas com o usuário)

1. **Config-driven, nunca code-gen.** Todo relatório é uma **ficha declarativa**
   (um documento estruturado, JSON validado por schema), não código. Um **motor
   de renderização genérico** lê a ficha e desenha. A IA produz e edita a ficha,
   jamais escreve React/SQL solto que vá para produção. Risco zero de quebrar a
   plataforma.
2. **MCP separado e exclusivo.** A construção de relatórios usa um **servidor MCP
   próprio**, distinto do MCP semântico do Agente Nex. Mesma base de engenharia
   como molde (`@modelcontextprotocol/sdk`, transporte, RBAC 7 camadas), mas
   servidor, catálogo e ferramentas **exclusivos**. Proibido misturar com as
   tools do Nex.
3. **Agente construtor reusa o provedor atual.** O agente que interpreta o prompt
   e monta a ficha usa o **mesmo provedor/modelo já em produção** (OpenAI, hoje
   `gpt-5-mini`), no mesmo padrão de orquestração agente↔tools do Nex. (Atualiza a
   ideia antiga de usar a API do Claude: reuso do que já roda é mais barato e
   consistente. Ponto a confirmar na review do usuário.)
4. **Design pela `ui-ux-pro-max`, em design-time.** O bom design é **embutido nos
   componentes** quando eu os construo (com a skill), não gerado por IA em runtime.
   Em produção o agente só **escolhe e parametriza** peças que já nasceram lindas e
   consistentes com o resto da plataforma. A skill NÃO roda dentro do agente em
   produção.
5. **Biblioteca grande, diversa e milimetricamente documentada.** Espaçamentos,
   posições, sombras, hover, efeitos e animações são padronizados **por estado e
   condição** e descritos num catálogo. Essa documentação não é burocracia: é o
   que permite as ferramentas acharem o componente certo para o que foi pedido.
6. **Edição manual limitada.** A pessoa pode ajustar o que já existe (texto de
   título, trocar tipo de gráfico de uma lista, trocar ícone num seletor com busca,
   trocar cor de uma paleta fixa, redimensionar widget dentro do grid). Não pode
   criar campos/estrutura novos na mão (isso só via prompt). Sem editor livre.
7. **Só local até aprovação.** Ver regra de raiz no topo. Validação toda em dev
   local.

---

## 3. Arquitetura macro

```
┌──────────────────────────────────────────────┐
│  Construtor (tela): chat + pré-visualização   │
│  reusa mecânica do Playground + bubble do Nex │
└───────────────┬───────────────────────────────┘
                │ prompt do usuário
                ▼
┌──────────────────────────────┐   chama tools   ┌─────────────────────────┐
│  Agente construtor (OpenAI)  │────────────────▶│  MCP de Construção       │
│  mesmo padrão do Nex         │◀────────────────│  (servidor próprio)      │
└──────────────┬───────────────┘  ficha editada  │  tools exclusivas:       │
               │                                  │  montar/editar a ficha   │
               │ produz/edita                     │  + consultar catálogo    │
               ▼                                  │  + buscar dado (ref.)    │
┌──────────────────────────────┐                 └────────────┬────────────┘
│  Ficha declarativa (ReportSpec)│                            │ referencia
│  JSON validado por schema      │                            ▼
└──────────────┬─────────────────┘            ┌──────────────────────────────┐
               │ renderiza                     │  Camada de dados existente    │
               ▼                               │  (fatos_* / queries / MCP Nex │
┌──────────────────────────────┐              │   de leitura, como fonte)     │
│  Motor de render (genérico)   │              └──────────────────────────────┘
│  + Biblioteca de componentes  │
│  + Design system documentado  │
└──────────────────────────────┘
```

### 3.1 Ficha declarativa (`ReportSpec`)

O artefato central. Um JSON validado por schema (Zod) que descreve um relatório
**sem** dizer "como" desenhar, só "o quê". Estrutura inicial proposta:

- `id`, `tipo` (`tela_cheia` | `widget`), `titulo`, `dono` (userId), `visibilidade`.
- `blocos[]`: lista ordenada de blocos. Cada bloco tem:
  - `componente`: chave do catálogo (ex.: `kpi`, `tabela`, `pizza`, `barra_comparativa`, `mapa_brasil`).
  - `fonte`: referência a uma consulta de dado (nome da tool/fato + parâmetros), **nunca SQL livre**.
  - `parametros`: opções daquele componente (agrupamento, ordenação, formato de número, paleta da lista fixa, rótulos).
  - `layout`: posição/tamanho (para widget no grid; para tela cheia, ordem e largura relativa).
- `versao` do schema, para evolução segura.

A ficha é o **único ponto de verdade**: o prompt a edita, a edição manual a edita,
o motor a renderiza. É o que une os dois mundos.

### 3.2 Motor de render genérico

Um componente React que recebe um `ReportSpec` e desenha, mapeando cada
`bloco.componente` ao componente da biblioteca, injetando `parametros` e os dados
resolvidos da `fonte`. Não tem lógica de negócio: é um intérprete. Estados de
loading/erro/vazio são padronizados.

### 3.3 Biblioteca de componentes + design system documentado

Conjunto de componentes de visualização **fechados e parametrizáveis**, cada um:

- com **contrato claro**: que dado aceita, que parâmetros expõe, que estados tem;
- **documentado** num catálogo legível por humano e por máquina (o agente lê o
  catálogo para escolher), incluindo: para que serve, formato de dado ideal,
  parâmetros, e tokens de espaçamento/sombra/hover/animação por estado;
- desenhado com `ui-ux-pro-max` seguindo a **consistência visual da plataforma**
  (mesmos botões, listas suspensas, checkboxes, ícones, efeitos já existentes).

Catálogo inicial proposto (onda 1, enxuto): `kpi`, `tabela`, `barra` (com variante
comparativa meta/ideal), `pizza`. Avançados (ondas seguintes): `linha/serie`,
`mapa_brasil` (com hover destacando o estado), `comparativo_periodo`, `calendario`,
`badge_status`, e o resto do acervo. A biblioteca **nunca fecha**: cresce por ondas.

### 3.4 MCP de Construção (servidor próprio)

Servidor MCP exclusivo. Famílias de tools (exclusivas, sem relação com as do Nex):

- **Catálogo:** `listar_componentes`, `descrever_componente` (o agente descobre o
  que existe e como usar).
- **Construção da ficha:** `criar_relatorio`, `adicionar_bloco`, `editar_bloco`,
  `remover_bloco`, `reordenar`, `definir_layout`, `definir_filtro`.
- **Dado (referência, não duplicação):** `listar_fontes` e `prever_dado` apontam
  para as consultas de leitura já existentes (fatos/tools do Nex como fonte), para
  o componente saber que dado vai receber. Não reimplementa as métricas.
- **Validação:** toda tool valida a ficha contra o schema antes de devolver.

RBAC 7 camadas reusado, gated para `super_admin`/`admin`.

### 3.5 Agente construtor

Reusa o provedor/modelo de produção (OpenAI `gpt-5-mini`) e o padrão de
orquestração do Nex (loop agente↔tools), porém **isolado**: prompt de sistema
próprio, catálogo de tools próprio (o MCP de Construção), sessão própria. Ele:

1. entende o pedido em linguagem natural;
2. consulta o catálogo de componentes e as fontes de dado;
3. escolhe a **melhor visualização** para o formato do dado (não força tabela);
4. monta/edita a ficha via tools;
5. devolve a ficha + uma explicação curta do que montou.

### 3.6 Tela de construção (chat + preview)

Layout dividido: **conversa** de um lado, **pré-visualização ao vivo** do relatório
do outro. Reusa a mecânica de chat do **Playground do Nex** (campo, botões, lista
de mensagens) e a **animação de "pensando" da bubble**. A cada resposta do agente,
o preview re-renderiza a ficha. Botões de ação rápida (ex.: "trocar para pizza",
"agrupar por estado") aceleram pedidos comuns. Localização na navegação e refino
visual ficam comigo (com a skill), sem validação tela-a-tela.

---

## 4. Fluxo de dados

1. Usuário descreve o relatório no chat.
2. Agente consulta catálogo + fontes, escolhe componentes, monta a ficha via MCP.
3. A ficha é salva (rascunho) e renderizada no preview; os dados de cada bloco vêm
   das consultas de leitura existentes (mesma fonte do Nex/dashboard, garantindo
   números consistentes em toda a plataforma).
4. Usuário aprova ou pede ajuste (por prompt ou edição manual limitada).
5. Ao salvar, o relatório passa a aparecer na seção Relatórios (tela cheia) ou
   fica disponível como widget para os Painéis.

Nenhuma leitura vai ao Odoo ao vivo: tudo do cache, como o resto da plataforma.

---

## 5. RBAC e visibilidade

- Acesso ao construtor: só `super_admin` e `admin`. `manager`/`viewer` não entram.
- Visibilidade do relatório criado: amarrada ao criador. `super_admin` e `owner`
  veem todos; `admin` vê os seus. (A regra fina por perfil de quem **consome** o
  relatório pronto é detalhada na onda de permissões.)
- Tudo auditado (quem criou/editou/rodou), reusando o padrão de auditoria atual.

---

## 6. Segurança, limites e custo

- **Sem code-gen:** o agente só emite ficha validada por schema. Nada de React/SQL
  livre em runtime. Fonte de dado sempre por referência a consulta auditada.
- **Medição de consumo de IA por cliente é obrigatória** (o agente consome a conta
  do provedor): rate limit, teto por período, seleção de modelo, e quais perfis
  usam quais modelos, na Configuração (só `super_admin`). Sem cota = custo sem teto.
- **Limites do construtor:** quantidade de blocos por relatório e de widgets por
  painel são parametrizáveis. Edição manual restrita a um conjunto fechado de
  ações (ver §2.6).

---

## 7. Decomposição em ondas

A arquitetura (ficha, motor, MCP separado, design system, agente) nasce preparada
para a visão completa. A **entrega** é faseada; a biblioteca cresce sempre.

- **Onda 1 , Fatia fina ponta a ponta (validar o conceito):**
  relatório de **tela cheia**; catálogo enxuto (`kpi`, `tabela`, `barra`, `pizza`);
  ficha + schema; motor de render; MCP de Construção com as tools essenciais;
  agente montando via prompt; **1 domínio** (estoque/produtos, ex.: "produtos por
  estado e por armazém com preço médio"); preview no chat; salvar e ver na seção
  Relatórios. Sem painéis, sem edição manual ainda.
- **Onda 2 , Edição manual limitada:** trocar título/tipo de gráfico/ícone/cor,
  reordenar, sobre a mesma ficha.
- **Onda 3 , Painéis e widgets:** seção Painéis, grid de encaixe, adicionar widgets,
  limites por painel.
- **Onda 4 , Acervo avançado:** série/linha, comparativos de período, badges,
  calendário, e o **mapa do Brasil com hover destacando o estado** (showcase; o
  efeito 3D pleno é o teto de sofisticação, entregue aqui).
- **Ondas seguintes , Expansão contínua:** mais domínios, mais componentes,
  permissões finas de consumo, exportação.

Cada onda tem sua spec/plan de detalhe quando chegar; esta SPEC desenha a fundação
e a onda 1 em profundidade.

---

## 8. Caso de teste real (do usuário)

O relatório do HTML de referência (vendas/estoque por estado, comparativos,
formas de pagamento, e o mapa de demandas por estado) é o **norte de complexidade**.
O HTML serve só para dimensionar ambição e inventário; **nada do design dele é
copiado** (o design é o da nossa plataforma, via skill). A onda 1 valida com um
relatório de estoque/produtos por estado; o mapa por estado entra na onda 4.

---

## 9. Testes e verificação

- **Schema/ficha:** testes de validação (ficha válida/ inválida, migração de versão).
- **Motor de render:** testes de render por componente (dado → saída esperada,
  estados loading/erro/vazio).
- **MCP de Construção:** testes por tool (monta/edita/valida a ficha corretamente).
- **Agente:** testes de que, dado um pedido, ele escolhe componente plausível e
  produz ficha válida (golden cases).
- **E2E real (regra de raiz):** subir o stack local, montar um relatório de verdade
  via prompt contra o dado real do cache, conferir que os números batem com a fonte.
- `ui-ux-pro-max` aplicada em todo componente; consistência visual com a plataforma.

---

## 10. Riscos e mitigações

- **Escopo épico.** Mitigado pela fatia fina (onda 1) e biblioteca incremental.
- **Agente escolher visualização ruim.** Mitigado por catálogo bem descrito (dado
  ideal por componente) + edição/prompt corretivo + golden cases.
- **Inconsistência visual.** Mitigado por design embutido nos componentes (skill em
  design-time) e tokens documentados, não IA desenhando em runtime.
- **Custo de IA sem teto.** Mitigado por medição/quota obrigatória desde a onda 1.
- **Vazamento para produção.** Mitigado pela regra de raiz (só local até aprovação).
- **Grid de painel virar bagunça.** Mitigado por grid de encaixe (tamanhos discretos)
  em vez de pixel-livre.

---

## 11. Fora de escopo (YAGNI por ora)

- Editor "arrasta e solta" completo / criação livre de componentes pela pessoa.
- IA gerando código de componente em produção.
- Skill `ui-ux-pro-max` rodando em runtime.
- Exportação (PDF/Excel), agendamento e envio automático de relatório (ondas bem
  posteriores, se desejado).

---

## 12. Pontos a confirmar na review do usuário

1. Reuso do provedor OpenAI atual para o agente construtor (vs. API do Claude da
   ideia antiga).
2. Onda 1 começar por **tela cheia** (painéis na onda 3).
3. Domínio da onda 1: estoque/produtos por estado.
4. Grid de encaixe (tamanhos discretos) no lugar de tamanho livre pixel a pixel.
