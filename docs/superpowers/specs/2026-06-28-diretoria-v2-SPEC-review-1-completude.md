# Review adversarial #1 da SPEC Diretoria v2 , foco COMPLETUDE/COBERTURA

> Revisor: agente adversarial (caça-gap). Fonte da verdade: perícia MESTRE
> (`pericia-html/MESTRE/01..07`) + VISAO. Alvo: `2026-06-28-diretoria-v2-SPEC.md` (v1).
> Regra do cliente: nada do HTML periciado pode ficar de fora. Este relatório lista
> tudo que a SPEC omitiu, tratou vago demais para gerar plano, ou contradiz a perícia.
> (Sem travessão, por norma do projeto.)

## Placar de achados por severidade

| Severidade | Qtd |
|---|---|
| CRÍTICO | 2 |
| ALTO | 8 |
| MÉDIO | 8 |
| BAIXO | 6 |
| **Total** | **24** |

## Critério de saída desta review
Esta review NÃO passou pano: há 2 achados CRÍTICOS que invalidam a arquitetura como
está escrita (o modelo de "construtor" colide com as interações reais do HTML, e o
sistema de período/filtro , que é o que faz os números mudarem , simplesmente não
existe na SPEC). A v2 precisa resolver pelo menos os CRÍTICOS e ALTOS antes do PLAN.

---

# CRÍTICOS

## C1. O modelo de "componentes independentes posicionáveis" colide com as interações cross-component reais do HTML
**Severidade: CRÍTICO.**
A SPEC (§3, §5) trata cada componente como um bloco autocontido que o usuário
adiciona/remove/move livremente. Mas a perícia mostra que metade do valor do HTML
está em interações que atravessam dois ou mais blocos:
- B4 (mapa) clicado filtra B2 e reescopa B6 (cap 05 §5.6).
- B2 (checkbox de reserva por unidade) debita "Disponível" do B7 em tempo real (cap 05 §8.6).
- B2 (clique na linha) alimenta o drill-in do B5 (cap 05 §3.7 / §6).
- B8 (clique na barra) seleciona um modelo e repinta os 3 cards de indicador (cap 05 §9.3).
- C7 (clique na barra) filtra o C10 por forma de pagamento (cap 06 §7/§8).
- A3 (busca/local) e A6 (busca de serial) alimentam os cards 5 e 6 do A4 (idade média e cobertura) (cap 03 §6).
- A7 é master-detail: clicar uma compra na lista repinta itens + 10 KPIs + 2 donuts (cap 04 §4.5).
- A8: salvar alertas no modal recomputa status e repinta KPIs + ranking + matriz (cap 04 §6.9).

Se A4-cobertura estiver na tela sem A3, ou C10 sem C7, ou B7 sem B2, o que acontece?
A SPEC não define. §6 cita "C-06 item -> C-07 pagamento" como se fosse trivial, mas
não diz o que ocorre quando o alvo do filtro não está montado no relatório.

**Correção sugerida (adicionar à SPEC):** uma seção "Contrato de interação entre
componentes" que declare, para cada par acoplado: (a) o evento emitido, (b) quais
componentes ouvem, (c) o comportamento quando o ouvinte NÃO está na tela (degradar
para no-op silencioso? mostrar aviso? auto-incluir o par?). Definir também grupos de
componentes "irmãos" que, quando um é adicionado, sugerem/exigem o par (ex.: A4-cobertura
depende de A3; B7-reservado depende de B2). Sem isso o construtor entrega telas que
parecem completas mas têm cliques mortos , exatamente a queixa que originou a v2.

## C2. O sistema de período/filtro global está AUSENTE da SPEC (e há múltiplos seletores não reconciliados)
**Severidade: CRÍTICO.**
O C1 do HTML (barra de período com 5 abas Dias/Meses/Anos/Trimestres/Semestres +
presets, cap 06 §1) escopa C2 a C10 inteiros. É o controle que faz todos os números
de Vendas mudarem. A SPEC não tem nenhuma seção de período/filtro. A VISAO §9 decidiu
"enxutos (Hoje, Esta semana, Este mês, Este ano + Personalizado + Comparação)", mas
essa decisão não foi transportada para a SPEC. Pior: existem QUATRO seletores de
período distintos no HTML, e a SPEC não reconcilia nenhum:
- C1 global de Vendas (5 abas, cap 06 §1).
- C8 e C9, cada card com seu PRÓPRIO seletor de 5 abas + delta cruzado (cap 06 §9.2).
- B8 com modal de período próprio (6 presets ancorados na data máxima da base, cap 05 §9.4).
- Agenda com month picker multi-mês 1/2/3/6/12 (cap 02 §3.7).

