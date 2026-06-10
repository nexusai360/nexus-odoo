# Perícia , Faturamento real consolidado do grupo (Fase 0)

> Documento forense canônico. Mapeia o que o cache do ERP sustenta para calcular
> faturamento/receita/margem de um grupo com múltiplas empresas, com eliminação
> intercompany. Lido por todas as sessões futuras antes de mexer nessa frente.
>
> **Origem:** pesquisa do dono (CPC 36/47, ponte de reconciliação, intercompany,
> lucro real vs gerencial) + perícia no cache real em 2026-06-09.

---

## 1. A pergunta de negócio

O dono de um grupo com ~17 empresas quer saber **"quanto a gente realmente faturou"**
e **"qual o lucro"**. A armadilha (confirmada no dado): somar todas as notas de saída
infla o número, porque inclui venda entre empresas do mesmo grupo, transferências,
remessas, devoluções e operações que não são receita.

As quatro visões que a pesquisa define (e que adotamos como norte):

- **A. Faturamento fiscal emitido** , valor dos documentos emitidos (inclui tudo).
- **B. Receita individual por empresa** , o que cada CNPJ reconheceu (inclui venda intragrupo).
- **C. Receita consolidada externa** , só vendas a clientes FORA do grupo (elimina intercompany). É o número que o dono chama de "faturamento real".
- **D. Caixa recebido** , o que entrou no banco (não é receita; depende de financeiro/AR).

E a **ponte de reconciliação** que liga A → C:
`notas de saída autorizadas − operações sem receita − intercompany − devoluções
externas − descontos/deduções = receita líquida consolidada externa`.

---

## 2. Estrutura do grupo (no cache, hoje)

O `fato_nota_fiscal` mostra **15 estabelecimentos emitentes** (empresaId 1..17, faltam 10 e 11),
agrupados em **~9 raízes de CNPJ** (entidades legais), com matriz + filiais:

| empresaId | Nome (parseado da nota) | Tipo | UF | CNPJ |
|---|---|---|---|---|
| 1 | JHT Brasília | Matriz | DF | 07.390.039/0001-01 |
| 2 | Jht DF Comércio | Matriz | DF | 10.557.556/0001-37 |
| 3 | Jht DF Comércio | Filial | SE | 10.557.556/0003-07 |
| 4 | Jds Comércio | Matriz | DF | 18.282.961/0001-00 |
| 5 | Jds Comércio | Filial | SP | 18.282.961/0003-63 |
| 6 | Jds Comércio | Filial | SE | 18.282.961/0004-44 |
| 7 | Jib DF Comércio | Matriz | DF | 33.718.546/0001-31 |
| 8 | Jht SP Comércio | Matriz | DF | 34.161.829/0001-98 |
| 9 | Jht SP Comércio | Filial | SE | 34.161.829/0004-30 |
| 12 | Jht SP Comércio | Filial | BA | 34.161.829/0007-83 |
| 13 | Ks Comércio | Matriz | DF | 34.461.908/0001-14 |
| 14 | Cs Comércio | Matriz | DF | 35.156.509/0001-02 |
| 15 | Cs Comércio | Filial | BA | 35.156.509/0002-93 |
| 16 | Jmf Comércio | Matriz | DF | 45.424.185/0001-08 |
| 17 | Ijht Premium Car | Matriz | DF | 62.673.999/0001-97 |

**Raízes de CNPJ do grupo (8 primeiros dígitos), usadas p/ marcar intercompany:**
`07390039, 10557556, 18282961, 33718546, 34161829, 34461908, 35156509, 45424185, 62673999`.

> **Pendência de confirmação (usuário ausente):** o dono fala em "17 empresas"; o fato
> mostra 15 estabelecimentos emitentes. Pode haver empresa sem emissão no período, ou
> empresaId 10/11 inexistentes (ecoa o R10: id-space do fato ≠ res.company). A lista
> acima é a verdade do DADO; validar contra a realidade societária quando possível.
> **Fonte canônica de empresa = o fato (R10), nunca a `dim_empresa_grupo`.**

---

## 3. Inventário de dados do cache (o que sustenta o quê)

### Tabelas-chave

