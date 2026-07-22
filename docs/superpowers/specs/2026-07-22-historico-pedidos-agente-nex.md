# Histórico dos pedidos + evolução do Agente Nex , mapa e plano

> Data: 2026-07-22. Autor: sessão B-09 (feat/entregas-parciais-base-calculo).
> Status: **planejamento** (spec de arranque). Nada implementado ainda.
> Objetivo: sair da próxima sessão com tudo mapeado para agregar histórico dos
> pedidos e novas tools temporais no Agente Nex, reusando o que já existe.

---

## 0. TL;DR (leia isto primeiro)

- **Os VALORES do pedido do B-09 (margem, desconto, impostos, CBS/IBS, comissão,
  valor produto, saldo a atender) NÃO têm histórico.** São gravados por `upsert`
  (sobrescreve). Vemos só o AGORA.
- **MAS o padrão de historização já existe e está maduro:** estoque saldo, preço e
  etapa do pedido JÁ têm série temporal populada, com builders `append-por-mudança`
  provados (`vigente` + `rodada_id` + `capturado_em` + `evento`).
- **Já existe 1 tool temporal no MCP:** `pedido-historico.ts` (etapa/aging). Estoque e
  preço têm histórico gravado mas (a confirmar) provavelmente SEM tool que o exponha.
- **Recomendação crítica:** o maior ROI imediato é **expor histórico que já existe**
  (Fase A). Só depois **historizar os valores do pedido** reusando o padrão (Fase B).
  Não sair historizando 30 colunas de 2.840 pedidos por historizar , cirúrgico.

---

## 1. O que aprendemos nesta sessão (contexto do B-09)

A tabela B-09 (Entregas Parciais, menu Diretoria > Pedidos & Entregas) é uma tabela
POR PEDIDO. Toda coluna dela lê do **snapshot atual** do cache. Nenhuma tem histórico.

Arquivos-chave (nosso sistema):
- Consulta: `src/lib/diretoria/queries/entregas-parciais.ts` (extratores `extrairRentabilidade`,
  `extrairRentabilidadeItem`, `extrairDesconto`, `extrairFormaPagamento`, `extrairCondicaoPagamento`).
- Catálogo/colunas/UI: `src/components/tabela-avancada/entregas-catalogo.tsx`.
- Montagem por pedido: `src/components/diretoria/blocos/blocos-pedidos.tsx`.
- Tabela genérica (rodapé, ordenação, seletor de colunas): `src/components/tabela-avancada/{tabela-avancada,ui,tipos}.tsx`.
- Corte de leitura (filtro global de data): `src/lib/corte-dados.ts`.

---

## 2. Mapa campo-a-campo (Odoo -> nosso cache -> UI)

### 2.1 Cabeçalho do pedido , tudo em `raw_pedido_documento.data` (jsonb)

Modelo Odoo: `pedido.documento`. No nosso banco: tabela `raw_pedido_documento` (upsert,
PK `odoo_id`) + materialização parcial em `fato_pedido`.

| Coluna UI (B-09)      | Chave jsonb `raw_pedido_documento.data` | Observação |
|-----------------------|------------------------------------------|-----------|
| Valor Produto / Subtotal Pedido | `vr_produtos` | "Subtotal" do cabeçalho Odoo (bruto, Σ da coluna Produto) |
| Valor Pedido          | `vr_operacao_tributacao` | "Total geral" do Odoo (líquido de desconto) |
| Desconto (R$ / %)     | `vr_desconto` / `al_desconto` | |
| Custo (comercial)     | `vr_custo_comercial` | |
| % Comissão / Comissão | `al_comissao` / `vr_comissao` | |
| Margem                | `al_margem` | **PRONTA do Odoo. Margem = `vr_liquido`/`vr_operacao_tributacao`. NUNCA recalcular (Lucro Real).** |
| Lucro Líquido         | `vr_liquido` | |
| ICMS / DIFAL / FCP    | `vr_icms_proprio` / `vr_difal` / `vr_fcp` | |
| PIS / COFINS          | `vr_pis_proprio` / `vr_cofins_proprio` | |
| IRPJ / CSLL           | `vr_irpj` / `vr_csll` | |
| CBS / IBS             | `vr_cbs` / `vr_ibs` | reforma tributária; também `vr_ibs_estadual`/`vr_ibs_municipal`/`*_diferido` |
| Forma de pagamento    | `forma_pagamento_id` (m2o `[id,nome]`) | |
| Condição de pagamento | `condicao_pagamento_id` (m2o `[id,nome]`) | |
| Cliente (CNPJ/CPF)    | `participante_id` (m2o) | nome fiel com acento (comprovado); `nomeLimpo` só tira CNPJ e apara pontas |
| Entrega (prevista)    | materializado em `fato_pedido.data_prevista` | data de entrega prevista |
| Orçamento / Validade  | `fato_pedido.data_orcamento` / `data_validade` | |
| Emitente / Vendedor   | `fato_pedido.empresa_nome` / `vendedor_nome` | |
| Observações           | `obs` / `obs_produtos` | |

