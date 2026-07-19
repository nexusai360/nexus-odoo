# Perícia completa da reunião × sistema (Matrix Fitness / nexus-odoo)

> **Propósito.** Destrinchar TUDO que foi dito na reunião (dono × logística, com a tela do Odoo
> aberta) e mapear onde está no nosso sistema (cache Postgres do Odoo), dizendo o que já existe,
> o que precisa de ajuste e o que é genuinamente novo. Este documento é a base do PLAN da próxima
> sessão (vira spec → reviews → tasks).
>
> **Método.** 4 frentes de perícia em paralelo, cada afirmação confrontada com `SELECT` no cache
> real `nexus_odoo_l1` (2026-07-19). Nada de suposição: número medido.
>
> **Legenda de veredito.** ✅ PRONTO (já entregue nesta branch) · 🟢 EXISTE (o dado está no cache,
> falta usar) · 🔧 AJUSTAR (existe mas está errado/incompleto) · 🆕 NOVO (construir do zero) ·
> 🧱 INFRA (depende de ingerir campo novo do Odoo ou de um job rodar).

---

## 1. Relatório de Entregas Parciais (tela de Pedidos & Entregas)

**Estado:** ✅ o relatório já existe (blocos B-08 KPIs + B-09 tabela, sub-aba "Entregas parciais"),
com busca, export CSV e toggle "incluir anteriores ao corte". Colunas prontas: nº pedido, cliente,
UF, cidade, produto, família, marca, operação, etapa, qtd a atender, valor a atender (venda e
custo), status financeiro, forma de pagamento.

| Coluna / regra da reunião | Onde no sistema | Veredito |
|---|---|---|
| nº pedido, cliente, UF, cidade, produto, família, marca, qtd, valor | `fato_pedido` + `fato_pedido_item` + `fato_parceiro` + `fato_produto` | ✅ pronto |
| **Operação** (as que ele usa) | `fato_pedido.operacao_nome` (+ `categoria_operacao`). Demanda = venda/exportação não-intragrupo (`classifica-operacao.ts`) | ✅ pronto |
| **Etapa** (as que geram demanda aberta) | `fato_pedido.etapa_nome`; `bucket_demanda='ABERTA'` = etapa aberta CRUZADA com operação de venda (`classifica-etapa-demanda.ts`) | ✅ pronto |
| **Forma de pagamento** | `fato_pedido_parcela.forma_pagamento_nome` (251/342 pedidos; carteira pré-nota vem sem forma) | ✅ pronto |
| **Status liberado/bloqueado** | ver §3 | 🔧 ajustar |
| **Modalidade** (citada separada da operação) | **campo próprio `modalidade_frete` no raw** (CIF/FOB/terceiros/próprio, 100% preenchido). Hoje o código junta modalidade≡operação , **está errado** | 🔧 ajustar / 🆕 materializar |
| **Nº do pedido do Mercos** | ver §2 | 🆕 novo |

**Divergência 61 × 21 (explicada).** As 3 bases (com corte 16/03, bucket ABERTA): total do pedido
(header, venda) R$ 62,7 mi; a atender venda; a atender custo. A reconciliação com o card é por
construção (mesma função `aAtenderDoItem`). ⚠️ **Hoje `fato_pedido_item.quantidade_a_atender` está
100% NULL** (o job de atendimento não rodou no dev), então "a atender" cai na **quantidade cheia**
(≈ R$ 65 mi venda / R$ 36 mi custo) e a tela mostra o aviso âmbar. O "R$ 21 mi" real só aparece
quando o job de atendimento popular o saldo. 🧱 **INFRA: depende do job de atendimento.**

Anomalia leve a conferir: 2 pedidos com etapa nomeada "Cancelado" caem em ABERTA (sem o gatilho
`finaliza_pedido_cancelando`).

---

## 2. Número do MERCOS 🆕 (existe no sistema, como texto livre)

