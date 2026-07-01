# 06, Reúso de repositórios (Akretion e KMEE)

> O que as duas maiores casas do ecossistema OCA BR publicaram de código aberto
> que o ERP Nexus pode reutilizar, o estado de manutenção de cada coisa, e um
> comparativo entre o `mcp-fiscal-brasil` e o nosso servidor MCP. Fonte: API do
> GitHub, READMEs, manifests, datas de push (conferidas jun-jul/2026).

## O maior ganho: `akretion/nfelib` (MIT)

| | |
|---|---|
| Repo | [github.com/akretion/nfelib](https://github.com/akretion/nfelib) |
| O que faz | Bindings Python para ler/gerar XML de **NF-e, NFS-e nacional, CT-e, MDF-e, BP-e**. Gera o código automaticamente com **xsdata** a partir dos XSD oficiais da Fazenda. |
| Licença | **MIT** |
| Estado | 200★, 69 forks, push maio/2026. Mantido. PyPI. |
| Por que serve | Biblioteca de referência para parse/geração de XML fiscal (`Nfe.from_path(...)`, `.to_xml()`). **Desacoplada do Odoo**, dá para usar num worker Python ou microserviço próprio. É a base sobre a qual o OCA roda. |

Sendo **MIT**, é o ativo mais reutilizável do levantamento: cabe direto no L1/L2
sem arrastar o Odoo junto e sem restrição de copyleft.

## `mcp-fiscal-brasil`: o original é da DeHor-Labs, não da KMEE

**Ponto contraintuitivo:** o [kmee/mcp-fiscal-brasil](https://github.com/kmee/mcp-fiscal-brasil)
é um **fork parado**. O projeto real é
[DeHor-Labs/mcp-fiscal-brasil](https://github.com/DeHor-Labs/mcp-fiscal-brasil).

| | |
|---|---|
| O que é | "Servidor MCP fiscal brasileiro: CNPJ, NF-e, NFS-e, CT-e, SPED, eSocial, Simples Nacional, Reforma 2026. **44 tools**, zero-cadastro, tabelas offline. Python." |
| Licença | **MIT** |
| Estado | 118★, 23 forks, criado mar/2026, push jun/2026. Ativo. |
| Conexão | **Não toca Odoo.** Fontes são APIs **públicas** (BrasilAPI, ReceitaWS, webservices SEFAZ) + tabelas fiscais offline empacotadas. |
| Transporte | stdio (não HTTP). Distribuído via uvx/PyPI/Docker. Também é SDK Python. |
| Certificado A1 | opt-in, mTLS + XMLDSig **localmente**, sem enviar o certificado a servidor. |

Arquitetura: `Cliente MCP → mcp-fiscal-brasil → CNPJ | NFe | NFSe | Simples | SPED
| eSocial | Certidões`.

Amostra das tools: `consultar_cnpj`, `consultar_simples_nacional`,
`validar_chave_nfe`, `consultar_status_sefaz`, `parse_nfe_xml`, `gerar_danfe`
(PDF), e as **agênticas compostas** `analyze_cnpj_compliance`,
`risk_score_supplier`, `compare_tax_regimes`, `validate_nfe_full`,
`summarize_sped`; com certificado: `baixar_nfe_distribuicao`, `manifestar_nfe`.

## Outros repositórios úteis

| Repo | O que faz | Licença | Estado |
|---|---|---|---|
| [akretion/akaidoo](https://github.com/akretion/akaidoo) | CLI que comprime um addon Odoo (deps + data model) para caber no contexto de um LLM, com orçamento de tokens. | MIT | Ativo (jun/2026) |
| [akretion/odoo-import-helper](https://github.com/akretion/odoo-import-helper) | Módulos de ajuda a import de dados no Odoo. | AGPL-3 | Ativo (jun/2026) |
| [akretion/account-move-import](https://github.com/akretion/account-move-import) | Importa lançamentos contábeis (account.move). | AGPL-3 | Ativo (jun/2026) |
| [akretion/bank-statement-import-api](https://github.com/akretion/bank-statement-import-api) | Importa extrato bancário via API. | AGPL-3 | Ativo (jun/2026) |
| [kmee/kmee-odoo-addons](https://github.com/kmee/kmee-odoo-addons) | Incuba módulos OCA da KMEE. | LGPL-2.1 | Ativo (jun/2026) |
| [kmee/boleto_cnab_api](https://github.com/kmee/boleto_cnab_api) | API server para brcobranca (boleto/CNAB). | fork | 2024 |
| `spec_driven_model` (em OCA/l10n-brazil) | Gera models abstratos do Odoo a partir dos XSD (via nfelib/xsdata). Autoria rvalyi. | AGPL/LGPL | Vivo no OCA |

**Legado/arqueologia (reusar a ideia, não o código):** akretion/ooorest,
connector-import-data, base-import-mapping, synchronizer (era v7/v8); libs KMEE
cnab240, pyboleto, PyNFe, python-sped (2017-2019); todo o perfil `renatonlima`
(repos 2013-2021). O perfil `rvalyi` pessoal não tem nada novo relevante (o
trabalho fiscal vive na org Akretion e no OCA).

## Migração de dados: não há atalho pronto

**Não existe ferramenta turnkey** para o caso específico (modelos custom em
português `sped.*`/`finan.*` de uma implantação de terceiros → OCA). O que há:

- **Genéricas de import Odoo** (Akretion: odoo-import-helper, account-move-import,
  base-import-mapping, connector-import-data): ajudam no **destino** (escrever no
  Odoo novo), não no de-para dos modelos custom.
- **[OpenUpgrade (OCA)](https://github.com/OCA/OpenUpgrade):** serve para upgrade
  entre versões do **mesmo** Odoo, não para remapear `sped.*` custom em modelos
  OCA. **Não resolve o caso.**

**Conclusão prática:** o de-para dos modelos custom tem que ser **ETL escrito à
mão**. A **extração** já está resolvida pelo projeto (JSON-RPC → cache Postgres). O
cache Postgres já mapeado é o maior ativo de migração. Ver
[07-roadmap-e-fases.md](07-roadmap-e-fases.md).

## `mcp-fiscal-brasil` vs. o MCP próprio do Nexus (TS)

| Dimensão | DeHor-Labs/mcp-fiscal-brasil | MCP do Nexus (TS, @modelcontextprotocol/sdk) |
|---|---|---|
| Linguagem/transporte | Python, **stdio**, via uvx/PyPI. Roda local no cliente MCP. | TS, **Streamable HTTP**, servidor remoto (n8n, WhatsApp). |
| Fonte de dados | APIs **públicas** (BrasilAPI, SEFAZ). **Não toca ERP.** | **Cache Postgres** do Odoo (dado privado da operação). Escopos **complementares**. |
| Segurança/RBAC | Zero-cadastro, sem multi-tenant, sem RBAC. | **RBAC 7 camadas**, tenant scoping, identidade por userId, audit log. |
| Modelo de tools | Atômicas + **agênticas compostas** (veredito pronto). | Tools semânticas de negócio, cada uma TS validada/testada. |

**O que aprender/aproveitar dele:**
1. **Tools agênticas compostas** (`risk_score_supplier`, `summarize_sped`): tools
   de alto nível que já entregam um veredito, não só dado cru.
2. **Complementaridade de fontes:** o nosso lê o **interno** (Odoo cache); o
   fiscal-brasil cobre o **externo público** (validar CNPJ de fornecedor, Simples,
   status SEFAZ, DANFE). Reusar as tools públicas (MIT) fecha o lado externo sem
   reimplementar BrasilAPI/SEFAZ.
3. **Certificado A1 local:** manter certificado e assinatura no cliente, nunca no
   servidor.

**Onde o Nexus já é superior:** RBAC de 7 camadas, multi-tenant, audit, transporte
HTTP para agente remoto. O `mcp-fiscal-brasil` é uma vertical de consulta pública
single-user, não uma plataforma de produto. A nossa arquitetura (TS + tools
semânticas + RBAC) é a correta; o projeto fiscal serve como **catálogo de tools
externas a copiar**, não como substituto.

## Resumo de uma linha

O maior ganho concreto é **nfelib (MIT)** para todo o XML fiscal, com
**mcp-fiscal-brasil (MIT)** como fonte de tools de dados fiscais públicos que
complementam o cache interno; a migração de `sped.*`/`finan.*` continua sendo ETL
próprio (sem atalho pronto na Akretion ou KMEE); e o servidor MCP do Nexus já é
arquiteturalmente mais maduro que qualquer MCP dessas duas orgs.
