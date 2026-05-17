# Estoque — Catálogo de relatórios para o dashboard gerencial (F3)

> Pesquisa de produto: o que os dados reais do cache suportam e quais relatórios
> de estoque entregam mais valor para um gestor de movimentação/entrega de
> equipamentos de academia (Matrix Fitness Group / Grupo JHT).
> Base: cache Postgres local + `discovery/output/`. Inspeção feita em 2026-05-16.

---

## 1. Panorama dos dados de estoque disponíveis

### 1.1 O que existe e tem volume real

| Domínio | Tabela do cache | Linhas | Conteúdo útil |
|---|---|---:|---|
| **Saldo atual** | `raw_estoque_saldo_hoje` | 3.218 | Saldo por produto × local. `saldo`, `vr_saldo` (valor R$), `disponivel`, `reservado`, `programado`, `produto_id`, `local_id`, `unidade_id` |
| **Saldo (tipado)** | `fato_estoque_saldo` | 3.218 | Versão tipada do acima: `produto_nome`, `local_nome`, `quantidade`, `unidade`. **Não traz valor R$** — só quantidade |
| **Duração / parados** | `raw_estoque_saldo_hoje_duracao_dias` | 3.218 | `dias` (dias desde a última entrada), `data_anterior` (última entrada), `saldo`, `saldo_anterior` por produto × local |
| **Movimentação** | `raw_estoque_extrato` | 13.548 | Lançamentos de entrada/saída: `data`, `data_hora`, `tipo`, `quantidade` (± sinal), `valor`, `vr_saldo`, `origem` (ex.: `PV-0831/26`), `origem_id`, `pedido_id`, `documento_id`, `participante_id`, `local_id`, `local_inverso_id`. Período: **2025-10-28 a 2026-05-16** |
| **Movimentação rastreada** | `raw_estoque_extrato_rastreabilidade` | 23.223 | Mesma movimentação detalhada por lote/série |
| **Saldo histórico** | `raw_estoque_saldo` | 8.613 | Saldos em pontos anteriores (não-hoje) |
| **Rastreabilidade hoje** | `raw_estoque_saldo_rastreabilidade_hoje` | 5.127 | Saldo por lote/número de série |
| **Locais** | `raw_estoque_local` | 347 | Armazéns/depósitos: `nome`, `nome_completo`, `tipo` (341 analíticos `A`, 6 sintéticos `S`), `local_superior_id`, `estoque_em_maos`, `proprietario_local_id` |
| **Produtos** | `raw_sped_produto` / `raw_sped_produto_variante` | 3.787 | Cadastro: `nome`, `codigo`, `familia_id`, `marca_id`, `unidade_id`, `preco_venda` (2.972 preenchidos), `preco_custo`, `preco_custo_medio_estoque` (2.982 preenchidos), `tipo` |
| **Famílias** | `raw_sped_produto_familia` | 9 | ACESSÓRIOS, LIFE FITNESS, ASTEC, JOHNSON, LONGLIFE, PADRÃO, DIVERSOS, USO E CONSUMO |
| **Marcas** | `raw_sped_produto_marca` | 31 | Marcas de produtos |
| **Tipos de produto** | `raw_sped_produto_tipo` | 12 | Tipos fiscais |
| **Operações de pedido** | `raw_pedido_operacao` | 36 | Catálogo de operações (venda, transferência, etc.) — referência |

**Números agregados verificados:**
- Saldo de hoje cobre **1.731 produtos distintos** com saldo, **13.768 unidades** no total e **R$ 52,97 milhões** em valor de estoque (`vr_saldo`).
- Movimentação concentrada nos últimos 3 meses: mar/2026 (1.931 entradas / 1.319 saídas), abr/2026 (2.527 / 2.847), mai/2026 parcial (1.154 / 1.581). Antes de fev/2026 o volume é residual — o histórico útil para análise de giro é **fev–mai/2026 (~4 meses)**.
- Tipos de movimento no extrato: `00` (12.263 — operação normal), `04` (1.283), `07` (2).
- Locais relevantes por concentração: **Jds - Matriz DF** domina (1.608 produtos, 9.482 un.), seguido de Jht SP, Jib DF, Jds Filial SE/SP, Virtual, Terceiros.
- Produtos parados: **51 produtos × local** estão há mais de 90 dias sem entrada; o `dias` satura em ~179 (limite da janela de dados sincronizados).

