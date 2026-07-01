# 01, Perícia da instância Tauga

> Análise forense do ERP que o cliente usa hoje, feita a partir do dump de schema
> extraído pela fase de discovery (F0) via JSON-RPC, sem acesso ao banco de dados.
> **Objetivo:** saber sobre que base a Tauga construiu, para dimensionar o esforço
> real de sair dela.

## Como o dado foi obtido

O único acesso que temos ao Odoo da Tauga (`grupojht.tauga.online`) é a **API
JSON-RPC** (usuário + senha). Não há acesso ao banco Postgres do Odoo. A fase de
discovery exportou os metadados do Odoo (a introspecção que o próprio Odoo expõe
sobre si: `ir.model`, `ir.model.fields`, `ir.model.data`, `ir.cron`,
`ir.actions.server`, `ir.sequence`, etc.). Esses arquivos estão em
`discovery/odoo-schema/raw/` e `discovery/odoo-schema/`.

## Os números da instância (fonte: `discovery/odoo-schema/stats.json`)

| Métrica | Valor |
|---|---|
| Modelos (`ir.model`) | **652** |
| Campos (`ir.model.fields`) | **36.532** |
| XML IDs (`ir.model.data`) | **106.899** |
| Selections (`ir.model.fields.selection`) | 6.368 |
| Sequences (`ir.sequence`) | 73 |
| Crons (`ir.cron`) | 38 |
| Server actions (`ir.actions.server`) | 43 |

Um Odoo base tem por volta de 350-400 modelos. Os 652 indicam uma instalação
robusta, com muitos módulos. A questão decisiva não é o volume, e sim **de que
natureza** são esses modelos.

## Achado central: não é Odoo padrão, nem OCA

A "impressão digital" de um Odoo se lê pelos **namespaces dos modelos**. Num Odoo
padrão (ou OCA) você encontraria `account.move`, `stock.move`, `sale.order`,
`purchase.order`, e, na localização OCA, `l10n_br_fiscal.document`. 

**Na instância da Tauga existem ZERO desses.** A varredura dos 652 modelos
retornou:

- `l10n_br` (localização OCA): **0 modelos**
- `l10n_` (qualquer localização): **0 modelos**
- `account.*` (contábil/fiscal padrão): **0 modelos**
- `stock.*`: **0 modelos**
- `sale.*` / `purchase.*`: **0 modelos**

Em vez disso, **todo o modelo de dados foi reescrito em namespaces próprios, em
português.** A distribuição dos prefixos de modelo (fonte: `stats.json` e análise
do `Models (ir.model).xlsx`):

| Namespace | Modelos | O que é |
|---|---|---|
| **`sped.*`** | **256** | O motor fiscal inteiro |
| `ir.*` | 70 | Infraestrutura do Odoo (padrão) |
| `finan.*` | 44 | Financeiro |
| `mail.*` | 42 | Mensageria (padrão) |
| `contabil.*` | 29 | Contábil |
| `res.*` | 26 | Cadastros base (padrão) |
| `pedido.*` | 26 | Vendas / faturamento / contratos |
| `rh.*` | 19 | Recursos humanos / folha |
| `relatorio.*` | 19 | Relatórios |
| `estoque.*` | 16 | Estoque |
| `ks_dashboard_ninja.*` | 13 | App comercial de dashboards (Ksolves) |
| `wms.*` | 6 | Armazém |
| `producao.*` | 5 | Produção |
| `reinf.*` | 2 | EFD-Reinf |

### O motor fiscal `sped.*` (256 modelos)

É o coração do sistema. Exemplos reais de modelos encontrados:

- Apuração: `sped.apuracao`, `sped.apuracao.ecd`, `sped.apuracao.ipi`,
  `sped.apuracao.inventario`, `sped.apuracao.auditoria`
- Documentos eletrônicos: `sped.consulta.dfe`, `sped.dfe.importacao`,
  `sped.carta.correcao`
- Alíquotas: `sped.aliquota.icms.proprio`, `sped.aliquota.icms.st`,
  `sped.aliquota.ipi`, `sped.aliquota.pis.cofins`, `sped.aliquota.iss`,
  `sped.aliquota.inss`, `sped.aliquota.irpf`, `sped.aliquota.simples.*`
- Cadastros fiscais: `sped.participante`, `sped.cest`, `sped.certificado`,
  `sped.ibptax`, `sped.empresa`

Esse padrão (modelar diretamente os registros do SPED como modelos Odoo em
português, `sped.documento`, `sped.participante`, etc.) é a **assinatura da
primeira geração da localização brasileira**. Ver a identificação da linhagem em
[02-landscape-oca-fiscal.md](02-landscape-oca-fiscal.md).

### A camada de customização da Tauga

A análise do `ir.model.data` (os 106.899 XML IDs, que atribuem cada registro de
metadado a um módulo pelo prefixo do "Complete ID") revelou o peso da
customização proprietária:

| Módulo (prefixo do XML ID) | Registros | Natureza |
|---|---|---|
| **`tauga`** | **73.260** | Customização/configuração do implantador (68% de todo o metadado) |
| `__export__` | 26.178 | Registros criados por import/export (XML IDs auto-gerados) |
| `base` | 4.614 | Odoo core |
| `mail` | 1.439 | Odoo core |
| `ks_dashboard_ninja` | 727 | App comercial Ksolves |
| `tauga_auditoria` | 228 | Módulo de auditoria da Tauga |
| `ks_dn_advance` | 63 | Add-on do Ksolves |
| `grupojht` | 26 | Configuração específica do cliente |
| `tauga_rh` | 20 | RH da Tauga |
| `ACESSO_GRUPOJHT` | 4 | Controle de acesso do cliente |