O dono confirmou: **Mercos** é um sistema externo (CRM de vendas); há um número de referência.
- **Onde está (medido):** no texto livre `raw_pedido_documento.obs` , **827 de 2.542 pedidos (33%)**
  no formato `PEDIDO MERCOS: NNNNN` (variações: sem espaço, "Pedido Mercos 44142", "Mercos 31737").
  Também em `raw_sped_documento.infcomplementar` (1.904 notas).
- **Formato real:** 4–5 dígitos (predomínio 5), não 2–4. Extrator: `(?i)mercos[^0-9]{0,10}([0-9]{1,7})`.
- **Veredito:** 🆕 não existe campo estruturado nem no código. **Não precisa re-sync** (o texto já está
  ingerido). Ação: parsear `obs` no builder e materializar uma coluna `numero_mercos` em `fato_pedido`.

---

## 3. Status financeiro liberado/bloqueado 🔧 (existe e cruza certo; ajustar o predicado)

Regra da reunião: "bloqueado = o CLIENTE do pedido tem conta a receber em atraso" (menu Vendas >
Contas a Receber). O menu = **`fato_financeiro_titulo`** (`tipo='a_receber'`), já mapeado em
`queryContasAReceber`/`queryTitulosVencidos`.
- **Cruzamento válido:** `fato_pedido.participante_id` = `fato_financeiro_titulo.participante_id`
  (mesmo `res.partner`). Não precisa join por CNPJ.
- **Já implementado:** `statusBloqueioPorCliente` (batched, predicado dos vencidos, intragrupo fora).
- **Inconsistência a AJUSTAR:** hoje `BLOQUEIO_SO_NOTA_EMITIDA=true` usa só `nota_fiscal_id != null`.
  A definição de "Contas a Receber" da plataforma é `nota_fiscal_id != null **OR** pedido_faturado`.
  Medido nos 353 clientes com pedido ABERTA:

  | Regra | Clientes bloqueados |
  |---|---|
  | C1 atual (só NF) | 15 |
  | **C1b (NF ou pedido faturado) , recomendado, fiel ao menu** | **23** |
  | C2 (qualquer a_receber vencido, inclui carteira) | 88 |

  Recomendação: mudar para **C1b (23)**. C2 (carteira) contradiz a regra canônica de que carteira é
  receita contratada, não dívida , só se o dono decidir. **Decisão de escopo do dono, mas o dado
  está pronto.**

---

## 4. Kits: desmembramento e valor

**Identificação (comprovada):** kit = unidade "kit" (129 produtos) + tem BOM (`fato_lista_material_item`,
135 kits). **Matrix × acessório pela família:** JOHNSON/MATRIX = equipamento (84 kits), ACESSÓRIOS =
dumbbell/halter/anilha.

**Fase 1 (necessidade de compra por componente):** ✅ **já entregue** , a demanda de kit vira
demanda dos componentes, abate kit montado, custo por componente (`fato_produto.preco_custo`),
fallback para kit sem BOM. E2E: das 433 linhas, só 2 seguem como kit.

**Fase 2 (ratear o VALOR DE VENDA do kit aos componentes):** 🆕 algoritmo definido e validado:
- Rateio **proporcional ao `preco_custo` de cada componente** (fallback venda → tabela; cobertura
  95,3%), fechamento por maior resto (soma = V exato). **Um só algoritmo cobre Matrix e acessório**
  (o custo por peça já embute estrutura cara vs painel barato, dumbbell pesado vs leve, e a "torre"
  é só mais um componente com custo próprio , sem regra manual).
- ⚠️ **Achado honesto para o dono:** o custo diz que o **painel vale ~14% a 25%** do kit Matrix, não
  zero como no método manual do colega. O manual superestimava a estrutura. Se o dono exigir
  painel=0, é regra especial contra o dado. Recomendo mostrar o rateio honesto por custo.
- Só 3 kits vendidos sem BOM (não decomponíveis) e 1 componente sem custo (fallback).

---

## 5. Locais de estoque (o de-para real)