### 1.2 O que está vazio ou inacessível — NÃO usar

| Modelo | Situação | Impacto |
|---|---|---|
| `sped.documento` (Documentos Fiscais / NF-e) | `raw_sped_documento` = **0 linhas**. Sync abortou (`AbortError` / timeout) | **Sem dados de notas fiscais.** Não dá para relatório de faturamento por NF, ticket médio fiscal, etc. |
| `sped.documento.item` (Itens da NF) | `raw_sped_documento_item` = **0 linhas** (`sem_acesso`) | Sem detalhamento de venda por item fiscal |
| `pedido.documento` (Pedidos) | `raw_pedido_documento` = **0 linhas** (`sem_acesso`) | Sem cabeçalho de pedidos. **MAS** o vínculo pedido↔movimentação sobrevive via `extrato.origem` / `pedido_id` (texto + id) |
| `sped.produto.lote.serie` | `sem_acesso` | Cadastro de lotes não veio (a rastreabilidade do extrato/saldo, sim) |
| `res.partner` / `sped.participante` | erro de sync (`Compute method failed`) | Sem cadastro de clientes; nomes de participantes chegam só inline no extrato |
| `estoque.minimo.maximo` | 0 registros **na origem** | Não há estoque mín/máx cadastrado no Odoo — relatório de ruptura por parâmetro é inviável |
| `sped.apuracao.inventario` | 0 registros | Sem inventários formais |

> **Consequência central para a F3:** "o que vendeu / não vendeu" e "entradas vs.
> saídas" devem ser ancorados no **`estoque.extrato`** (movimentação física),
> NÃO em documentos fiscais. As saídas com `local_inverso_id` apontando para
> `Vendas » Terceiros` e `origem` tipo `PV-xxxx` são o proxy confiável de venda.
> Qualquer relatório que dependa de `sped.documento*` ou `pedido.documento` está
> **fora de escopo na F3** até a ingestão desses modelos ser corrigida.

> **Nota de saúde de dados:** `sync_state.record_count` está dessincronizado
> (mostra 0 para tabelas que têm linhas). A contagem confiável é `count(*)` na
> própria tabela `raw_*`. Sinalizar isso ao time de ingestão — não bloqueia a F3.

---

## 2. Catálogo de relatórios priorizado

Legenda de viabilidade: ✅ dados existem e populados · ⚠️ parcial / com ressalva · ❌ dados ausentes.

---

### R1 — Saldo atual por produto e armazém
- **Pergunta do gestor:** "Quanto eu tenho de cada produto e em qual armazém ele está?"
- **Valor:** É a pergunta de estoque número um. Localizar fisicamente o equipamento, saber o que está disponível para venda/entrega, base de toda decisão operacional.
- **Dados-fonte:** `fato_estoque_saldo` (`produto_nome`, `local_nome`, `quantidade`, `unidade`) ou `raw_estoque_saldo_hoje` quando precisar de `disponivel`/`reservado`/`vr_saldo`.
- **Visualização:** Tabela mestre filtrável (produto, armazém, família) com busca; matriz produto × armazém como visão alternativa.
- **Viabilidade:** ✅ 3.218 linhas, 1.731 produtos, 347 locais. Totalmente populado.
- **Prioridade: ALTA** — fundação do dashboard; tudo mais se apoia nela.

---