**Correção sugerida:** criar §"Período e filtros" definindo: (1) o seletor de período
global por relatório (qual conjunto enxuto fica, como persiste, se é por relatório ou
por componente); (2) como um relatório montável aplica o período a cada componente de
dado; (3) o que fazer com os seletores locais (B8, C8/C9, agenda) , mantê-los como
override local ou unificar. Decidir e escrever; hoje é um buraco que trava o PLAN.

---

# ALTOS

## A1. B1 (hero de valor pendente) sumiu do catálogo
**Severidade: ALTO.**
O catálogo B mapeia B-01..B-06 cobrindo B2-B8, mas o B1 (hero "Pedidos que ainda
precisamos entregar", número gigante 44px do valor pendente, cap 05 §2) NÃO tem
entrada. B-01 referencia "B3/B6", não B1. É um componente vivo e visível, omitido.
**Correção:** adicionar `B-07 | Hero de valor pendente a entregar | kpi | real | B1`,
com o valor = soma de `pendingValue` dos pedidos abertos (fórmula proporcional, ver A5).

## A2. Contradição interna §3 (catálogo) vs §8 (fonte de dado): componentes fictícios marcados "real"
**Severidade: ALTO.**
O catálogo §3 marca como `real`:
- `C-05 Modalidades + maior pedido` , mas o split digital/presencial do C6 é INFERIDO
  por seed determinístico (cap 06 §6, §12); o próprio §8 lista "split digital/presencial
  confiável" como `sem_fonte`. Contradição direta.
- `C-07 Formas de pagamento` , o HTML fabrica via `inferPayment` (cap 06 §8, §12). §8 da
  SPEC afirma que o cache tem `formaPagamentoNome` real, mas isso é premissa não verificada.
- `C-08 Comparativo de 2 estados` , o C8/C9 vivo (v134) é 100% mock (`mockRows`), a fonte
  real está morta (cap 06 §9.1, §9.5, §13.2); o §8 da SPEC lista "comparativo de marca
  fictício" como `sem_fonte`. O catálogo diz `real`. Contradição direta.
**Correção:** rebaixar C-05 (split), C-07 e C-08 para `estimado` ou `sem_fonte` no
catálogo até o SELECT no cache provar o contrário; alinhar §3 e §8; para C-08, registrar
que reconstruir com dado real exige NOVA agregação cruzada (período x UF x marca), não
existe pronta.

## A3. Mecânica de reserva B2<->B7 não está especificada
**Severidade: ALTO.**
A perícia dedica seções inteiras à reserva por unidade: checkbox custom por linha-unidade
no B2, persistência (`ig_demand_reserved_units_v2`), e débito de "Disponível" no B7 que
pode ficar negativo (cap 05 §3.6, §8.6, achado §11.5). A SPEC só cita `B-04 ... (reservado
sem fonte)` e em §8 diz "% reservado sem_fonte". Não diz que existe a AÇÃO de reservar,
nem onde persiste, nem o vínculo com B7. Como produto real, reservar uma unidade é uma
escrita , e o projeto só permite escrita via tools `write:*` do MCP (decisão canônica #2).
**Correção:** decidir e escrever: a reserva (a) vira escrita real no Odoo, (b) vira estado
interno do nexus-odoo (tabela própria), ou (c) sai de escopo. Se entra, especificar
persistência, contrato B2->B7 (débito de 1 por unidade), e o estado negativo.

## A4. RBAC por hierarquia comercial (4 níveis) + escopo por UF está ausente
**Severidade: ALTO.**
O HTML tem dois eixos de acesso: (1) permissão por gaveta e (2) hierarquia comercial de
4 níveis (Vendedor Regional < Gerente Regional < Sub Gerente Global < Diretor Global) com
escopo por UF, que controla a VISIBILIDADE DO DADO (cap 02 §11, cap 07 §6). Isso governa
quem vê quais eventos da agenda (regional só vê da própria UF) e é candidato natural a
escopar dashboards regionais. A SPEC §7 só desenha RBAC por tela/seção/componente e ignora
totalmente hierarquia e UF.
**Correção:** adicionar à §7 o eixo de "escopo de dado por hierarquia + UF": como mapear
para o modelo de usuários do nexus-odoo, se dashboards de Vendas/Demandas filtram por UF do
usuário regional, e a regra de visibilidade de eventos da agenda (`canViewEvent`,
`regionalUfsCanSeeEvent`). Definir se é portado ou descartado.

## A5. Fórmula do valor pendente proporcional (liga B1/B2/B3/B4) não está na SPEC
**Severidade: ALTO.**
`pendingValue = (status==='cancel') ? 0 : total*(pendingQty/qty)` , só a fração não
entregue, não o total (cap 05 §1.6, achado §11.2). É o que faz B1, B2, B3 e B4 baterem
entre si. Sem cravar isso, cada componente pode somar diferente e os números não fecham
(erro clássico que review de código não pega , ver regra de raiz de E2E contra dado real).
**Correção:** registrar em §8 (ou em uma §"fórmulas canônicas") a definição de
`pendingValue`, `pendingQty`, e a cobertura `(estoque disponível / demanda pendente) * 30`
(cap 03 §6), para o PLAN e o E2E terem alvo numérico.

## A6. Master-detail composto (A7, e em parte A8) quebra ao ser fatiado em K-01/K-02
**Severidade: ALTO.**
A7 é UM card composto: lista de compras (esquerda) + itens (centro) + 10 cards de
informação + 2 donuts, todos repintados ao clicar uma compra na lista (cap 04 §1.1, §4.5).
A SPEC separa em `K-01 Compras ativas (tabela)` e `K-02 Detalhe da compra (widget)`, como
se fossem dois blocos independentes posicionáveis. Se o usuário coloca K-02 sem K-01, quem
seleciona a compra? Mesmo problema do C1, específico de compras.
**Correção:** ou tratar A7 como um único componente composto (master-detail interno,
trava de tamanho grande), ou definir explicitamente o contrato de seleção entre K-01 e K-02
(estado compartilhado, comportamento sem o par). Idem para o vínculo modal-de-alertas (K-06)
-> KPIs/ranking/matriz (K-03/K-04/K-05).

## A7. Agenda subespecificada: falta month picker multi-mês, decisão de tipos, filtros avançados, criar/detalhe/excluir
**Severidade: ALTO.**
A SPEC trata a Agenda como "tela especial" (§2) e a onda 6 (§10) só cita "calendário 2
colunas, painel do dia, colaboradores, anexos se houver storage, filtros". O cap 02 mostra
muito mais, e nada disso está referenciado:
- Month picker multi-mês 1/2/3/6/12 (cap 02 §3.7) , citado na missão, ausente na SPEC.
- 9 tipos no mapa de rótulos mas só 6 ativos nos selects; decisão "manter 6 ou reabilitar 9"
  pendente (cap 02 §2.1, §14.1).
- Filtros avançados com 8 campos (tipo/período/intervalo/horário/criado por/participantes/
  funcionário) (cap 02 §10).
- Criar evento (form de 9 campos com máscaras e chips), detalhes, excluir com confirmação
  (cap 02 §5, §8, §9).
- Picker de colaboradores estilo Outlook (cap 02 §6).
- Não há editar evento no HTML (decidir se cria) (cap 02 §14.2).
**Correção:** dar à Agenda uma seção própria na SPEC com `htmlRef: cap 02` e listar os
sub-blocos e decisões pendentes (6 vs 9 tipos; presets de período enxutos; manter month
picker multi-mês; anexos só com storage). "Filtros" e "calendário" hoje são vagos demais
para o PLAN.

## A8. §8 conflate/omite classificações: "modalidade" e "vendedor"
**Severidade: ALTO.**
- §8 lista "modalidade (operacaoNome)" como `real`. Mas há DUAS coisas chamadas modalidade:
  o tipo de operação fiscal (`operacaoNome`, plausivelmente real no cache) e o split
  digital/presencial do C6 (inferido, cap 06 §6). A SPEC funde os dois sob "modalidade real",
  o que vai fazer o C-05 exibir um split fictício com selo de "real".
- §8 NÃO classifica o vendedor (coluna Vendedor do C5). No HTML é fictício por UF
  (`salesClosedFallbackSeller`, cap 06 §5, cap 07 §9.7). Precisa virar `user_id`/salesperson
  real ou ser marcado estimado/sem_fonte.
**Correção:** em §8, separar "modalidade fiscal (operacaoNome)" de "canal digital/presencial
(inferido)"; adicionar linha "vendedor" com a fonte real esperada e selo até confirmar.

---

# MÉDIOS

## M1. Tema dark/light x dourado/prata e módulo "Tela/Aparência" fora de escopo, apesar de exigido
**Severidade: MÉDIO.**
O HTML tem 2 eixos de tema combináveis (4 combinações) com persistência e a tela "Tela"
de aparência (cap 01 §A.2, §A.3, §D). A missão lista "temas (dark/light x dourado/prata)"
como recurso transversal. A SPEC não menciona tema em lugar nenhum (só `prefers-reduced-motion`
em §6). Decidir: o nexus-odoo já tem ThemeProvider; a paleta dourado/prata e o dark/light
são funcionalidade do HTML que o cliente pode esperar.
**Correção:** declarar explicitamente se o eixo dourado/prata e a tela "Tela" entram,
reusam o ThemeProvider da plataforma, ou saem de escopo (com justificativa).

## M2. A-07 cita "giro", que é código MORTO; o vivo é só cobertura (A3-driven)
**Severidade: MÉDIO.**
`A-07 Idade média / giro / cobertura`. A perícia é explícita: o "turnover Nx" (giro) está
MORTO; o card 6 do A4 calcula COBERTURA = (estoque disponível / demanda pendente) * 30, e o
indicador A3/giro órfão não deve ser reconstruído (cap 03 §6, §11).
**Correção:** remover "giro" do A-07; nomear "idade média + tempo de cobertura"; registrar
em §11 (fora de escopo) que giro/turnover e `renderStockA3Indicators` são código morto.

## M3. K-07 "Compras por fornecedor (grafico)" pode estar ressuscitando pizzas mortas
**Severidade: MÉDIO.**
As pizzas SVG por fornecedor do A8 estão MORTAS desde v101 (cap 04 §0 consequência #1, §7).
O A8 vivo é a matriz tabular. `K-07 Compras por fornecedor | grafico | real | A8` parece
reintroduzir as pizzas sem dizer que é reintrodução consciente de código morto.
**Correção:** ou remover K-07, ou marcá-lo como "reintrodução opcional (pizzas A8 estavam
mortas)" e descrever o dado, evitando que o PLAN tente copiar geometria de algo que não
renderiza no HTML.

## M4. B8: modal de período próprio e os 3 cards de indicador por modelo não estão catalogados
**Severidade: MÉDIO.**
`B-05` cobre o B8 só como "grafico". O B8 vivo (v123+v124) tem: botão/modal de período com
6 presets ancorados na data máxima (cap 05 §9.4), barras que viram botões, e 3 cards de
indicador por modelo selecionado (entregues / a entregar / atrasados, cap 05 §9.3).
**Correção:** detalhar B-05 (ou adicionar sub-itens) com o seletor de período local e os 3
cards de insight, e reconciliar o período local com o período global (ver C2).

## M5. C8/C9: cada card tem seletor de período de 5 abas próprio e lógica de delta; catálogo raso
**Severidade: MÉDIO.**
`C-08` resume C8/C9 como "Comparativo de 2 estados (com delta)". O vivo (v134) é: dois cards,
cada um com UF + período próprios (modal de 5 abas + "usar período do C1"), 3 KPIs com badges
de delta cruzado, pizza por marca com delta por fatia, pill "vs UF" (cap 06 §9.5).
**Correção:** descrever o componente comparativo com: config por card (UF + período),
delta cruzado nos KPIs e na pizza, e marcar o dado como `sem_fonte`/novo (ver A2). Hoje é
vago demais para o PLAN e marcado com fonte errada.

## M6. "Atualizado há Xs" (timestamp de sync) ausente
**Severidade: MÉDIO.**
Decisão canônica #2 do projeto: toda leitura mostra "atualizado há Xs" do cache. A SPEC,
sendo telas que leem do cache, não menciona o selo de frescor em nenhum componente.
**Correção:** adicionar em §6 (ou §8) que cada componente de dado exibe o timestamp da
última sync da fonte que consome.

## M7. Travas e tamanhos dos compostos (A7, A8) não cabem no modelo de tipos da §4
**Severidade: MÉDIO.**
A §4 define travas por tipo (kpi/tabela/grafico/mapa/widget). A7 (3 colunas: lista + tabela
+ 10 KPIs + 2 donuts) e A8 (6 KPIs + ranking + matriz 11 colunas + modal) são compostos
grandes e fixos (A7 ~660px, A8 760px no HTML). Como "widget 2/4-4/4, 2u-6u" não descreve
um master-detail de 3 colunas.
**Correção:** ou definir um tipo "composto" com trava própria (largura cheia, altura grande,
layout interno fixo), ou explicitar que A7/A8 são componentes 4/4 com layout interno não
recomponível.

## M8. Saneamento de textos: nomear os alvos exatos
**Severidade: MÉDIO.**
§10 onda 7 cita "saneamento de textos" genericamente. A perícia aponta alvos concretos: o
typo "Painel de Usuáriosistrativo" (cap 01 §F.2), os travessões na `.auth-subtitle` e na
`.admin-strip` (cap 01 §F.2), o `'-'` default de período do contracheque (cap 02 §12.5), e
o uso de travessão como placeholder de vazio em tabelas (VISAO §9: usar "-" simples).
**Correção:** listar os textos exatos a corrigir e a regra (sem em dash; vazio = "-").

---

# BAIXOS

## B1l. G-01 com `htmlRef: home` é enganoso
**Severidade: BAIXO.** A Home do HTML é welcome + agenda + contracheques; não tem "KPIs
executivos (faturamento, a receber, a pagar...)". O domínio G é uma síntese nova (boa, mas
nova). **Correção:** marcar G-01/G-02/G-03 como "novo (síntese)" e referenciar as fontes
reais de cada KPI, não "home".

## B2l. C-02 tipo "grafico/mapa" pode introduzir mapa onde o HTML usa pizza
**Severidade: BAIXO.** C3 é pizza top-10 por UF, não mapa (cap 06 §3). A VISAO §9 deixou
mapa em Vendas como opcional. **Correção:** fixar C-02 como pizza (padrão do HTML) e tratar
o mapa de Vendas como decisão nova explícita, não como tipo ambíguo no catálogo.

## B3l. Inconsistência de grid entre SPEC e VISAO
**Severidade: BAIXO.** SPEC §4: `u ~= 132px`, kpi altura `1u-2u`. VISAO §4: `u ~= 140px`,
kpi `1u`. **Correção:** alinhar os números (a v3 escolhe um) para o PLAN não herdar conflito.

## B4l. Mapa órfão (#mod-mapa) não citado como decisão
**Severidade: BAIXO.** O heatmap órfão com count-up de 600ms e flash brightness(1.8) por
700ms (cap 07 §7.3) é a origem das animações "count-up" e "flash" citadas em §6, e é o único
ponto com conexão direta ao Odoo. **Correção:** registrar em §11 que o #mod-mapa sai (morto),
mas que suas animações (count-up, flash) são a referência reaproveitada.

## B5l. Quirk do A2 não citado: card principal sempre mostra o valor GERAL
**Severidade: BAIXO.** Na versão viva, o card de valor do A2 sempre exibe o total geral
mesmo com local filtrado (cap 03 §3.1). É contraintuitivo e merece nota para não ser
"corrigido" por engano. **Correção:** registrar o comportamento (ou decidir mudá-lo) em A-02.

## B6l. Welcome bar / saudação / role pill da Home não catalogada
**Severidade: BAIXO.** A barra de boas-vindas (avatar, "Bem-vindo, Nome", data por extenso,
pill de cargo, cap 02 §1) é elemento vivo da Home. Não há entrada (pode virar cabeçalho da
Visão Geral). **Correção:** decidir se vira componente G ou cabeçalho fixo do relatório
"Visão Geral".

---

## Síntese para a SPEC v2
Resolver na v2, em ordem: (1) contrato de interação cross-component [C1]; (2) sistema de
período/filtro e reconciliação dos seletores locais [C2]; (3) adicionar B1 ao catálogo [A1];
(4) corrigir as fontes de dado fictícias marcadas como reais e alinhar §3 com §8 [A2, A8];
(5) decidir reserva B2/B7 [A3]; (6) eixo de hierarquia + UF [A4]; (7) cravar a fórmula
proporcional e a de cobertura [A5]; (8) compostos A7/A8 e seu master-detail [A6, M7];
(9) detalhar a Agenda com htmlRef cap 02 [A7]. Os MÉDIOS/BAIXOS são incrementos de precisão
que evitam retrabalho no PLAN.