Classificação hoje (valor a custo): físico R$ 28,99 mi · fora R$ 14,44 mi · demonstração R$ 2,30 mi.
Árvore: raízes `Próprio` (1), `Terceiros` (2), `Virtual` (3).

| Bloco da reunião | No sistema | Veredito |
|---|---|---|
| **Próprio** (JDS SE/SP/DF) | ids 11/12/24 (+ matriz), classificados físico | ✅ correto |
| **Demonstração em cliente** (nota + terceiro) | subárvore `Terceiros / Demonstração` (id 251), 56 locais, R$ 2,3 mi, proprietário = nossas empresas | ✅ correto |
| **Showroom** | id 35, hardcoded demonstração | ✅ correto |
| **JDSDEMO nosso** | **id 414 "Próprio / JDS DEMO SÃO PAULO" é LIXO deletado no Odoo** (criado 2026-05-28 16:54:49, removido 16:56:05, 76s de vida, zero saldo/serial/movimento). `rawDeleted=true` correto; builder o exclui certo (389 raw ativos = 389 fato). **Não é bug, não ressuscitar.** A ação foi criar a REGRA de classificação JDSDEMO (PLAN 1 B1) para um futuro JDSDEMO ativo | ✅ resolvido (regra criada; 414 permanece fora, fiel ao Odoo) |
| **DSTOCK / "terceiro que é nosso"** | não existe por nome. Candidato: **R$ 5,3 mi de equipamento Matrix pendurado no nó "Terceiros" (id 2)**, hoje "fora". `proprietario_local_id` do nó = false; **não há dado que prove posse** | 🧱 infra (ingerir `usage`/proprietário do local) + confirmar com o dono |
| **Em transferência / trânsito** | conceito não ingerido (`usage='transit'` não vem; `tipo` só é sintético/analítico). Candidato: **R$ 9,1 mi no nó "Virtual" (id 3)**, hoje "fora" | 🧱 infra (ingerir `usage` do stock.location) |

**Único indicador de posse hoje:** SPED `raw_sped_apuracao_inventario_local.ind_posse` (0 próprio/1 em
poder de terceiros), grão mensal, cobertura parcial (só R$ 963 k marcado como "em poder de terceiros").
**Para resolver DSTOCK + trânsito de forma estrutural: ingerir do Odoo o `usage` do `stock.location`**
(internal/transit/customer/supplier) e/ou o vínculo com `stock.warehouse`. Sem isso, os R$ 14,4 mi de
"fora" (9,1 Virtual + 5,3 Terceiros) não se separam com segurança.

---

## 6. KPIs da Visão Geral , conferidos

| KPI | Fonte | Veredito |
|---|---|---|
| Faturamento / Ticket médio / Nº pedidos | `queryIndicadoresVendas` (nota de venda real, CFOP venda não-intragrupo) | ✅ |
| Valor em estoque | ✅ invertido para custo puro (R$ 29,8 mi), índice no rodapé | ✅ |
| A receber | `queryContasAReceber` (só faturado; carteira à parte) | ✅ |
| A pagar | `queryContasAPagar` | ✅ |
| Demandas a entregar | `queryIndicadoresDemandas` (bucket ABERTA) | ✅ |
| Sigla da UF no mapa | ✅ entregue | ✅ |

Caveat: estoque/a receber/a pagar/demandas não recortam por empresa (o hint avisa "grupo inteiro").

---

## 7. Quadro-resumo (o que vira task)

