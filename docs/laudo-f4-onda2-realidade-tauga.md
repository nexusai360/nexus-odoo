# Laudo definitivo: F4 Onda 2 (escrita) versus a realidade do Odoo da Tauga

> Data: 2026-05-23. Versão definitiva. Substitui qualquer recomendação anterior
> minha sobre o escopo da Onda 2. Investigação feita ponta a ponta contra
> **produção** (`grupojht.tauga.online` / `grupojht`) e **base de teste**
> (`grupojht.teste.tauga.online` / `teste_grupojht`), comparando com o que o
> nosso código assume hoje.

---

## 1. Resumo executivo (1 página)

1. **Canal de escrita funciona.** A base de teste autentica via JSON-RPC e o
   handler `crm.res_partner.create` cria, lê snapshot e desfaz `res.partner`
   end-to-end (validado em `scripts/e2e/test-write-partner.ts`,
   uid=11, id=16426). Não há mais bloqueio técnico de conexão.
2. **A spec original da Onda 2 partiu de premissa errada.** O documento
   `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` desenhou
   ondas em cima de **modelos padrão do Odoo** (`crm.lead`, `crm.team`,
   `sale.order`, `purchase.order`, `stock.picking`, `account.move`,
   `l10n_br_fiscal.document`, `account.payment`). **Nenhum desses modelos
   existe no Odoo da Tauga, nem em produção.**
3. **O Odoo da Tauga não é Odoo padrão.** Tem apenas **14 módulos instalados**
   (`base`, `mail`, `web`, `bus`, `barcodes`, `web_editor`, `base_import`,
   `base_sparse_field`, `google_gmail`, `ks_dashboard_ninja`, `ks_dn_advance`,
   `tauga`, `tauga_auditoria`, `grupojht`). Todo o ERP de negócio
   (vendas/compras/estoque/financeiro/fiscal/contábil/produção/RH) é
   **customizado pela Tauga**, vivendo nos prefixos `sped.*` (254 modelos),
   `finan.*` (44), `contabil.*` (29), `pedido.*` (26), `estoque.*` (16),
   `rh.*` (19), e mais.
4. **O coração da operação é `pedido.documento`.** Toda transação de negócio
   (venda, compra, romaneio, transferência, inventário, produção, prospecto,
   etc.) é uma linha de `pedido.documento` (1553 registros em prod),
   classificada por `tipo` (16 tipos distintos) e por `operacao_id`
   (`pedido.operacao`, 119 templates configurados em prod). Os documentos
   percorrem `etapa_id` (`pedido.etapa`) como workflow.
5. **`tauga_api_post` não é um método de modelo Odoo.** Sondei via JSON-RPC
   nos modelos candidatos: `AttributeError` igual ao de método inexistente.
   `pedido.operacao.url_api` + os campos `codigo_depois_post_api` /
   `codigo_depois_put_api` / `codigo_trata_dados_api` sugerem que a Tauga tem
   um **controller HTTP customizado** (POST com `dados_api` para
   `<host>/...?url_api=<slug>`) que roteia para um pedaço de código por
   operação. O endpoint exato e o contrato do payload **precisam vir da
   Tauga** (o script `teste_integracao_odoorpc_grupojht.py` referenciado em
   `docs/tauga-base-teste-bloqueio.md` não está no repositório). Sem isso,
   não dá para criar `pedido.documento` via API "do jeito Tauga".
6. **A leitura está bem servida.** Temos **50 read tools** em
   `mcp/tools/{cadastros,comercial,contabil,crm,estoque,financeiro,fiscal,
   caminho3,dominios-vazios}`, **19 tabelas `fato_*`** consolidadas e dezenas
   de `raw_*` no cache. Nada disso muda. O problema é só na escrita.
7. **Recomendação de Onda 1 redefinida e única.** Implementar `res.partner`
   completo (update, delete e "transition" via `active`/`customer_rank`/
   `supplier_rank`). É a única família que (a) existe na base de teste hoje,
   (b) é Odoo padrão (sem dependência da Tauga), (c) tem valor real (o agente
   Nex já lista, busca e descreve parceiros, e o cliente vai querer criar e
   atualizar pelo WhatsApp).