- **`fato_nota_fiscal`** (cabeçalho): `chave, numero, serie, modelo, entrada_saida,
  tipo_movimento, situacao_nfe, finalidade_nfe, participante_id, participante_nome,
  natureza_operacao_id/nome, empresa_id/nome, data_emissao/entrada_saida/autorizacao,
  vr_nf, vr_produtos, vr_fatura, vr_ibpt, vr_icms_proprio, vr_desconto`.
- **`fato_nota_fiscal_item`** (item, desnormalizado): `documento_id, produto_id/nome,
  cfop_id, cfop_nome (LIMPO, com código: "5102 - Venda de mercadoria..."), quantidade,
  vr_unitario, vr_produtos, vr_nf, vr_icms_proprio, vr_pis_proprio, vr_cofins_proprio,
  data_emissao, entrada_saida, empresa_id, situacao_nfe`.
- **`fato_parceiro`**: `odoo_id, nome, documento, documento_digits (CNPJ só dígitos),
  eh_cliente, eh_fornecedor, eh_empresa, cidade, uf`. **Permite identificar intercompany.**
- **`fato_produto`**: `preco_custo` populado em **2982/3776 (~79%)**.
- **`fato_contabil_lancamento`**: **VAZIO (0 linhas).** Sem razão contábil.

### Sinais fiscais úteis

- `situacao_nfe = 'autorizada'` (exclui cancelada/denegada/inutilizada/em_digitação/rejeitada).
- `entrada_saida = '1'` (saída).
- `finalidade_nfe`: **1**=normal (37998), **4**=devolução (441), 2=complementar (26), 3=ajuste (1).
- `natureza_operacao_*`: nome **truncado na origem (~60 chars) e redundante** no Tauga , NÃO confiável para rótulo. Usar **CFOP do item** como classificação canônica.
- `vr_desconto` no cabeçalho; impostos próprios por item e por nota.

---

## 4. Achado central , intercompany é material

Saída autorizada, participante cruzado com as raízes de CNPJ do grupo:

| Tipo | Notas | Valor (vr_nf) |
|---|---|---|
| Externo (cliente fora do grupo) | 30.615 | R$ 1.419.580.078,72 |
| **Intercompany (venda intragrupo)** | **3.801** | **R$ 440.402.630,35** |

**~24% do faturamento bruto é intragrupo.** Somar tudo infla a receita em ~R$ 440 mi.
É a prova viva do "mercadoria faturada 2-3x circulando entre as empresas". A eliminação
intercompany (CPC 36) não é luxo: é a diferença entre R$ 1,86 bi (ingênuo) e ~R$ 1,42 bi
(externo real, antes de devoluções/deduções).

---

## 5. Matriz de viabilidade (o que dá, com ressalva, e o que NÃO dá)

| Número / visão | Viável hoje? | Fonte | Ressalva |
|---|---|---|---|
| Faturamento fiscal por empresa | ✅ | fato_nota_fiscal | Já existe (corrigido no R10) |
| Faturamento por CFOP (item) | ✅ | item.vr_produtos / cfop | Base = valor dos produtos |
| Faturamento por natureza | ✅ (feio) | nota.natureza | Nome truncado/redundante; preferir CFOP |
| Faturamento por categoria gerencial | ✅ | CFOP → tabela de regras | Precisa da tabela de regras |
| Identificação intercompany | ✅ | participante × CNPJ grupo | Raízes de CNPJ do §2 |
| Eliminação / receita consolidada externa | ✅ | A − intercompany − devoluções − deduções | O número "real" do dono |
| Ponte de reconciliação | ✅ | composição das exclusões | Entregável completo |
| Devoluções externas | ✅ | finalidade_nfe=4 + chave | Vincular à nota original via chave |
| Matriz intercompany (vendedor×comprador) | ✅ | emitente × participante grupo | Detecta divergências |
| Margem bruta aproximada | ⚠️ | item × fato_produto.preco_custo | Custo ATUAL, não CMV histórico; 79% cobertura |
| DRE / lucro líquido / EBITDA | ❌ | fato_contabil_lancamento VAZIO | Sem razão contábil sincronizada |
| Lucro Real tributário | ❌ | exige adições/exclusões legais | Fora do escopo do dado fiscal |
| Fluxo de caixa / AR / inadimplência | ❌ | sem financeiro AR no cache | Depende de sync futuro |