| # | Item | Veredito | Esforço |
|---|---|---|---|
| A | Relatório de Entregas Parciais (base + colunas) | ✅ pronto | , |
| B | Necessidade de compra desmembrando kits (Fase 1) | ✅ pronto | , |
| C | Card estoque a custo, sigla UF, A receber/A pagar | ✅ pronto | , |
| D | **Bloqueio**: alinhar predicado a "NF ou pedido faturado" (C1b, 23 clientes) | 🔧 ajustar | baixo |
| E | **Modalidade**: materializar `modalidade_frete` e separar da operação | 🔧+🆕 | baixo-médio |
| F | **Nº do Mercos**: parsear `obs` → coluna `numero_mercos` em `fato_pedido` | 🆕 | médio (builder + migration) |
| G | **Rateio de valor dos kits (Fase 2)**: proporcional ao custo | 🆕 | médio |
| H | **JDS DEMO SP (id 414)**: era premissa errada (não é bug de builder). O 414 é lixo deletado no Odoo (76s de vida, zero saldo). Ação real: criar a REGRA JDSDEMO nosso (Próprio + demo → demonstração) para o futuro. | ✅ resolvido (PLAN 1 B1) | baixo |
| I | **DSTOCK + Trânsito**: ingerir `usage`/proprietário do `stock.location` do Odoo, então reclassificar | 🧱 infra | ALTO (sync novo + migration) |
| J | **Job de atendimento** (`quantidade_a_atender`): fazer rodar para o "a atender" real (21 mi) | 🧱 infra | médio (worker) |
| K | Demonstração em 2 blocos (nossos × cliente) | 🟢 depende de H | baixo |

---

## 8. Dependências de INFRA (o que trava algumas frentes)
1. **Job de atendimento** popular `quantidade_a_atender` , sem ele, "a atender" mostra a quantidade
   cheia (afeta o relatório e o card de demanda). É worker/sync, não query.
2. **Ingerir `usage` do `stock.location`** (e proprietário/warehouse) , destrava DSTOCK e trânsito.
   É modelo novo/campo novo no sync + migration + reclassificação.
3. **Parsear Mercos** de `obs` , não precisa re-sync, mas precisa builder + coluna nova.

## 9. Já entregue nesta branch (para não refazer)
Lote 1 completo (relatório de entregas parciais, card a custo, sigla UF, verificações financeiras)
e Lote 2 Fase 1 (desmembramento de kits na necessidade de compra). 17 commits, sem PR/merge.

---

## 10. DECISÕES E DIRETRIZES DO DONO (2026-07-19) , valem para o PLAN

1. **O ERP Odoo é a FONTE DA VERDADE.** Quando o dono diz "o sistema", quase sempre é o **ERP
   Odoo** (de onde puxamos os dados brutos). A plataforma Nexus Odoo tem que ser **coerente e
   sincronizada com o ERP**: como um dado funciona/é classificado no Odoo é como tem que aparecer
   na plataforma. Nada de inventar regra que diverge do ERP.
2. **Bloqueado = como o ERP define conta a receber vencida.** ✅ **JÁ AJUSTADO NO CÓDIGO** (2026-07-19):
   `statusBloqueioPorCliente` agora bloqueia por título a_receber FATURADO (nota emitida **OU**
   pedido faturado) vencido em aberto , o que o menu Contas a Receber do Odoo lista (23 clientes,
   não 15). Carteira (não faturado) não é conta a receber no Odoo, então não bloqueia.
3. **CONSISTÊNCIA NAS 4 PONTAS (inegociável).** Todo dado/regra que a gente criar ou ajustar tem
   que alimentar IGUAL as 4 saídas: **(1) menu Diretoria** (todos os relatórios dele), **(2)
   Relatórios 1.0**, **(3) Relatórios 2.0**, **(4) Agente Nex** (bubble in-app + WhatsApp/MCP). O
   mesmo número tem que aparecer em qualquer uma. Onde o 1.0/2.0 estiverem defasados, ao mexer
   neles têm que passar a alimentar igual. **Toda task do plan deve checar as 4 pontas.**
4. **Reproduzir a reunião ao pé da letra** (não perguntar o que já foi dito): ver §11.

## 11. LÓGICA DE ESTOQUE / DEMONSTRAÇÃO , reproduzir EXATAMENTE o que a reunião falou

O colega detalhou, com a tela aberta, como o estoque deve ser qualificado. Regra a implementar
(vale para o Nexus Odoo, fiel ao Odoo):

**A) Estoque FÍSICO / próprio** (o que está disponível para entrega; base da análise de compra):
- Depósitos próprios: **JDS filial SE, filial SP, matriz DF**.
- O local que aparece como **"terceiro" mas é NOSSO** ("DSTOCK", mercadoria da JDS armazenada
  fora) , conta como próprio/físico.