8. **Antes da Onda 2 e seguintes, há um bloqueio externo declarado.**
   Precisamos da Tauga responder 3 perguntas técnicas objetivas (§7 deste
   laudo). Sem essas respostas, qualquer escrita em documentos de negócio
   (venda, compra, romaneio, prospecto, inventário, produção) é especulação.

---

## 2. Metodologia

Sondas executadas (todas reproduzíveis com as credenciais em `.env.local`):

- `common.version` / `common.authenticate` em PROD e TESTE.
- `ir.module.module` filtrando por `state="installed"`.
- `ir.model.search_read` enumerando os 650 modelos disponíveis e agrupando
  por prefixo (`pedido.*`, `sped.*`, `finan.*`, etc.).
- `<model>.search_count` em 12 modelos padrão do Odoo (`crm.lead`,
  `crm.team`, `crm.stage`, `crm.tag`, `crm.lost.reason`, `sale.order`,
  `purchase.order`, `stock.picking`, `stock.quant`, `account.move`,
  `product.product`, `account.payment`).
- `pedido.documento.search_read` (últimos 5 documentos) e `read_group` por
  `operacao_id` (top 30 templates).
- `pedido.operacao.fields_get` (todos os campos relevantes) e `read` da
  operação 202 (`prospecto_teste`).
- `pedido.operacao.tauga_api_post` via `execute_kw` em 5 modelos, com
  diferentes formatos de args/kwargs. Comparado com chamada a método
  inexistente para confirmar que a mensagem de erro é idêntica.
- `HTTP POST/GET` em 6 rotas candidatas do tipo `/tauga/api/...`,
  `/api/tauga/...`, `/api/webhook/...`, `/api/post/prospecto_teste`.
- Inventário do nosso código: `prisma/schema.prisma` (163 models, 133 são
  `raw_*` ou `fato_*`), `mcp/tools/**` (50 read tools + 1 write tool),
  `discovery/output/modelos/` (79 schemas dumpados).
- Verificação prática do canal de escrita: `scripts/e2e/test-write-partner.ts`
  contra `teste_grupojht`. Auth + create + read + cleanup, todos verdes.

---

## 3. A realidade do Odoo da Tauga

### 3.1. Módulos instalados (PROD e TESTE, idênticos)

```
barcodes, base, base_import, base_sparse_field, bus, google_gmail,
grupojht, ks_dashboard_ninja, ks_dn_advance, mail, tauga,
tauga_auditoria, web, web_editor
```

`base` e `mail` trazem `res.partner`, `res.users`, `res.company`,
`res.partner.bank`, etc. Tudo o mais que existe no ERP é responsabilidade
dos módulos custom `tauga` / `tauga_auditoria` / `grupojht` (que adicionam
650 modelos no total).

### 3.2. Prefixos de modelo com mais entidades

| Prefixo | Modelos | Indica |
|---|---|---|
| `sped` | 254 | Tudo fiscal (NF-e, NFS-e, apuração, SPED, participante, operacao) |
| `ir` | 70 | Odoo padrão (metadados) |
| `finan` | 44 | Financeiro custom (banco, conta, carteira, fluxo, lançamento, remessa, retorno) |
| `mail` | 42 | Mensageria Odoo |
| `contabil` | 29 | Contabilidade custom (conta, conta_referencial) |
| `pedido` | 26 | **Documento de negócio + operações + etapas + parcelas + processos** |
| `res` | 26 | Recursos compartilhados (partner, users, company, lang, etc.) |
| `relatorio` | 19 | Relatórios custom |
| `rh` | 19 | Recursos humanos custom |
| `estoque` | 16 | Estoque custom (extrato, local, saldo, rastreabilidade) |
| `producao` | 5 | Produção custom |
| `wms` | 6 | Movimentação física |
| `chamado` | 2 | Chamados |
| `crm` | 2 | Apenas `crm.pipeline` (vazio) e `crm.pipeline.etapa`. **Não há `crm.lead` etc.** |