**Regra de ouro da honestidade:** entregamos faturamento e receita consolidada com
rigor; margem com ressalva explícita; e **não inventamos lucro contábil/tributário**
enquanto o contábil não existir. O agente deve dizer "não tenho esse dado" (Caminho 3a)
em vez de chutar.

---

## 6. O coração , Tabela de Regras (parametrização)

Conforme a pesquisa: o sistema não pergunta "qual o CFOP?", e sim "qual a substância
econômica e como ela aparece nas visões individual / fiscal / consolidada?".

Tabela parametrizável (chave = CFOP, com fallback por prefixo de CFOP), colunas:

| Campo | Significado |
|---|---|
| `cfop` | Código fiscal (4 dígitos) |
| `categoria_gerencial` | venda_propria, revenda, exportacao, intercompany, devolucao, transferencia, remessa, bonificacao, outras |
| `eh_receita` | entra no faturamento? (Sim/Não) |
| `deduz_receita` | subtrai (devolução/desconto)? |
| `eh_intercompany_se_grupo` | marcar como intragrupo quando o participante é do grupo |
| `afeta_estoque` | movimenta estoque? |

Derivação base por CFOP (grupos padrão BR), refinada nas reviews:
- `x1xx/x2xx` venda (5101/5102/6101/6102/6108 = venda; própria vs revenda pela natureza/produto).
- `6108` venda a não contribuinte; `7xxx` exportação.
- `x152` transferência; `x202/x411` devolução; `x91x/x92x` remessa/simples faturamento.
- Intercompany é ORTOGONAL ao CFOP: definido pelo participante ∈ grupo.

---

## 7. Decisões de política (assumidas no modo autônomo, revisáveis)

- **Intercompany:** aparece na receita INDIVIDUAL da empresa (B) e é ELIMINADA no
  consolidado externo (C). (CPC 36.)
- **Bonificação:** NÃO entra como receita por padrão (é brinde/doação, sem receita);
  exibida em categoria própria. Parametrizável.
- **Devolução externa:** reduz a receita consolidada (deduz). Devolução intragrupo não
  altera receita externa (a venda original já foi eliminada).
- **Base de faturamento por operação:** valor dos PRODUTOS por CFOP (escolha do usuário),
  com reconciliação explícita ao `vr_nf` por nota.
- **Faturamento "venda autorizada"** continua = saída autorizada de natureza/CFOP de venda
  (consistente com PR #72/#73 já em produção).

---

## 8. Roadmap decomposto (cada fase: spec → 2 reviews → plan → 2 reviews → build → verif)

- **Fase 0 (este doc):** perícia + viabilidade + tabela de regras (conceito). ✅
- **Fase 1 , Tabela de Regras + Faturamento por operação fiscal (CFOP/categoria):**
  a parametrização versionada/testada + métrica + tool `faturamento_por_operacao_fiscal`
  (CFOP e categoria gerencial), com reconciliação. Mantém `por_operacao` (natureza) limpa.
- **Fase 2 , Intercompany + Receita consolidada externa:** marcação intragrupo, matriz
  intercompany, métrica/tool de receita consolidada externa.
- **Fase 3 , Ponte de reconciliação:** tool `ponte_faturamento` (A → exclusões → C),
  o relatório que responde "por que de R$X de nota a receita é R$Y".
- **Fase 4 , Margem aproximada:** com `preco_custo` e ressalva forte de cobertura/atualidade.
- **Futuro (bloqueado por dado):** DRE/lucro/EBITDA/caixa , só quando o contábil/financeiro
  sincronizarem. Registrado, não prometido.

**Organização das "100+ informações":** NÃO viram 100 tools. Viram a **tabela de regras
+ poucas tools parametrizadas** (faturamento_por_operacao_fiscal, receita_consolidada,
intercompany, ponte_faturamento, margem_aproximada) que recortam o dado por dimensão.
Inteligência na parametrização, não na multiplicação de tools.

---

## 9. Limites e riscos (honestos)

- Sem contábil → sem lucro contábil/tributário. Hard stop documentado.
- Custo é o atual do produto, não o histórico → margem é estimativa.
- "17 empresas" vs 15 no fato → validar societário.
- CFOP classifica o item; uma nota multi-CFOP é tratada no item (correto).
- Natureza do ERP é suja → CFOP é a fonte canônica de operação.
