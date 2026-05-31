# Discovery B3 , Financeiro / Cobrança bancária (ao vivo, 2026-05-31)

Introspecção read-only contra a Tauga (JSON-RPC, uid 11) via
`scripts/discovery/b3-financeiro-bancario.ts`. `search_count` + `fields_get` +
amostra. Grão honesto antes de fixar schema/fato/tool (padrão das ondas do Balde B).

## Resumo (o que existe e está operado)

| Modelo | Registros | Campos | Situação |
|---|---|---|---|
| `finan.remessa` | 7 | 67 | **Operado** (pouco volume). Remessa enviada ao banco. |
| `finan.remessa.item` | 1 | 53 | **Marginal** (1 linha). Itens da remessa. |
| `finan.retorno` | 8 | 64 | **Operado**. Retorno do banco, com totais. |
| `finan.retorno.item` | 42 | 76 | **Operado (o grão rico)**. Linhas de baixa/pagamento. |
| `finan.carteira` | 11 | 132 | **Operado**. Carteiras de cobrança (config de boleto). ⚠️ contém segredos. |
| `finan.forma.pagamento` | 44 | 184 | **Operado**, mas é dimensão + mixin de config gigante. |
| `finan.cheque` | 0 | 63 | **Existe, não operado** (estrutural honesto, como B2). |
| `finan.pix` | 0 | 42 | **Existe, não operado** (estrutural honesto, como B2). |

Conclusão: cobrança bancária é **parcialmente operada**. O valor real está em
**retorno + retorno.item** (baixas/pagamentos processados, com valores), em
**remessa** (remessas geradas) e em **carteira** (boletos/carteiras). `cheque` e
`pix` ficam estruturais honestos. `forma.pagamento` é dimensão.

## Achados materiais (mudam o desenho)

### 1. ⚠️ SEGURANÇA , `finan.carteira` carrega credenciais de banco
Os 132 campos incluem dezenas de segredos de API por banco:
`itau_token`, `itau_certificado`, `bradesco_certificado`, `bradesco_segredo`,
`inter_token`, `sicredi_password`, `safra_password`, `santander_certificado`,
`banco_brasil_secret_id`, `stone_secret`, `mercado_pago_token`, `asaas_token`,
além de `*_access_token`, `*_refresh_token`, `*_data_validade_token`.
**Decisão obrigatória:** o fato/raw da carteira tem que **excluir** todos os
campos de credencial (`*_token`, `*_secret`, `*_segredo`, `*_password`,
`*_certificado`, `*_chave` de API, `*_client*`). Só entram os campos de negócio:
`nome`, `banco_id`, `banco`, `carteira`, `tipo_carteira`, `beneficiario`,
`convenio`, `modalidade`, `al_juros`, `al_multa`, `al_desconto`, `taxa_emissao`,
`dias_protesto`, `dias_negativacao`, `proximo_nosso_numero`, `proxima_remessa`.
Vale usar a allow-list de campos do `field-selection` (já existe no worker).

### 2. Mixin gigante polui o `fields_get` de todos os modelos
Todos herdam um mixin Tauga: `currency_*` (23 moedas), `tauga_xml_id*`,
`usuario_eh_suporte`, `has_message`, `mensagem_ids`, `arquivo_anexo_ids`. Em
`finan.forma.pagamento` há ainda ~120 flags `sistema_*` (config da empresa:
`sistema_faz_venda`, `sistema_emite_nfe`...). **Nada disso é fato de negócio** ,
o builder seleciona só os campos reais (allow-list), nunca o `fields_get` cru.

### 3. `finan.forma.pagamento` é dimensão, não fato de movimento
Campos reais úteis: `nome`, `forma_pagamento` (selection), `bandeira_cartao`,
`integracao_cartao`, `participante_id`, `carteira_id`, `conta_id`,
`centro_resultado_id`, `conta_contabil_receita_id`, `conta_contabil_despesa_id`.
É tabela de apoio (44 formas). Candidata a dimensão/lookup, não a "fato" próprio.

### 4. `finan.remessa.item` tem 1 registro só
Itens da remessa quase não operados. A remessa-cabeçalho (7) já tem
`item_ids`/`item_ted_doc_ids`/`item_pix_ids`. Modelar item agora rende pouco;
provável adiar o item e entregar só o cabeçalho de remessa.

## Campos de negócio por modelo (sem o mixin)

**finan.remessa:** `tipo`(sel), `banco_id`, `cnpj_cpf_raiz`, `carteira_id`,
`numero`(int), `data`(dt), `data_pagamento`, `confirmada`(bool),
`data_confirmacao`, `remessa_cancelada_id`, `exige_liberacao_alcada`,
`alcada_liberada_maior_valor`(monetary).

**finan.retorno:** `tipo`, `banco_id`, `cnpj_cpf_raiz`, `carteira_id`,
`numero`(char), `data`, `total_entradas`, `total_saidas`, `saldo`,
`total_entradas_conciliadas`, `total_saidas_conciliadas`, `saldo_conciliado`,
`data_inicial_ofx`, `data_final_ofx`, `caixa_fechado`(bool).

**finan.retorno.item (grão rico):** `retorno_id`, `situacao`(sel),
`nosso_numero`, `numero`, `codigo_barras`, `tipo`, `data_registro`,
`data_pagamento`, `data_credito_debito`, `data_baixa`, `vr_documento`,
`vr_juros`, `vr_multa`, `vr_desconto`, `vr_outros_creditos`, `vr_outros_debitos`,
`vr_tarifas`, `vr_baixado`, `vr_total`, `divida_id`, `divida_numero`,
`divida_participante_id`, `divida_data_vencimento`, `divida_situacao`,
`pagamento_id`, `motivo_rejeicao`, `banco_id`.

**finan.carteira (só negócio, SEM segredos):** ver lista no achado #1.

**finan.forma.pagamento (dimensão):** ver achado #3.

## Desenho candidato (a confirmar na SPEC)
- `FatoRemessaBancaria` (de `finan.remessa`, cabeçalho; item adiado) , tool
  "remessas geradas no período".
- `FatoRetornoBancario` (de `finan.retorno`) + `FatoRetornoItem` (de
  `finan.retorno.item`, o grão de baixas) , tools "retornos processados" e
  "baixas/pagamentos por período" (juros/multa/desconto/tarifas/valor).
- `FatoCarteiraCobranca` (de `finan.carteira`, sem credenciais) , tool
  "carteiras/boletos cadastrados".
- `finan.cheque` / `finan.pix` , tools honestas estruturais (count==0 →
  "não operado", auto-ativam), igual MDF-e/REINF do B2.
- `finan.forma.pagamento` , dimensão de apoio (avaliar se vira fato leve ou
  fica como lookup do retorno/remessa).
