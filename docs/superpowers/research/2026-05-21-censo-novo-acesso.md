# Censo do novo nível de acesso — Odoo Tauga produção

> Pesquisa de apoio à F4 Expansão da base de leitura (L1).
> Data: 2026-05-21. Método: introspecção JSON-RPC somente leitura contra
> `grupojht.tauga.online` com o usuário `joaozanini` (uid 11).

---

## 1. O novo acesso

A plataforma passou a usar o usuário `joaozanini` (uid 11) no lugar do antigo
`suporte`. É um acesso praticamente de administrador: **103 grupos**, cobrindo
todos os domínios de negócio do Tauga (Cadastros, Caixas, Chamado, Compras,
Consulta, Contratos de Compra e Venda, Controle de Qualidade, Contábil,
Estoque, Evento, Financeiro, Fiscal, OS, PDV, Produção, Projeto, Prospectos,
RH, Vendas, WMS, eCommerce), mais os grupos técnicos `Taŭga / Administrador`,
`Taŭga / Auditoria` e `Administration / Administração e suporte`.

Consequência prática: `joaozanini` lê (e, na base de teste, escreve) na
esmagadora maioria dos modelos do ERP. O `check_access_rights` retornou
`read/write/create/unlink` verdadeiro para quase todos os modelos das
namespaces de negócio.

## 2. O universo de modelos

O Odoo de produção expõe **650 modelos** (`ir.model`). Distribuição por
namespace (top): `sped` 254, `ir` 70, `finan` 44, `mail` 42, `contabil` 29,
`res` 26, `pedido` 26, `rh` 19, `relatorio` 19, `estoque` 16,
`ks_dashboard_ninja` 13, `wms` 6, `producao` 5.

Modelos nas namespaces de negócio Tauga (`sped`, `finan`, `estoque`, `pedido`,
`contabil`, `producao`): **364**.

## 3. Os 79 modelos hoje sincronizados

Os 79 modelos do `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`)
**continuam todos legíveis** com o novo acesso. Zero ficaram inacessíveis. O
cache atual não corre risco com a troca de usuário.

## 4. O que o novo acesso revela: 272 modelos Tauga adicionais

Além dos 79, `joaozanini` lê outros **272 modelos** das namespaces de negócio.
Classificação (lista completa crua: ver a saída das sondagens `odoo_probe`):

### 4a. Operacional com dado — candidatos a raw + fato + tool

Modelos de negócio com registros reais que hoje não temos:

| Modelo | Registros | Conteúdo |
|---|---|---|
| `sped.tabela.preco` | 15 | Tabelas de preço |
| `sped.tabela.preco.regra` | 11.864 | Regras de preço por produto |
| `sped.servico` | 336 | Catálogo de serviços (fiscal) |
| `sped.consulta.dfe` | 35 | Consulta de DF-e (notas de fornecedores) |
| `sped.consulta.dfe.item` | 4.452 | Itens das DF-e consultadas |
| `sped.dfe.importacao` (já nos 79) | 20.248 | Importação de DF-e |
| `sped.apuracao` | 8 | Apurações fiscais |
| `sped.carta.correcao` | 12 | Cartas de correção |
| `sped.certificado` | 11 | Certificados digitais |
| `finan.baixa.lancamento` | 3 | Baixas de lançamentos |
| `pedido.faturamento` | 1 | Faturamento de pedido/contrato |

### 4b. Referência fiscal e cadastral — tabelas estáticas de apoio

Tabelas de domínio que enriquecem as tools existentes (resolver código para
nome, validar, classificar). Não geram relatório próprio, mas valem como
camada de referência sincronizada:

- Fiscais: `sped.ncm` (12.032), `sped.cnae` (1.301), `sped.cest` (924),
  `sped.cfop` (604), `sped.nbs` (920), `sped.natureza.operacao` (104),
  `sped.unidade` (73), `sped.condicao.pagamento` (83).
- Geográficas: `sped.municipio` (5.829), `sped.pais` (242), `sped.estado` (28).
- Alíquotas e CST: `sped.aliquota.*` (ICMS próprio/ST, IPI, INSS, IRPF, ISS,
  PIS-COFINS, SIMPLES), `sped.cst.*`, `sped.protocolo.icms.aliquota` (729).