### R2 — Valor de estoque por armazém (concentração de capital)
- **Pergunta do gestor:** "Quanto dinheiro eu tenho parado em cada depósito?"
- **Valor:** R$ 52,97 mi imobilizados em estoque. Saber a concentração por local orienta seguro, risco, e decisão de redistribuição. Mostra onde o capital está preso.
- **Dados-fonte:** `raw_estoque_saldo_hoje` — `vr_saldo` agregado por `local_id`; cruzar com `raw_estoque_local` (`nome_completo`, `tipo`).
- **Visualização:** Gráfico de barras horizontais (valor por armazém) + treemap de concentração; cartão de KPI com valor total.
- **Viabilidade:** ✅ `vr_saldo` preenchido no saldo de hoje. (Atenção: usar `raw_estoque_saldo_hoje`, não `fato_estoque_saldo`, pois a tabela tipada não tem valor R$.)
- **Prioridade: ALTA** — visão financeira do estoque com baixo esforço, alto impacto gerencial.

---

### R3 — Entradas vs. saídas no período (fluxo de movimentação)
- **Pergunta do gestor:** "Quanto entrou e quanto saiu de estoque, mês a mês?"
- **Valor:** Mede o pulso da operação de movimentação — empresa cuja atividade-fim é justamente mover equipamento. Detecta tendência de acúmulo ou esvaziamento.
- **Dados-fonte:** `raw_estoque_extrato` — `data`, `quantidade` (sinal: >0 entrada, <0 saída), `valor`, agregado por mês.
- **Visualização:** Gráfico de barras agrupadas (entradas vs. saídas por mês) + linha de saldo líquido.
- **Viabilidade:** ✅ 13.548 lançamentos. Janela confiável fev–mai/2026 (antes disso volume residual — exibir aviso de "histórico a partir de fev/2026").
- **Prioridade: ALTA** — relatório-assinatura para o domínio de movimentação.

---

### R4 — Produtos parados (sem giro)
- **Pergunta do gestor:** "Quais equipamentos estão encalhados há muito tempo sem movimento?"
- **Valor:** Capital imobilizado, espaço de armazém ocupado, risco de obsolescência. Identificar parados é gatilho de promoção, transferência ou baixa.
- **Dados-fonte:** `raw_estoque_saldo_hoje_duracao_dias` — `dias`, `data_anterior`, `saldo` por produto × local; enriquecer valor com `vr_saldo` de `raw_estoque_saldo_hoje` (join por id).
- **Visualização:** Tabela ordenada por `dias` desc, com faixas (30/60/90/+90 dias) e valor imobilizado por faixa; cartão "X produtos parados há +90 dias".
- **Viabilidade:** ✅ Modelo dedicado e populado (3.218 linhas). 51 itens já passam de 90 dias. Ressalva: `dias` satura ~179 (limite da janela sincronizada) — relatório válido, mas "parado há mais de 6 meses" não é distinguível ainda.
- **Prioridade: ALTA** — altíssimo valor gerencial, dado pronto e específico.

---

### R5 — Giro de estoque por produto / família
- **Pergunta do gestor:** "Quais produtos giram rápido e quais ficam parados?"
- **Valor:** Distingue o que vale repor do que vale descontinuar. Orienta compras e mix.
- **Dados-fonte:** Saídas de `raw_estoque_extrato` (soma de `quantidade` negativa por `produto_id` no período) ÷ saldo médio de `raw_estoque_saldo_hoje`; agrupar por `familia_id` de `raw_sped_produto`.
- **Visualização:** Tabela ranqueada de giro + gráfico de barras top/bottom; curva ABC.
- **Viabilidade:** ⚠️ Movimentação e saldo existem. Ressalva: saldo médio confiável só sobre 4 meses; saldo histórico (`raw_estoque_saldo`) ajuda mas é parcial. Calcular giro sobre janela fixa e rotular o período.
- **Prioridade: MÉDIA** — valioso, mas exige métrica derivada e período curto; entregar após o lote-fundação.

---