### 2.2 Itens do pedido , `raw_sped_documento_item.data` (jsonb)

Modelo Odoo: `sped.documento.item`. Tabela `raw_sped_documento_item` (upsert, PK `odoo_id`)
+ `fato_pedido_item` (join 1:1 por `odoo_id`, provado 18895/18895).

| Dado por item (dropdown/detalhe) | Chave jsonb `raw_sped_documento_item.data` |
|----------------------------------|--------------------------------------------|
| Comissão % / R$                  | `al_comissao` / `vr_comissao` |
| Margem % / Líquido               | `al_margem` / `vr_liquido` (nem sempre calculado por item; ~52% vem 0 -> UI mostra "-") |
| Desconto R$ / %                  | `vr_desconto` / `al_desconto` |
| Valor Produto (item, bruto)      | `vr_produtos` |
| Quantidades                      | `fato_pedido_item.quantidade` / `quantidade_atendida` / `quantidade_a_atender` |
| Saldo a atender                  | calculado por `aAtenderDoItem` (`src/lib/diretoria/atendimento-item.ts`) |

### 2.3 Domínios auxiliares
- Etapa (nome + cor): `fato_pedido.etapa_nome` + `raw_pedido_etapa.data.cor`.
- Financeiro (liberado/bloqueado): derivado de `fato_financeiro_titulo` (a_receber vencido em aberto).
- Parceiro (UF/cidade/CNPJ/CEP): `fato_parceiro`.
- Produto (custo/código): `fato_produto`.

---

## 3. O que JÁ tem histórico (inventário , confirmado no banco 2026-07-22)

| Tabela (`@@map`)                     | Tipo | Linhas | Última | Builder |
|--------------------------------------|------|--------|--------|---------|
| `fato_estoque_saldo_historico`       | append-por-mudança | 4.989 | 2026-07-21 | `src/worker/fatos/captura-saldo.ts` |
| `fato_estoque_saldo_snapshot`        | snapshot diário (`data_ref`) | 42.111 | 2026-07-21 | idem / `snapshot.ts` |
| `fato_preco_historico`               | append-por-mudança | 12.008 | 2026-07-20 | `src/worker/fatos/captura-preco.ts` |
| `fato_pedido_historico`              | etapa/tempo em etapa (do Odoo) | 15.856 | 2026-07-22 | (importado do Odoo) |
| `raw_pedido_documento_historico(_tempo)` | espelho raw (PK odoo_id) | 16.120 | 2026-07-22 | sync , **esclarecer propósito** |

Tools MCP existentes (`src/lib/reports/queries/`): há `pedido-historico.ts` (usa
`fato_pedido_historico` , etapa/aging). **NÃO há** (aparentemente) tool que exponha
`fato_estoque_saldo_historico` / `fato_preco_historico` , confirmar no arranque.

### 3.1 O padrão reutilizável (append-por-mudança) , é isto que vamos copiar
Fonte de verdade: `captura-saldo.ts` / `captura-preco.ts`. Regras:
- Uma linha nova SÓ quando um valor-chave muda (não a cada sync).
- Flag `vigente` (bool) marca a última linha de cada chave; índice ÚNICO PARCIAL
  `... WHERE vigente` (existe só na migration SQL cru, o Prisma 7 não modela , **NÃO
  remover em `migrate dev`**).
- `rodada_id` (uuid da captura) + `capturado_em` (timestamp).
- `evento`: `'alteracao'` normal; `'baixa'` com valores NULL quando a chave some do fato.
- Leitura O(chaves) da captura via o índice parcial.

---

## 4. Análise de gap (crítica)

1. **Valores financeiros do pedido não são historizados.** Este é o gap central. Impede
   qualquer pergunta "como evoluiu a margem/desconto/saldo/imposto do pedido (ou da
   carteira) ao longo do tempo".
2. **Histórico existente possivelmente subaproveitado.** Estoque/preço têm série temporal
   gravada mas talvez sem tool no Nex. Valor parado.
3. **`raw_pedido_documento_historico` é ambíguo** (16.120 linhas, PK odoo_id = snapshot,
   não série). Antes de construir, entender por que existe (provável insumo do builder de
   etapa) para não duplicar/conflitar.
4. **Risco de over-engineering.** Historizar tudo é caro em escrita e ruído. Escolher
   poucas métricas que mudam e importam.

---

## 5. Plano em fases

### Fase A , Expor o histórico que JÁ existe (rápido, alto ROI, zero ingestão)
- A1. Auditar `pedido-historico.ts` (o que já entrega) e cobrir lacunas de aging de etapa.
- A2. Tool nova: **evolução de estoque/saldo** sobre `fato_estoque_saldo_historico`
  (série por produto/local/data) + **evolução de preço** sobre `fato_preco_historico`.
