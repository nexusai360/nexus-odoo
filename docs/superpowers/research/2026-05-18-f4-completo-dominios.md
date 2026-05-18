# F4 completo — pesquisa dos domínios Comercial, Fiscal e Cadastros

> Pesquisa de 2026-05-18 para fundamentar a SPEC do "F4 completo" (MCP semântico
> cobrindo todos os domínios). Branch `feat/mcp-dominios-completos`.
> Ancorada em **dado real** do cache Postgres (`raw_*`) e nos JSONs de
> `discovery/output/modelos/`. Segue o padrão de fato/tool da F4 onda 1
> (`docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md`).

## Método e avisos transversais

- Todas as contagens abaixo vêm de `SELECT` direto nas tabelas `raw_*` do
  container `db` (`nexus_odoo`), filtrando `raw_deleted = false` salvo nota.
- Os modelos Odoo têm centenas/milhar de campos (`pedido.documento` = **1094
  campos**). A pesquisa filtrou pelos campos **efetivamente preenchidos** no
  cache, não pela lista de discovery — a maioria dos campos é metadado morto.
- Padrões herdados da onda 1, **obrigatórios** nos novos fatos:
  - Builders filtram `rawDeleted = false`.
  - Dinheiro como `Decimal` no Prisma; no builder, `Number(raw.x ?? 0)`.
  - Datas `date` do Odoo viram `new Date(\`${s}T00:00:00\`)` (fuso local GMT-3,
    evita desvio UTC) — ver `fato-financeiro-titulo.ts`.
  - Campos `selection` viram **`String`** no fato (nunca enum Prisma) — a
    customização SPED da Tauga pode introduzir valores novos.
  - Relações m2o via `relId`/`relNome` de `src/worker/fatos/odoo-relational.ts`.
  - "Dias de atraso" **não** é materializado — calculado na query da tool.
  - Builder registrado em `src/worker/fatos/registry.ts`; modo `incremental` ou
    `snapshot` conforme `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`).

---

## 1. Domínio Comercial / Pedidos

### 1.1 Realidade do dado

`raw_pedido_documento` tem **71 registros** — volume baixíssimo. O dado
desmente parte do mapa de domínios:

- **Não existe pedido de compra.** A distribuição de `tipo`:
  `venda` = 69, `inventario` = 1, `transferencia_solicitacao` = 1.
  O campo `tipo` é `selection` **sem `selection` declarado no discovery**
  (`"relacao": null, "selection"` ausente) — os valores só se conhecem pelo
  dado real. Pedido de compra, contrato, orçamento autônomo: **não há um único
  registro**. "Contrato" no Odoo da Matrix é um `tipo`/campo do próprio
  `pedido.documento` (campos `contrato_id`, `contrato_iniciado`,
  `contrato_finalizado`), mas nenhum pedido em cache é contrato.
- **Não há campo de valor total do pedido preenchido.** `vr_total` e
  `vr_documento` estão **zerados em todos os 71**. Os campos com valor são
  `vr_produtos` (69 não-zero) e `vr_nf` (69 não-zero) — o valor de produtos e o
  valor que vai pra nota. Os transfer/inventário ficam zerados (esperado).
- **Não há campo `state`/`situacao` de máquina de estado.** O status do pedido
  é a **etapa** (`etapa_id`, m2o → `pedido.etapa`). Distribuição real das
  etapas: `Emite NF Consumidor Final` 28, `GERA BOLETO` 20, `Input financeiro`
  8, `Aprovado` 4, `Novo Fracionamento` 3, `VF - Emite NF` 2, `Fracionar` 2,
  `VF - SEGUIR COM RESERVA...` 2, `Em separação` 1, `Em conferência` 1. São
  etapas de **workflow operacional configurável** (a `pedido.etapa` tem flags
  `aprova_*`, `inicia_*`, `finaliza_*`, `pausa_pedido`), não um enum fixo.
- Datas preenchidas, por cobertura: `data_orcamento` 71/71,
  `data_aprovacao` 67, `data_contabil` 48, `data_financeiro` 48,
  `data_validade` 33, `data_prevista` 30, `data_estoque_iniciado`/`_finalizado`
  27. **`data_orcamento` é a data-âncora** do pedido (cobertura total).
  Janela real: 2025-01-23 a 2026-05-15.