- **"Em transferência" (trânsito)**: mercadoria nossa a caminho , conta como **próprio/físico**.

**B) Estoque de DEMONSTRAÇÃO** (movimentação; NÃO é 100% vendável; análise separada), **2 sub-tipos,
no MESMO painel, um em cima do outro**:
- **Nossos (JDSDEMO)**: locais de demonstração NOSSOS, espalhados, **sem nota de demonstração**
  (nome contém "demo"/"JDSDEMO"). Regra do colega: "tudo que tem 'demonstração' no nome vai para
  demonstração; **mais** o JDSDEMO (nossos depósitos de demo), exclusivamente."
- **Em cliente**: produto num cliente **com nota de demonstração** (marcado "demonstração" +
  "terceiro"; a JDS é a proprietária, o local está no cliente).
- **UI**: painel de demonstração com **os nossos (JDSDEMO) em cima e os que estão em cliente
  embaixo**, no mesmo painel, para comparar ("tenho X de demonstração e Y de estoque").

**Objetivo do colega**: ver, lado a lado, o **DSTOCK real/físico** (disponível para entrega, base da
compra) e o **DSTOCK de demonstração** ("tenho 5 mi de demonstração e 50 mi de estoque").

**Estado no cache (da perícia §5)**: Próprio SE/SP/DF ✅; demonstração-em-cliente ✅; showroom ✅;
**JDS DEMO SP (id 414) é lixo deletado no Odoo (76s de vida, zero saldo) → NÃO ressuscitar; a REGRA
JDSDEMO nosso foi criada (PLAN 1 B1) para reconhecer um futuro JDSDEMO ativo**;
**DSTOCK-nosso-em-terceiro (R$ 5,3 mi) e trânsito (R$ 9,1 mi) hoje caem em "fora"** e só se separam
de verdade **ingerindo do Odoo o `usage` do `stock.location`** (internal/transit/customer/supplier)
+ o proprietário/warehouse. **É a peça de INFRA mais pesada, mas o dono mandou "fazer acontecer".**

## 12. Escopo consolidado para os PLANS da próxima sessão (ordem sugerida)
Cada um vira PLAN v1 → review pesada → v2 → review mais pesada → v3 → tasks → testes → perícia da
onda. Fazer respeitando as 4 pontas (§10.3).
- **PLAN 1 , Ajustes finos (baixo risco, fecham o que já existe)**: modalidade_frete (materializar +
  separar da operação); JDS DEMO SP (bug id 414 + classificar demonstração); demonstração em 2
  blocos na UI. + garantir 4 pontas.
- **PLAN 2 , Nº do Mercos**: parsear `raw_pedido_documento.obs` (regex `mercos...([0-9]+)`) → coluna
  `numero_mercos` no `fato_pedido` (migration) → expor no relatório de entregas, e nas 4 pontas
  (Diretoria + relatórios + tool do Nex).
- **PLAN 3 , Rateio de valor dos kits (Fase 2)**: `desmembrarValor` proporcional ao `preco_custo`
  (fallback venda→tabela, fechamento por maior resto), aplicar onde o valor de venda por componente
  faz sentido; nas 4 pontas. Reportar ao dono o "painel vale 14-25%, não zero".
- **PLAN 4 , INFRA de estoque (o pesado)**: ingerir `usage`/proprietário do `stock.location` (modelo
  novo/campos no sync + migration) → reclassificar locais para separar DSTOCK-nosso (→físico) e
  trânsito (→físico); DSTOCK real × demonstração lado a lado. Depois, ajustar KPI de estoque,
  necessidade de compra, seriais e as 4 pontas.
- **PLAN 5 , Job de atendimento**: fazer `quantidade_a_atender` popular (worker/sync) para o "a
  atender" real (R$ 21 mi) em vez da quantidade cheia. Afeta relatório de entregas e card de demanda.