O módulo `tauga` sozinho concentra **68% de todos os metadados**, o que confirma
que a maior parte da lógica de configuração e negócio vive numa **customização
proprietária do implantador**, cujo código-fonte não temos (ele roda no servidor
da Tauga; a API só expõe os dados, não o código Python).

## Prova de que é um ERP fiscal vivo e operante

Não é um Odoo de vitrine. Os **crons ativos** (fonte:
`Scheduled Actions (ir.cron).xlsx`) mostram uma operação fiscal completa rodando:

- **Consulta DF-e a cada 2 horas** (`sped.consulta.dfe`), com ciência automática
  de operação
- **Importação de XML (DF-e) a cada 5 minutos** (`sped.dfe.importacao`)
- **Apuração fiscal diária** (`sped.apuracao`)
- **Atualização diária de tabelas** IBPT (`sped.ibptax`), INSS
  (`sped.aliquota.inss`), IRPF (`sped.aliquota.irpf`), e tabelas SPED
- **Alerta de vencimento de certificado digital** (`sped.certificado`)
- **Integração bancária / boletos**: consulta de boletos via API a cada 6h,
  ajuste de situação de dívida diário (`finan.lancamento`)
- **Faturamento de contratos a cada 10 minutos** (`pedido.faturamento`)
- **Avanço de etapas de produção a cada 20-30 minutos**
  (`pedido.documento.avanca.etapa`)
- Controle de sessões de usuário, auditoria, fila de e-mail

As **sequences** confirmam a profundidade fiscal/contábil: numeração de
lançamento contábil normal/extemporâneo/encerramento, lotes de folha,
financeiro, fiscal, inventário, produção, venda, patrimônio; contas a pagar
(`DP-`) e a receber (`DR-`); devolução de compra/venda; entradas; inventário;
listas de material/kit; lotes e séries.

## O que temos e o que não temos, com precisão

### Temos
- **Os dados**, via JSON-RPC (leitura). É o que o cache Postgres do Nexus já
  extrai e mantém atualizado.
- **O schema inteiro mapeado**: 652 modelos, 36.532 campos, documentado na F0.
- **A infraestrutura Nexus** (cache, worker, MCP, Nex, dashboard) já rodando
  sobre esse dado.

### Não temos
- **O código-fonte do motor `sped.*`** (256 modelos de lógica fiscal). Vive no
  servidor da Tauga; a API não expõe código Python.
- **O código do módulo `tauga`** (68% do metadado) e demais módulos proprietários
  do implantador.
- **A configuração fiscal** (posições fiscais, regras de imposto, mapeamentos)
  como implementada por eles.
- **A lógica de cálculo** dos impostos, apuração e geração de SPED.

## Consequência estratégica

Sair da Tauga **não é migrar de versão nem exportar/importar**. É:

1. Partir para uma **base diferente e viva** (Odoo 16 + OCA `l10n-brazil`), cujo
   modelo de dados é **incompatível por design** com o `sped.*` (namespaces,
   filosofia e arquitetura distintas).
2. **Re-implantar** o ERP fiscal sobre essa base (configuração fiscal,
   homologação SEFAZ, plano de contas).
3. **Migrar os dados via ETL**, mapeando `sped.*` → `l10n_br_fiscal`, `finan.*` →
   `account.move`, `contabil.*` → contábil OCA, `pedido.*`/`estoque.*` → sale/stock.

O lado bom: já que nunca estivemos na OCA, ir para a OCA é partir para uma base
**limpa, modular e mantida pela comunidade**, em vez de continuar num fork que só
a Tauga entende. O lado trabalhoso: é um projeto de re-implantação com migração,
detalhado em [07-roadmap-e-fases.md](07-roadmap-e-fases.md).

## Sobre a relação Tauga ↔ Grupo JHT

`grupojht.tauga.online` é, com alta confiança, um **subdomínio de tenant** na
plataforma hospedada da Tauga (`tauga.online`): o Grupo JHT é **inquilino** de um
Odoo hospedado e operado pela Tauga. Isso casa com o acesso restrito a JSON-RPC,
sem banco. **Este é o lock-in operacional real:** não é de licença (o código é
livre), é de **hospedagem + know-how**. Ver [03-empresas-ecossistema.md](03-empresas-ecossistema.md)
e [04-licencas-e-legal.md](04-licencas-e-legal.md).

## Arquivos de referência (no repositório)

- `discovery/odoo-schema/stats.json`, estatísticas agregadas
- `discovery/odoo-schema/schema.json`, schema processado
- `discovery/odoo-schema/raw/Models (ir.model).xlsx`, lista de modelos
- `discovery/odoo-schema/raw/Fields (ir.model.fields).xlsx`, campos (1,2 MB)
- `discovery/odoo-schema/raw/Model Data (ir.model.data).xlsx`, XML IDs por módulo
- `discovery/odoo-schema/raw/Scheduled Actions (ir.cron).xlsx`, crons
- `docs/discovery/2026-05-28-gap-odoo-mcp.md`, análise de gaps da F0
