# Review adversarial #2 da SPEC O1 (aterrada no shape real via JSON-RPC)

> Alvo: `docs/superpowers/specs/2026-05-29-o1-sped-fiscal-spec.md` v2.
> Método: introspecção `fields_get` + `search_read`/`read_group` reais contra a
> Tauga (uid 11) dos modelos DF-e e duplicata. Derrubou premissas de modelagem da
> v2. Aplicar gera a SPEC v3 (vai ao PLAN).

## Achados (com evidência real)

### O1-B1 (BLOQUEADOR), `sped.dfe.importacao` NÃO é o cabeçalho do DF-e
176 campos quase todos de config de sistema (`sistema_emite_nfe`,
`importacao_zip_id`, `importacao_xml_ids`, dezenas de `currency_*_id`). É o registro
de importação de XML/ZIP + flags da empresa (216 regs), não uma nota de fornecedor.
**v3:** abandonar como fonte de `FatoDfe`.

### O1-B2 (modelo correto), a nota de terceiro é `sped.consulta.dfe.item`
1 linha = 1 DF-e/nota (**6.288 regs**, não 4.780). Pertence a `sped.consulta.dfe`
(`consulta_id` many2one), que é só o lote de consulta NSU por empresa (35 regs,
`empresa_id`, `ultimo_nsu`), sem valor. **v3:** `FatoDfe` sai de
`sped.consulta.dfe.item`; cabeçalho e "item" colapsam num fato só.

### O1-B3 (CORTAR FatoDfeItem), não há granularidade de produto
`sped.consulta.dfe.item` (202 campos) não tem nenhum campo de linha de produto
(`produto/quant/ncm/cfop/valor_unitario`): só `chave`, `numero`, `cnpj_cpf`,
`vr_nf`, datas, `manifestacao`. **v3:** cortar `FatoDfeItem` e a tool
`dfe_itens_por_produto`.

### O1-B4 (manifestação viável, modelar como char), tool mantida
Campo `manifestacao :: char` + `pode_manifestar :: boolean`. `read_group` em 6.288:
**621 `"conhecido"`, 5.667 vazio/false**. **v3:** `FatoDfe.manifestacao String?`
(não selection); "pendente" = `manifestacao` vazio (o PLAN decide se usa também
`pode_manifestar=true` como critério, contra o dado). Tool
`dfe_pendentes_manifestacao` é VIÁVEL.

### O1-B5 (qualidade fraca de fornecedor/valor), ajustar promessa
Amostra recente: `participante_id=false`, `documento_id=false`, `vr_nf=0`. Fornecedor
confiável só via `cnpj_cpf` (char). **v3:** `dfe_por_fornecedor` agrega por
`cnpj_cpf` (não FK); `FatoDfe.cnpjFornecedor` é a chave de agregação; `vrNf` pode ser
0 (avisar na descrição da tool que o valor confiável de compra vem do financeiro).

### O1-B6 / O1-B7 (CORTAR duplicatas de cobrança), redundante com financeiro
`sped.documento.duplicata` (21.363 regs) tem `finan_lancamento_ids -> finan.lancamento`,
e `fato-financeiro-titulo.ts` é construído de `finan.lancamento` (a_receber/a_pagar,
`data_vencimento`, `vr_saldo`, `situacao='aberto'`). Logo "duplicatas/títulos a
vencer" JÁ são respondidos por `FatoFinanceiroTitulo` + tools financeiras. A duplicata
fiscal **não tem** campo de situação/saldo (54 campos varridos: só `pagamento_id` FK
nula). **v3:** cortar `duplicatas_a_vencer`/`duplicatas_por_cliente` e `FatoDuplicata`
(situação inexistente; cobrança é território do financeiro). Único valor fiscal
remanescente seria lookup de código de barras por nota, marginal: **fora do piloto**.

### O1-B8 (painel confirmado), só raw do MODEL_CATALOG
`page.tsx` chama `getSyncState()`; `sync-config.ts` lê `prisma.syncState.findMany`
(modelos do `MODEL_CATALOG`); `FatoBuildState` NÃO é exposto no painel. **v3:**
registrar `sped.consulta.dfe.item` no `MODEL_CATALOG` faz 113->114 e o modelo
aparece ok , satisfaz §9. `sped.documento.duplicata` e `sped.dfe.importacao` já
estão no catálogo. Não há superfície de fatos a atualizar (pendência da §9 fechada).

## Síntese (piloto corrigido)
- **1 raw novo:** `sped.consulta.dfe.item` -> `raw_sped_consulta_dfe_item` (MODEL_CATALOG, painel 113->114).
- **1 fato novo:** `FatoDfe` (de `raw_sped_consulta_dfe_item`, 1 linha/nota, agregação por `cnpj_cpf`).
- **FatoDfeItem, FatoDuplicata: cortados.**
- **3 tools:** `dfe_importados_periodo`, `dfe_por_fornecedor` (por cnpj_cpf),
  `dfe_pendentes_manifestacao` (manifestacao vazio).
- Vocabulário Router + bateria R-X.

Piloto enxuto, coeso e 100% aterrado no dado real. Pronto para a SPEC v3.