### 3.3. Modelos padrão do Odoo que NÃO existem (nem em prod)

Sondei explicitamente e todos retornaram "registro não foi encontrado":

| Modelo | Em prod | Em teste |
|---|---|---|
| `crm.lead` | não existe | não existe |
| `crm.team` | não existe | não existe |
| `crm.stage` | não existe | não existe |
| `crm.tag` | não existe | não existe |
| `crm.lost.reason` | não existe | não existe |
| `sale.order` | não existe | não existe |
| `purchase.order` | não existe | não existe |
| `stock.picking` | não existe | não existe |
| `stock.quant` | não existe | não existe |
| `account.move` | não existe | não existe |
| `account.payment` | não existe | não existe |
| `product.product` | não existe | não existe |
| `l10n_br_fiscal.document` | não existe | não existe |

**Consequência:** toda tool prevista na spec original de Onda 1 a Onda 7 que
chame um desses modelos é irrealizável como descrita.

### 3.4. O modelo `pedido.documento` (o coração do ERP)

- **1.553** registros em produção, somando todos os tipos.
- **1.094 campos** segundo o discovery (`discovery/output/modelos/pedido.documento.json`).
  Apenas `tipo` é obrigatório do lado Odoo; o restante depende de regras de
  negócio das `operacao_id` e `etapa_id`.
- **Tipos canônicos observados (campo `tipo`):**
  `venda`, `compra`, `romaneio`, `transferencia_entrada`,
  `transferencia_saida`, `transferencia_solicitacao`, `devolucao_venda`,
  `inventario`, `producao`, `prospecto`, `contrato_venda`, `cobranca_a_receber`,
  `desmontagem`, `recodificacao`, `evento`, `os`.
- **Workflow:** cada documento tem `etapa_id` (FK para `pedido.etapa`),
  variando por operação. Ex.: "FAT JDS x GRUPO", "Em montagem", "Concluída".
- **Numeração:** `display_name` segue padrão `<sigla>-<num>/<ano>`. Ex.:
  `PV-1877/26` (pedido de venda 1877 de 2026), `OP-0382/26` (ordem de
  produção). A sigla deriva da operação.
- **Amostra real (últimos 5 documentos, todos de 2026-05-22):**
  4 ordens de produção `OP-*` (operação 10, "Montagem de kit") + 1 pedido de
  venda `PV-*` (operação 13, "0-Venda Lucro Real 5102/6102/6108").

### 3.5. O modelo `pedido.operacao` (templates de documento)

- 119 operações em prod.
- Distribuição por `tipo`: venda 43, romaneio 28, inventario 13,
  transferencia_entrada 9, transferencia_solicitacao 6, transferencia_saida 4,
  compra 3, os 3, devolucao_venda 2, producao 2, e mais 6 tipos com 1 cada.
- **Apenas 1 operação tem `url_api` preenchido em produção:** id=202,
  `prospecto_teste`, tipo `prospecto`. Os campos `codigo_depois_post_api`,
  `codigo_depois_put_api`, `codigo_trata_dados_api` e `etapa_id` estão todos
  vazios nessa operação.
- Campos do template que controlam a integração externa:
  `url_api` (char), `codigo_depois_post_api` (text Python),
  `codigo_depois_put_api`, `codigo_trata_dados_api`,
  `ignora_configuracao_pagamento_api`, `chamado_remoto_url`.

### 3.6. `tauga_api_post`: o que sabemos e o que não sabemos

**Sabemos:**

- Não é um método de modelo Odoo. Chamada via JSON-RPC em qualquer dos
  modelos candidatos (`pedido.operacao`, `pedido.documento`,
  `pedido.documento.processo`, `pedido.documento.cotacao`, `res.partner`)
  retorna `AttributeError` com a mesma stack trace que um método inventado
  (`metodo_inexistente_xyz`). Logo, **não há método chamável**
  `tauga_api_post` nos models.