- A3. Registrar no catálogo de tools (RBAC 7 camadas) + testes contra dado real.
- Entregável: 2-3 tools temporais sem tocar ingestão.

### Fase B , Historizar os VALORES do pedido (reuso do padrão)
- B1. Nova tabela `fato_pedido_valor_historico` (append-por-mudança), espelhando o padrão
  de `captura-saldo.ts`. Colunas de valor selecionadas (ver 6).
- B2. Novo builder `src/worker/fatos/captura-pedido-valor.ts`: lê o fato/raw atual, compara
  com a linha `vigente`, grava só o que mudou; `evento='baixa'` quando o pedido sai do escopo.
- B3. Migration + índice ÚNICO PARCIAL `... WHERE vigente` (SQL cru na migration).
- B4. Agendar no worker (junto do ciclo de fatos). Respeitar o corte técnico de ingestão
  (`src/worker/sync/corte.ts`), NUNCA o corte de leitura de tela.
- B5. Rebuild do worker via `docker compose build app` (o worker NÃO tem build próprio).

### Fase C , Tools temporais do pedido no Nex + consolidação
- Tools que consultam `fato_pedido_valor_historico` (ver 7).
- Documentar em `docs/kpis-diretoria.md` a fonte de cada métrica histórica.

---

## 6. Especificação `fato_pedido_valor_historico` (proposta)

Chave de série: `pedido_id` (odoo do `pedido.documento`). Colunas de valor (as que mudam
e importam , NÃO tudo): `etapa_id/etapa_nome`, `vr_produtos` (valor produto),
`vr_operacao_tributacao` (valor pedido), `vr_desconto`, `vr_custo_comercial`,
`vr_comissao`, `al_margem`, `vr_liquido`, impostos (`icms/difal/fcp/pis/cofins/irpj/csll/
cbs/ibs`), `saldo_a_atender` (custo e venda), `data_prevista`. Metadados do padrão:
`rodada_id uuid`, `capturado_em timestamptz`, `evento text`, `vigente bool`.
Índices: `(pedido_id, capturado_em)`, `(capturado_em)`, `(rodada_id)` + ÚNICO PARCIAL
`WHERE vigente` por `pedido_id`.

Decisão aberta: granularidade da "mudança" (qualquer campo? ou só um conjunto núcleo?).
Recomendo núcleo: etapa, saldo a atender, margem, desconto, total dos impostos , o resto
snapshotado junto quando um núcleo muda (barato e evita ruído).

---

## 7. Tools novas do Agente Nex (esboço)

Todas via catálogo MCP semântico (TS validado/testado), RBAC 7 camadas, retorno com
`atualizado há Xs`. Domínio: comercial/diretoria.

1. `evolucao_pedido` , "como o pedido X mudou ao longo do tempo?" (série de etapa, saldo,
   margem, desconto, impostos). Fonte: `fato_pedido_valor_historico`.
2. `aging_etapa_pedido` , "quanto tempo o pedido ficou em cada etapa / quais estão parados
   há mais tempo?". Fonte: `fato_pedido_historico` (já existe , empacotar/expandir).
3. `evolucao_carteira` , "evolução do saldo a entregar / carteira a faturar por mês".
   Fonte: agregação de `fato_pedido_valor_historico`.
4. `rampa_cbs_ibs` , "evolução de CBS/IBS mês a mês" (transição da reforma). Fonte: idem.
5. `evolucao_estoque` / `evolucao_preco` , séries de saldo e preço (Fase A, dado já existe).

Para cada tool no plano de execução: nome, pergunta-alvo, SQL/consulta Prisma,
parâmetros, RBAC, teste E2E contra dado real, e entrada em `docs/kpis-diretoria.md`.

---

## 8. Riscos e "não fazer"
- NÃO amarrar a captura ao corte de LEITURA de tela (quebraria a série). Usar corte
  técnico de ingestão fixo.
- NÃO remover os índices únicos parciais `WHERE vigente` em `migrate dev` de outra worktree.
- NÃO historizar todas as ~35 colunas por pedido , escolher o núcleo.
- Custo de escrita: append-por-mudança é barato, mas medir volume real antes de agendar
  com frequência alta.
- Confirmar propósito de `raw_pedido_documento_historico(_tempo)` antes de criar algo que
  se sobreponha.

---

## 9. Checklist de arranque (próxima sessão)
1. Ler `pedido-historico.ts` + `captura-saldo.ts`/`captura-preco.ts` (o padrão).
2. Confirmar se estoque/preço histórico já têm tool; se não, Fase A primeiro.
3. Esclarecer `raw_pedido_documento_historico(_tempo)`.
4. Spec -> plano (2 reviews cada) -> migration `fato_pedido_valor_historico` -> builder
   `captura-pedido-valor.ts` (TDD) -> agendar -> rebuild `docker compose build app`.
5. Tools novas com teste E2E contra cache real. Atualizar `docs/kpis-diretoria.md`.