### R6 — Top produtos movimentados / "o que mais saiu"
- **Pergunta do gestor:** "Quais foram os equipamentos mais movimentados (que mais saíram) no período?"
- **Valor:** Mostra os campeões de saída — base para previsão de reposição e foco comercial.
- **Dados-fonte:** `raw_estoque_extrato` — soma de `quantidade` negativa e de `valor` por `produto_id`, filtrável por período e por `local_inverso_id` (= `Vendas » Terceiros` isola saída por venda).
- **Visualização:** Ranking de barras (top 20) + tabela com quantidade e valor movimentado.
- **Viabilidade:** ✅ Extrato cobre quantidade, valor, produto e destino. Proxy de venda confiável via `local_inverso_id`/`origem` PV-xxxx (já que NF-e está ausente).
- **Prioridade: ALTA** — responde "o que vendeu" sem depender de documento fiscal.

---

### R7 — Produtos sem nenhuma saída no período ("o que não vendeu")
- **Pergunta do gestor:** "Quais produtos em estoque não tiveram nenhuma saída no período?"
- **Valor:** Complemento de R6 — lista de candidatos a encalhe que ainda nem entraram no radar de "parado por dias".
- **Dados-fonte:** Produtos de `raw_estoque_saldo_hoje` que NÃO aparecem como saída em `raw_estoque_extrato` na janela; enriquecer com `vr_saldo`.
- **Visualização:** Tabela com saldo, valor imobilizado e dias desde última entrada.
- **Viabilidade:** ✅ Cruzamento de saldo × extrato, ambos populados.
- **Prioridade: MÉDIA** — alto valor, mas sobrepõe parcialmente R4; entregar logo após.

---

### R8 — Concentração de estoque por família e marca
- **Pergunta do gestor:** "Como meu estoque se distribui entre famílias e marcas (Life Fitness, Astec, Johnson...)?"
- **Valor:** Visão de mix de portfólio e exposição por marca/linha. Apoia negociação com fornecedores.
- **Dados-fonte:** `raw_estoque_saldo_hoje` (saldo + `vr_saldo`) × `raw_sped_produto` (`familia_id`, `marca_id`).
- **Visualização:** Treemap ou rosca por família; barras por marca.
- **Viabilidade:** ✅ Família (9) e marca (31) populadas; join produto↔saldo direto.
- **Prioridade: MÉDIA** — bom panorama executivo, esforço baixo.

---

### R9 — Estoque reservado / programado vs. disponível
- **Pergunta do gestor:** "Do que tenho em estoque, quanto já está comprometido e quanto está livre para vender?"
- **Valor:** Disponível real ≠ saldo total. Evita vender o que já está reservado para entrega.
- **Dados-fonte:** `raw_estoque_saldo_hoje` — campos `saldo`, `disponivel`, `reservado`, `programado`.
- **Visualização:** Barra empilhada por produto/armazém (disponível | reservado | programado); KPIs de totais.
- **Viabilidade:** ⚠️ Campos existem no schema. **Verificar volume:** na amostra inspecionada `reservado`/`programado` vinham 0 — pode ser que a operação pouco use reserva. Validar a distribuição antes de priorizar; se quase tudo for zero, rebaixar para baixa.
- **Prioridade: MÉDIA** (condicional à validação de preenchimento).

---

### R10 — Rastreabilidade por lote / número de série
- **Pergunta do gestor:** "Onde está o equipamento de série X e qual seu histórico?"
- **Valor:** Equipamento de academia é bem de alto valor unitário e rastreável por série — útil para garantia, recall, auditoria.
- **Dados-fonte:** `raw_estoque_saldo_rastreabilidade_hoje` (5.127) + `raw_estoque_extrato_rastreabilidade` (23.223).
- **Visualização:** Busca por lote/série + linha do tempo de movimentações.
- **Viabilidade:** ⚠️ Movimentação rastreada existe, mas o cadastro `sped.produto.lote.serie` está `sem_acesso` — descrições de lote podem ficar pobres. Funciona, com rótulos inline.
- **Prioridade: BAIXA** — caso de uso de nicho; entregar depois do núcleo gerencial.