- Os modelos `api.webhook` e `api.webhook.callback` existem no Odoo. Sugere
  que a Tauga implementou um sistema próprio de webhook.
- Rotas HTTP `/tauga/api/post`, `/api/tauga/post`, `/grupojht/api/post`,
  `/api/post/prospecto_teste`, `/tauga/api/prospecto_teste` e
  `/api/webhook/prospecto_teste` retornam **405 Method Not Allowed** em POST
  e GET, do reverse proxy. **Existe alguma rota nesse padrão**, mas o
  endpoint exato (path completo + método HTTP aceito + headers obrigatórios)
  não conseguimos confirmar sem o script de exemplo deles.

**Não sabemos (precisa vir da Tauga):**

- O path HTTP exato do endpoint de escrita.
- Se ele aceita autenticação por sessão Odoo (cookie de `/web/session/authenticate`),
  por API key (header `X-API-Key`) ou outra.
- O shape do `dados_api` por `tipo` de documento (venda, compra, prospecto,
  romaneio, etc.).
- A resposta (síncrona, com id do documento criado? assíncrona, retorna
  ticket/job?).

### 3.7. `res.partner` (a única ilha de Odoo padrão)

- 6.531 parceiros em teste, mesmo número aproximado em prod.
- Modelo padrão do Odoo, com campos `name`, `is_company`, `email`, `phone`,
  `street`, `city_id`, `state_id`, `country_id`, `active`, `customer_rank`,
  `supplier_rank`, `write_date` e o customizado `cnpj_cpf` (vem com `tauga`).
- **Validado E2E:** create + read + unlink + ir.model.data cascade funcionam
  contra `teste_grupojht`.

---

## 4. O que existe no nosso código hoje

### 4.1. Cache local (Postgres, schema Prisma)

- **163 models Prisma** no total.
- **133 são `Raw*` ou `Fato*`**: 114 `raw_*` (espelho 1:1 de tabelas do Odoo)
  e **19 `fato_*`**: `FatoEstoqueSaldo`, `FatoEstoqueMovimento`,
  `FatoProdutoParado`, `FatoBuildState`, `FatoFinanceiroSaldo`,
  `FatoFinanceiroMovimento`, `FatoFinanceiroTitulo`, `FatoPedido`,
  `FatoPedidoParcela`, `FatoNotaFiscal`, `FatoNotaFiscalItem`, `FatoParceiro`,
  `FatoContaContabil`, `FatoPreco`, `FatoServico`, `FatoApuracao`,
  `FatoCartaCorrecao`, `FatoReferencia`, `FatoCertificado`.

### 4.2. Tools MCP

| Tipo | Quantidade | Onde |
|---|---|---|
| Read tools | 50 | `mcp/tools/{cadastros,comercial,contabil,crm,estoque,financeiro,fiscal,caminho3,dominios-vazios}` |
| Write tools | **1** | `mcp/tools/crm/res-partner-create.ts` (`crmResPartnerCreate`) |

### 4.3. Canal de escrita

- `clientFromEnv("write")` (em `src/worker/odoo/client.ts:292-312`) lê
  exclusivamente `ODOO_WRITE_*` (URL, DB, USER, PASSWORD). Sem fallback
  silencioso para `ODOO_*` de produção (decisão aplicada em 2026-05-23).
- E2E real: `scripts/e2e/test-write-partner.ts`.

### 4.4. Discovery

- 79 schemas em `discovery/output/modelos/*.json`. Cobrem `pedido.*`,
  `finan.*`, `contabil.*`, `estoque.*`, `sped.*`, `res.partner`,
  `res.users`, `res.company`, `producao.processo`. Cada arquivo tem
  `campos[]` (com `nome`, `tipo`, `obrigatorio`, `somente_leitura`,
  `relacao`) e amostras.

---

## 5. O que a spec original de Onda 2 assumiu errado

O documento `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md`
foi escrito assumindo Odoo padrão. Onde ele erra:

- **§2.2 (Dentro, ondas 1-7).** Lista `crm.lead`, `sale.order`,
  `purchase.order`, `stock.picking`, `account.payment`,
  `l10n_br_fiscal.document`, `account.move` — todos inexistentes.