- Calendário: `sped.feriado` (611), `finan.dia.mes/semana/util`.
- `sped.apuracao.tabela` (11.236) — tabelas de código da apuração.

### 4c. Registros gerados de SPED — saída de obrigações fiscais

Cerca de 110 modelos `sped.registro.*` (0000, 0150, C100, C170, K200, etc.).
São o resultado gerado das apurações de SPED Fiscal/Contribuições. Dado
altamente especializado; fora do escopo de relatórios de negócio. Não
sincronizar na L1 (reavaliar se surgir demanda de auditoria fiscal).

### 4d. Views de árvore de análise (`.arvore`)

`contabil.conta.arvore` (4.955), `estoque.local.arvore` (836),
`finan.conta.arvore` (218) etc. São visões hierárquicas derivadas dos modelos
que já sincronizamos. Não precisam de sync próprio: a hierarquia se reconstrói
no fato a partir do modelo-base.

### 4e. Config e vazios

Maioria dos `contabil.*` (lançamento, depreciação, encerramento,
demonstração), `producao.*` (centro de trabalho, parâmetro de qualidade),
`estoque.norma.palete`, `pedido.cotacao` etc.: **0 registros**. O cliente não
opera esses processos. Não sincronizar.

### 4f. Abstratos

`sped.base`, `sped.*.base`, `sped.moeda`, `sped.pessoa`,
`sped.apuracao.auditoria*`: modelos abstratos do Odoo, sem tabela. Ignorar.

## 5. Domínios sem dado — sem mudança

- **RH:** o módulo `tauga_rh` está **desinstalado**. Os 19 modelos `rh.*`
  (holerite, ponto, contrato, férias, rubrica) existem só como metadados; não
  são tabelas reais e não retornam dado. RH segue não operado.
- **Produção:** `producao.processo` tem 1 registro, o resto vazio.
- **CRM:** a namespace `crm` nativa do Odoo tem só 2 modelos. O "CRM" do
  Tauga é o tipo `prospecto` dentro de `pedido.documento`.
- **Contábil:** só o plano de contas tem dado (`contabil.conta` 934,
  `contabil.conta.referencial` 2.204, ambos já sincronizados). Sem movimento.

## 6. Descoberta paralela: a API de escrita `tauga_api`

Durante o censo (a partir do script `teste_integracao_odoorpc_grupojht.py`
fornecido pela Tauga) confirmou-se o mecanismo oficial de escrita, relevante
para a F4 Onda 2:

- Toda transação de negócio do Tauga é um `pedido.documento` discriminado pelo
  campo `tipo` (45 valores: venda, compra, pdv, os, contrato, devolução,
  transferência, inventário, produção, faturamento, cobrança, etc.).
- A escrita semântica é o método `tauga_api_post`, roteado por um `url_api`
  configurado em `pedido.operacao` (campos `url_api`, `codigo_trata_dados_api`,
  `codigo_depois_post_api`, `codigo_depois_put_api`).
- Em produção **nenhum `pedido.operacao` tem `url_api` configurado**. Os
  endpoints de integração não existem na base de produção.

Conclusão para a escrita: as tools de escrita do MCP devem encapsular
`tauga_api_post` para documentos transacionais (a Tauga cuida da orquestração
fiscal) e `create`/`write`/`unlink` cru para dados mestres. Detalhamento fica
para a spec da F4 Onda 2 escrita, bloqueada pela base de teste.

## 7. Recomendação para a L1

Construir, na ordem de valor:

1. **Sincronizar (raw)** os modelos de 4a e a camada de referência de 4b.
2. **Fatos + tools de MCP** para os domínios novos com valor de negócio:
   tabela de preços, DF-e de entrada (compras/fornecedores), serviços.
3. **Camada de referência** (NCM, CFOP, CEST, CNAE, municípios, unidades,
   alíquotas) como raw consultável, usada para enriquecer as tools existentes
   (resolver códigos para descrições).
4. **Não** sincronizar: registros SPED gerados (4c), views de árvore (4d),
   modelos vazios (4e), abstratos (4f).

O recorte definitivo de modelos e tools é decidido na spec da L1.