---

### R11 — Saldo negativo / inconsistências de estoque
- **Pergunta do gestor:** "Tenho algum produto com saldo negativo ou inconsistente?"
- **Valor:** Saldo negativo indica erro de lançamento ou furo de processo. Higiene de dados operacional.
- **Dados-fonte:** `raw_estoque_saldo_hoje` — `saldo < 0`; flag `alerta_rastreabilidade`.
- **Visualização:** Tabela de exceções com produto, local, saldo.
- **Viabilidade:** ✅ Verificação direta sobre saldo de hoje.
- **Prioridade: BAIXA** — útil como aba de "saúde", não é decisão estratégica.

---

### R12 — Movimentação por armazém / fluxo entre locais
- **Pergunta do gestor:** "Qual a intensidade de movimentação de cada armazém e quanto transita entre depósitos?"
- **Valor:** Empresa de movimentação — entender quais locais são hubs e o volume de transferências internas dimensiona equipe e logística.
- **Dados-fonte:** `raw_estoque_extrato` — `local_id` e `local_inverso_id` (origem↔destino do movimento), agregado por par.
- **Visualização:** Matriz origem × destino (heatmap) ou diagrama de fluxo; barras de movimentação por local.
- **Viabilidade:** ✅ `local_id` + `local_inverso_id` presentes em todos os lançamentos.
- **Prioridade: MÉDIA** — fortemente alinhado ao domínio; deixar para o 2º lote.

---

### Relatórios descartados por falta de dados (honestidade de viabilidade)
- ❌ **Ruptura vs. estoque mínimo/máximo** — `estoque.minimo.maximo` tem 0 registros na origem; não há parâmetro cadastrado.
- ❌ **Faturamento / vendas por NF-e, ticket médio fiscal, margem por nota** — `sped.documento` e `sped.documento.item` vazios (sync abortado/sem acesso).
- ❌ **Análise de pedidos (status, ciclo, etapas)** — `pedido.documento` sem acesso; só sobrevive o vínculo textual no extrato.
- ❌ **Vendas por cliente / curva de clientes** — `res.partner` e `sped.participante` com erro de sync; só nomes inline, sem cadastro confiável.
> Estes voltam à mesa quando a ingestão desses modelos for corrigida — não na F3.

---

## 3. Conjunto inicial recomendado da F3 (primeiro lote)

Critério: máximo valor gerencial × dados 100% populados e verificados × esforço
de cálculo baixo. Seis relatórios que, juntos, já entregam um dashboard de
estoque completo e honesto, e estabelecem a infraestrutura (filtros de
produto/família/armazém/período, tabela mestre, cartões de KPI, gráficos) que o
restante reaproveita.

| # | Relatório | Por que entra no primeiro lote |
|---|---|---|
| **R1** | Saldo por produto e armazém | Fundação. Tabela mestre + filtros que todos os demais reusam. Dados ✅ completos. |
| **R2** | Valor de estoque por armazém | Visão financeira (R$ 52,97 mi) com esforço mínimo; KPI de abertura do painel. ✅ |
| **R3** | Entradas vs. saídas por mês | Relatório-assinatura do domínio de movimentação; pulso da operação. ✅ |
| **R4** | Produtos parados (sem giro) | Altíssimo valor gerencial — capital encalhado — e tem modelo de dados dedicado e pronto. ✅ |
| **R6** | Top produtos movimentados ("o que saiu") | Responde "o que vendeu" sem depender de NF-e; dado de extrato completo. ✅ |
| **R8** | Concentração por família e marca | Panorama executivo de mix; join simples, esforço baixo, fecha a visão estratégica. ✅ |

Lote seguinte (mesmo padrão, após a infraestrutura pronta): R5 (giro), R7 (o que
não saiu), R12 (fluxo entre armazéns), depois R9/R10/R11. Os relatórios baseados
em documento fiscal e cliente ficam pendentes de correção da ingestão.