- **§5.3 e §10.x.** Detalha ações sensíveis (`emit_nfe`, `cancel_nfe`,
  `confirm_order`, `validate_picking`, `reconcile`, `post_journal`) baseadas
  em métodos `action_*` do Odoo padrão. No Odoo da Tauga, as ações
  equivalentes vivem em métodos das `pedido.operacao` e em fluxos de
  `pedido.etapa`, com nomes diferentes.
- **§5.4 (Nomenclatura).** Os exemplos (`crm.crm_lead.create`,
  `vendas.sale_order.confirm_order`) precisam ser substituídos por
  `pedido.pedido_documento.create_<tipo>` ou similar, com `tipo` derivado
  do nome do template em `pedido.operacao`.

O que continua válido na spec original (mantém):

- A engenharia de tipos (`WriteToolEntry`, `capabilities`,
  `Idempotency-Key`, `external_id`, audit, idempotency store).
- O modelo de 6 camadas de defesa.
- A regra de "Agente Nex nunca escreve" (defesa por rota de auth).
- O conceito de cutover teste/produção via env.
- O fluxo de sync direcionado pós-write.

O que muda: a **lista de tools** por onda, os **modelos de destino** e o
**mecanismo de chamada** (criar via `pedido.documento` direto ou via
endpoint `tauga_api_post`).

---

## 6. Decisão única recomendada

### 6.1. Onda 1 (redefinida) — `res.partner` completo

**Escopo:**

- `crm.res_partner.update` (write em campos editáveis).
- `crm.res_partner.delete` (unlink com guard de FK).
- `crm.res_partner.transition` (acionar `active` ON/OFF, ajustar
  `customer_rank`, `supplier_rank`).

**Critérios de pronto:**

- Cada tool tem `WriteToolEntry`, capability própria
  (`update:crm`, `delete:crm`, `transition:crm`), Zod schema validado,
  handler com snapshotBefore + snapshotAfter, eventName, audit log,
  idempotency.
- E2E real contra `teste_grupojht` (script em
  `scripts/e2e/test-write-partner-suite.ts`), cobrindo casos de sucesso e
  erro (validação, FK, partner inexistente, capability faltando).
- Documentação atualizada em `mcp/docs/...` e exemplos curl/n8n/python/js.

**Por que essa Onda primeiro:** é a única que (a) toca um modelo padrão
do Odoo, com semântica conhecida, (b) tem dados reais na base de teste
hoje (6.531 partners), (c) tem valor de produto óbvio (criar/atualizar/
inativar parceiro pelo WhatsApp via agente Nex, depois da F5), (d) não
depende de a Tauga responder nada.

### 6.2. Onda 2 (planejamento, não execução) — discovery do `pedido.*`

**Escopo:** descobrir, validar e documentar **como criar e transicionar
`pedido.documento` para os tipos relevantes**.

Não escreve código de produção. Entregáveis:

- Lista das `operacao_id` que serão alvo (definida com Comercial/Fiscal
  do cliente, não com o desenvolvedor).
- Documentação do contrato real do endpoint `tauga_api_post`, com
  request/response por tipo de documento, autenticação e cenários de erro.
- Mapeamento "campo nosso → campo Odoo da Tauga" para cada tipo.
- Spec definitivo de Ondas 3+ (uma onda por família: prospecto, venda,
  compra, romaneio, etc.), agora baseada em fato.

### 6.3. Ondas 3+ (a planejar depois da Onda 2)

Uma onda por família de documento, na ordem de risco/valor decidida com
o cliente. Sugestão técnica de ordem (não comprometida ainda):

1. **prospecto** (1 operação ativa em prod, baixo risco, alto valor de
   captação).
2. **venda** (3 operações de venda comum: Lucro Real, Lucro Presumido,
   Simples Nacional).
3. **romaneio / transferência** (movimentação de estoque sem fiscal direto).
4. **compra**, **devolucao_venda**, **inventario**, **producao** etc.