- m2o úteis e populados: `participante_id` (cliente), `vendedor_id`,
  `operacao_id` (m2o → `pedido.operacao`, ex.: "Venda JDS Matriz
  (transferência [saída])"), `empresa_id` (m2o → `sped.empresa`).

### 1.2 Parcelas e etapas

- `raw_pedido_parcela` = **1925 registros**. Grão = parcela de pagamento de um
  pedido. Campos: `pedido_id` (m2o), `participante_id`, `numero`,
  `data_vencimento`, `valor`/`valor_readonly` (monetary), `vr_documento`,
  `vr_juros`, `vr_multa`, `vr_desconto`, `forma_pagamento_id`,
  `condicao_pagamento_id`, `parcela_faturada`/`produto_faturado`/
  `servico_faturado` (boolean), `finan_lancamento_id` (liga a parcela ao título
  financeiro). É a base para "parcelas a vencer de um pedido".
- `raw_pedido_etapa` = **203 registros** — é a **definição** das etapas de
  workflow, não movimento. Vira tabela de apoio/lookup, não fato.
- `raw_pedido_documento_historico` = 8054 — log de transição de etapa por
  pedido. Fora do escopo de tool de gestor nesta onda (é trilha de auditoria).

### 1.3 Como detectar "pedido em atraso"

Não há campo de atraso. Heurística possível com o dado existente: pedido
**não concluído** (etapa não-final — `pedido.etapa.finaliza_pedido_confirmando
= false`) cuja `data_prevista` ou `data_validade` já passou. `data_prevista`
só cobre 30/71, então a tool de atraso é **parcial e honesta** sobre cobertura.
Alternativa mais confiável: atraso de **parcela** (`pedido.parcela`) —
`data_vencimento < hoje` e `parcela_faturada = false`. Recomendado priorizar
atraso pela parcela.

### 1.4 Fatos propostos — Comercial (2 fatos)

**`FatoPedido`** — grão: 1 linha por pedido. PK `odooId`. Fonte
`raw_pedido_documento` (incremental). Rebuild full.
Colunas: `odooId`, `numero` (String), `tipo` (String), `etapaId`, `etapaNome`,
`etapaFinaliza` (Boolean — derivado do lookup de `pedido.etapa`, marca pedido
concluído), `operacaoId`, `operacaoNome`, `participanteId`, `participanteNome`,
`vendedorId`, `vendedorNome`, `empresaId`, `empresaNome`, `dataOrcamento`
(Date), `dataAprovacao`, `dataValidade`, `dataPrevista`, `vrProdutos`
(Decimal), `vrNf` (Decimal), `atualizadoEm`.
> O builder precisa de um `Map` de `pedido.etapa.id → finaliza_pedido_confirmando`
> para preencher `etapaFinaliza`. `raw_pedido_etapa` é a fonte do lookup.

**`FatoPedidoParcela`** — grão: 1 linha por parcela. PK `odooId`. Fonte
`raw_pedido_parcela` (incremental). Rebuild full.
Colunas: `odooId`, `pedidoId`, `numero` (String), `participanteId`,
`participanteNome`, `dataVencimento` (Date), `valor` (Decimal), `vrJuros`,
`vrMulta`, `vrDesconto`, `vrDocumento`, `formaPagamentoNome` (String),
`parcelaFaturada` (Boolean), `finanLancamentoId`, `atualizadoEm`.

### 1.5 Catálogo de tools — Comercial (5 tools)

| id | pergunta-alvo | fato |
|---|---|---|
| `comercial_pedidos_periodo` | "Quantos pedidos e qual valor no período?" | `FatoPedido` |
| `comercial_pedidos_por_etapa` | "Como estão os pedidos por etapa do funil?" | `FatoPedido` |
| `comercial_pedidos_por_vendedor` | "Quanto cada vendedor vendeu?" | `FatoPedido` |
| `comercial_pedidos_atrasados` | "Quais pedidos estão atrasados / parados?" | `FatoPedido` + `FatoPedidoParcela` |
| `comercial_parcelas_a_vencer` | "Quais parcelas de pedido vencem em breve?" | `FatoPedidoParcela` |

> Toda tool de comercial deve declarar na resposta que o universo é pequeno
> (71 pedidos) e que **não há pedidos de compra** — a empresa registra compras
> no fiscal (`sped.documento` de entrada), não em `pedido.documento`.

---

## 2. Domínio Fiscal / SPED

### 2.1 Realidade do dado — o domínio mais rico

`raw_sped_documento` = **3743 notas fiscais** (todas com `modelo`,
`entrada_saida`, `situacao_nfe`, `data_emissao` preenchidos — cobertura total).
Este é o domínio com dado de verdade para faturamento.

- **Entrada vs saída — campo `entrada_saida`** (`selection`, valores reais
  `"0"` e `"1"`): `"1"` = **saída** (3020 notas), `"0"` = **entrada** (723).
  Cruzando com `vr_nf`: saídas modelo 55 = R$ 71,05 mi; entradas modelo 55 =
  R$ 29,18 mi. **Saída = faturamento/emissão; entrada = compra/recebimento.**
- **`modelo`** (`selection`): `55` (NF-e) = 3715, `57` (CT-e) = 22, `03` = 5,
  `23` = 1. Praticamente tudo é NF-e modelo 55.
- **`situacao_nfe`** (`selection`, valores reais): `autorizada` 3445,
  `em_digitacao` 286, `cancelada` 6, `rejeitada` 2, `inutilizada` 2,
  `denegada` 2. **`autorizada` é o filtro de nota válida.**
- **`finalidade_nfe`** (`selection`): `1` (normal) = 3707, `4`
  (devolução) = 36.
- **`situacao_fiscal`** existe (valor ex.: `"00"`) — código fiscal SEFAZ, menos
  útil que `situacao_nfe` para gestor.
- Valores: `vr_nf` e `vr_fatura` preenchidos em 3581; `vr_produtos` 3580.
  **`vr_nf` é o valor total da nota.** Impostos discriminados na nota são
  esparsos: `vr_icms_proprio` só 170 notas, `vr_iss` 5, `vr_ipi` 3,
  `vr_ibpt` 1948 (valor aproximado de tributos — IBPT). **Não há um campo
  `vr_total_tributos` confiável** no cabeçalho da nota; imposto detalhado vive
  no item (`vr_icms_proprio`/`vr_pis_proprio`/`vr_cofins_proprio` do
  `sped.documento.item`, ~107k-116k itens). Conclusão: a tool de impostos
  responde com o que há (`vr_ibpt` agregado da nota, com aviso de que é
  estimativa IBPT) — imposto exato exigiria somar itens.
- Datas: `data_emissao` 3743/3743 (âncora; janela 2013-07-26 a 2026-05-15, 154
  meses), `data_entrada_saida` 3743, `data_autorizacao` 3448.
- m2o: `participante_id` 3742 (cliente na saída / fornecedor na entrada),
  `natureza_operacao_id` 3273 (ex.: "VENDA DE MERCADORIA...", "PRESTACAO DE
  SERVICOS"), `operacao_id` 2241, `empresa_id` 3743.
- `chave` (chave de acesso de 44 dígitos) preenchida em 3579.

### 2.2 Itens e pagamentos

- `raw_sped_documento_item` = **211.385 registros**. Grão = item de nota.
  Campos densos: `documento_id` (m2o → nota, 211k), `produto_id` (200k),
  `quantidade` (207k), `vr_unitario` (210k), `vr_produtos` (207k), `vr_nf`
  (207k), `cfop_id` (167k), `vr_icms_proprio`/`vr_pis_proprio`/
  `vr_cofins_proprio` (~107-116k). É a base para "produtos mais vendidos por
  nota" e para imposto detalhado.
- `raw_sped_documento_pagamento` = **36.141 registros**. Grão = forma de
  recebimento/pagamento de uma nota. Campos úteis e populados: `documento_id`
  (36k), `valor` (28.494 não-zero). `forma_pagamento_id` quase vazio (só 19).
  Utilidade baixa para tool de gestor nesta onda — **não vira fato agora**.
- `raw_sped_participante` = **6516 registros** — cadastro fiscal de
  participantes (paralelo a `res.partner`). Ver §3 (decisão de não duplicar).

### 2.3 Fatos propostos — Fiscal (2 fatos)

**`FatoNotaFiscal`** — grão: 1 linha por nota fiscal. PK `odooId`. Fonte
`raw_sped_documento` (incremental). Rebuild full. **Volume 3743 — rebuild full
ok**; gatilho de revisão se passar de ~50k.
Colunas: `odooId`, `numero` (String), `serie` (String), `modelo` (String),
`entradaSaida` (String — `"0"`/`"1"`), `tipoMovimento` (String — derivado:
`saida` quando `entrada_saida="1"`, `entrada` quando `"0"` — coluna de
conveniência para queries legíveis), `situacaoNfe` (String), `finalidadeNfe`
(String), `chave` (String), `participanteId`, `participanteNome`,
`naturezaOperacaoId`, `naturezaOperacaoNome`, `empresaId`, `empresaNome`,
`dataEmissao` (Date), `dataEntradaSaida` (Date), `dataAutorizacao` (Date),
`vrNf` (Decimal), `vrProdutos` (Decimal), `vrFatura` (Decimal),
`vrIbpt` (Decimal — tributos aproximados IBPT), `vrIcmsProprio` (Decimal),
`vrDesconto` (Decimal), `atualizadoEm`.
Índices: PK `odooId`; índices em `dataEmissao`, `entradaSaida`, `situacaoNfe`.

**`FatoNotaFiscalItem`** — grão: 1 linha por item de nota. PK `odooId`. Fonte
`raw_sped_documento_item` (incremental). Rebuild full. **Volume 211k —
ATENÇÃO**: já passa do gatilho de ~50k da onda 1. A spec deve decidir entre
(a) rebuild full assumido (211k linhas, `createMany` em lote) ou (b) build
incremental por `odooId`. Recomendação: rebuild full ainda é viável a 211k mas
a spec deve cravar e medir; é o único fato grande dos 3 domínios.
Colunas: `odooId`, `documentoId` (FK lógica → `FatoNotaFiscal.odooId`),
`produtoId`, `produtoNome`, `cfopId`, `cfopNome`, `quantidade` (Decimal),
`vrUnitario` (Decimal), `vrProdutos` (Decimal), `vrNf` (Decimal),
`vrIcmsProprio` (Decimal), `vrPisProprio` (Decimal), `vrCofinsProprio`
(Decimal), `atualizadoEm`.
Índices: PK `odooId`; índices em `documentoId`, `produtoId`.

### 2.4 Catálogo de tools — Fiscal (6 tools)

| id | pergunta-alvo | fato |
|---|---|---|
| `fiscal_faturamento_periodo` | "Quanto foi faturado (notas de saída) no período?" | `FatoNotaFiscal` |
| `fiscal_notas_emitidas` | "Quais notas emiti? Status SEFAZ?" | `FatoNotaFiscal` |
| `fiscal_notas_recebidas` | "Quais notas de entrada (compras) recebi?" | `FatoNotaFiscal` |
| `fiscal_impostos_periodo` | "Quanto de imposto/tributos nas notas do período?" | `FatoNotaFiscal` |
| `fiscal_faturamento_por_cliente` | "Quais clientes mais faturaram?" | `FatoNotaFiscal` |
| `fiscal_produtos_faturados` | "Quais produtos mais saíram em nota?" | `FatoNotaFiscalItem` |

> `fiscal_faturamento_periodo` filtra `entradaSaida="1"` e
> `situacaoNfe="autorizada"` (exclui digitação/cancelada). A tool de impostos
> deve avisar que o número de tributos é a **estimativa IBPT** do cabeçalho —
> imposto exato item-a-item é refinamento futuro.

---

## 3. Domínio Cadastros / res

### 3.1 Realidade do dado

`raw_res_partner` = **6545 registros**. Campos preenchidos relevantes:

- `name` 6545, `complete_name` 6545, `active` 6545 (todos true no cache).
- **`customer` e `supplier` são booleanos** (OCA Brasil — **não** o padrão
  Odoo `customer_rank`/`supplier_rank`, que estão **zerados** em todos). Cruzamento
  real: `customer=true,supplier=false` 5587; `customer=true,supplier=true` 722;
  `customer=false,supplier=false` 206; `customer=false,supplier=true` 30.
  Ou seja: **6309 clientes, 752 fornecedores** (com 722 que são ambos).
- Endereço: `street` 6086, `city` 6086, `state_id` 6086 (m2o → estado),
  `zip` 6031, `country_id` 6396. Top UF: DF 2347, GO 619, BA 534, MG 514,
  SP 402, CE 333, SE 276.
- `vat` 6084 — é o **CNPJ/CPF** (campo fiscal OCA). `email` 2844, `phone` 2177.
- `is_company` true em 4383 (PJ) — os demais, pessoa física.
- **`company_type` está vazio em todos os 6545** — não usar; usar `is_company`.

`raw_res_company` = poucas (~20 entidades legais do grupo). `raw_res_users` —
usuários internos do Odoo, não é dado de gestor.

### 3.2 Fato proposto — Cadastros (1 fato)

**`FatoParceiro`** — grão: 1 linha por parceiro. PK `odooId`. Fonte
`raw_res_partner` (incremental). Rebuild full. Volume 6545 — ok.
Colunas: `odooId`, `nome` (String — `name`), `nomeCompleto` (String —
`complete_name`), `documento` (String — `vat`, CNPJ/CPF), `ehCliente`
(Boolean — `customer`), `ehFornecedor` (Boolean — `supplier`), `ehEmpresa`
(Boolean — `is_company`), `cidade` (String — `city`), `uf` (String — `relNome`
de `state_id`), `pais` (String — `relNome` de `country_id`), `cep` (String —
`zip`), `email` (String), `telefone` (String — `phone`), `ativo` (Boolean —
`active`), `atualizadoEm`.
Índices: PK `odooId`; índices em `uf`, `ehCliente`, `ehFornecedor`.

> **Decisão para a spec:** existem dois cadastros — `res.partner` (6545) e
> `sped.participante` (6516). Os pedidos e notas referenciam
> `sped.participante`. A recomendação é o `FatoParceiro` cobrir `res.partner`
> (o cadastro canônico de cliente/fornecedor) e a spec decidir se vale um
> segundo fato `FatoParticipanteFiscal` ou se os m2o `participanteNome` já
> embutidos em `FatoPedido`/`FatoNotaFiscal` bastam. Recomendação: não duplicar
> — usar o nome desnormalizado nos fatos transacionais e `FatoParceiro` só para
> as tools de consulta de cadastro.

### 3.3 Catálogo de tools — Cadastros (3 tools)

| id | pergunta-alvo | fato |
|---|---|---|
| `cadastro_buscar_parceiro` | "Buscar cliente/fornecedor por nome ou CNPJ" | `FatoParceiro` |
| `cadastro_parceiros_por_uf` | "Quantos clientes tenho por estado?" | `FatoParceiro` |
| `cadastro_contar_parceiros` | "Quantos clientes e fornecedores tenho?" | `FatoParceiro` |

> `cadastro_buscar_parceiro` faz `ILIKE` em `nome`/`nomeCompleto`/`documento`.
> RBAC: cadastro é leitura de baixa sensibilidade, mas a spec deve decidir se o
> domínio `cadastros` entra no enum `ReportDomain` ou se essas tools ficam sob
> um domínio existente (ex.: `comercial`).

---

## 4. Notas para a SPEC

- **Enum `ReportDomain`:** a F4 onda 1 reusa o enum dos relatórios. Os novos
  domínios precisam de valores: `comercial`, `fiscal`, `cadastros` (ou decidir
  agrupar). Migration Prisma de enum.
- **Ingestão (F2):** todos os modelos-fonte propostos (`pedido.documento`,
  `pedido.parcela`, `pedido.etapa`, `sped.documento`, `sped.documento.item`,
  `res.partner`) **já estão no `MODEL_CATALOG`** e no cache — **não é preciso
  estender a ingestão**. O mapa de domínios supunha que faltariam; o dado
  mostra que já estão sincronizados.
- **`FatoNotaFiscalItem` (211k linhas)** é o único fato que estoura o gatilho
  de revisão de ~50k da onda 1 — a spec precisa decidir rebuild full vs.
  incremental e medir o tempo de build.
- **Lacunas honestas a declarar nas tools:** não há pedido de compra em
  `pedido.documento` (compras são notas de entrada no fiscal); não há valor
  total de tributos confiável no cabeçalho da nota (só IBPT estimado);
  `data_prevista` de pedido cobre só 30/71 — tool de atraso de pedido é parcial.