Cada onda nasce com spec própria, plan próprio e E2E real.

---

## 7. Mensagem para a Tauga (texto pronto)

> Pessoal, conseguimos autenticar e fazer escrita na base de teste
> (`teste_grupojht`), e validamos o canal de escrita criando, lendo e
> apagando `res.partner` pela API JSON-RPC. Esse pedaço está fechado.
>
> Para evoluirmos a integração para criar **documentos de pedido**
> (prospecto, venda, compra, romaneio, etc.) pelo padrão de vocês,
> precisamos de 3 informações objetivas:
>
> **1. O endpoint real do `tauga_api_post`.**
>    No script `teste_integracao_odoorpc_grupojht.py` que vocês nos
>    mandaram, aparece a chamada
>    `execute_kw(OBJETO, 'tauga_api_post', kwargs={url_api, dados_api})`.
>    Sondamos via JSON-RPC nos modelos candidatos (`pedido.operacao`,
>    `pedido.documento`, `pedido.documento.processo`,
>    `pedido.documento.cotacao`, `res.partner`) e o método `tauga_api_post`
>    não responde — o Odoo devolve `AttributeError`, igual a um método
>    inexistente. Suspeitamos que o endpoint real seja um **controller
>    HTTP custom** de vocês (algo como
>    `POST https://grupojht.tauga.online/<algo>` com `url_api` e
>    `dados_api` no body). Confirmem:
>    - Path HTTP exato e método (POST? PUT?).
>    - Autenticação esperada (cookie de `/web/session/authenticate`,
>      header `X-API-Key`, outro?).
>    - Se possível, **reencaminhar o script
>      `teste_integracao_odoorpc_grupojht.py`** pelo canal de vocês (não
>      temos arquivado).
>
> **2. O contrato do `dados_api` por tipo de documento.**
>    Vamos integrar para começar com **prospecto** e em seguida **venda**.
>    Precisamos da documentação do JSON esperado em `dados_api` para cada
>    um (campos obrigatórios, formato de CPF/CNPJ, IDs de parceiro/produto,
>    parcelas, etc.), e da resposta (síncrona com id do documento criado?
>    assíncrona?).
>
> **3. Configuração das `pedido.operacao` na base de teste.**
>    Hoje na base de teste, só a operação id=202 (`prospecto_teste`) tem
>    `url_api` preenchido. Para validarmos venda e os demais tipos,
>    precisamos que vocês preencham os `url_api` correspondentes nas
>    operações que vão entrar no escopo (a definir junto com vocês). Se
>    fizer sentido, sugerimos espelhar os de produção.
>
> Com essas 3 respostas, montamos a integração de escrita de documentos.
> Enquanto isso, evoluímos a parte de `res.partner` (criar/atualizar/
> inativar parceiro) que já está destravada.

---

## 8. Apêndice: dados brutos

- Inventário completo de módulos PROD/TESTE: `/tmp/laudo-1-modulos.json`
  (gerado pela investigação; pode ser regenerado com a sonda em §2).
- Inventário de modelos por família: `/tmp/laudo-2-modelos.json`.
- Discovery de schema dos 79 modelos custom: `discovery/output/modelos/`.

---

## 9. O que muda nos documentos existentes

- `docs/tauga-base-teste-bloqueio.md` (já atualizado em 2026-05-23): canal
  de auth resolvido. Adicionar referência a este laudo.
- `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md`:
  marcar §2.2 e §5.3-§5.4 como **superseded por este laudo**. Não apagar,
  o desenho de arquitetura geral continua válido.
- `CLAUDE.md` §10 (decisão #10): "F4 onda 1 com estoque + financeiro"
  precisa ser revista. Estoque e financeiro no Odoo da Tauga vivem em
  `estoque.*` e `finan.*` custom, e a escrita neles muito provavelmente
  passa pelo mesmo `tauga_api_post`. Atualizar para refletir que
  **leitura** continua como está (cache + `fato_*`), **escrita** depende
  do contrato `tauga_api_post` (bloqueio externo).
