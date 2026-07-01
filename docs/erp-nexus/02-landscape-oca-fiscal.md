# 02, Landscape do open source fiscal brasileiro (OCA)

> Estado da arte da localização fiscal/contábil brasileira para Odoo em código
> aberto, em meados de 2026. Onde é forte, onde é frágil, e qual o esforço real de
> colocar em produção. Fonte: varredura de GitHub/OCA/PyPI/comunidade.

## TL;DR

1. Existe uma base open source real, madura e ativíssima: o **OCA `l10n-brazil`**.
   Emite NF-e, CT-e, MDF-e e NFS-e, tem motor fiscal próprio, SPED ECD, CNAB e
   contabilidade. Não se constrói do zero, pega-se isso.
2. Não é "plug and play". É um **toolkit de integrador**. A maturidade varia muito
   **por versão do Odoo** (16.0 é a referência) e **por domínio** (emissão é
   forte; NFS-e, EFD, ECF, Reinf, e-Social são fracos, fragmentados ou abandonados).
3. **Reforma Tributária (IBS/CBS/IS) ainda não tem módulo liberado**, só PRs
   abertos. É o maior risco técnico do projeto.
4. **O ERP da Tauga não é OCA**: é a linhagem pré-OCA `sped.*`, congelada. Sair
   dela para o OCA é re-platform, não upgrade (ver seção 8).

## 1. OCA `l10n-brazil`: o projeto

- Repositório: [github.com/OCA/l10n-brazil](https://github.com/OCA/l10n-brazil)
- Licença: **AGPL-3.0**
- Origem: código nasceu em **2009** no OpenERP (Launchpad); GitHub desde 2013.
  Manifests carregam `Copyright (C) 2009 - TODAY Renato Lima - Akretion`.
- Saúde: ~342 stars, ~312 forks, último push **30/06/2026**. Muito vivo (commits
  diários em junho/2026).
- Mantenedores núcleo: Renato Lima (Akretion), Raphaël Valyi (Akretion), Magno
  Costa (Akretion), Luís Felipe Mileo (KMEE), Marcel Savegnago (Escodoo), Antônio
  Pereira Neto (Engenere). Ver [03-empresas-ecossistema.md](03-empresas-ecossistema.md).

### Maturidade por versão do Odoo (contraintuitivo e importante)

| Branch Odoo | Nº addons | Estado | Observação |
|---|---|---|---|
| **16.0** | **62** | **Maduro, referência de produção** | `l10n_br_fiscal 16.0.21.3.1` (21 releases maiores). Tudo presente. **É aqui que se implanta hoje.** |
| 17.0 | 49 | Sólido, reduzido | Re-migração pesada; faltam CNAB, vários submódulos, SPED ECD. |
| 18.0 | 37 | **Migração incompleta** | Tem motor fiscal, NF-e e NFS-e. **Mas CT-e e MDF-e ainda não migrados** (só `*_spec`), nem account_nfe, nem CNAB. |
| 19.0 | 8 | Recém-iniciado | Só HR, due_list, COA. Nada fiscal ainda. |

**Implicação:** para produção fiscal séria hoje, o alvo realista é **Odoo 16 +
OCA 16.0**, não a última versão do Odoo. Isso derruba a ideia de "misturar o
cálculo do 16 com a UI do 18/19": módulos não são portáveis entre versões maiores
do Odoo (a cada versão muda ORM, framework e camada web/OWL). Escolhe-se **uma**
versão e tudo vive nela. Além disso, os recursos de IA do Odoo 18/19 são
majoritariamente **Enterprise (proprietário)**, indisponíveis no Community.

### Módulos principais (branch 16.0)

**Base:** `l10n_br_base` (CNPJ/CPF, IE, endereçamento), `l10n_br_zip` (CEP),
`l10n_br_cnpj_search` (ReceitaWS/SerPro), `l10n_br_coa`/`l10n_br_coa_generic`/
`l10n_br_coa_simple` (planos de contas), `l10n_br_currency_rate_update`.

**Motor fiscal (o coração):** `l10n_br_fiscal` (16.0.21.3.1). Conceito-chave do
OCA: o **documento fiscal (`l10n_br_fiscal.document`) é independente da fatura
(`account.move`)**. CFOP, CST/CSOSN, NCM, CEST, ICMS/ICMS-ST/IPI/PIS/COFINS/ISS,
posições e operações fiscais. É o que torna o OCA modular e migrável (diferente do
`sped.*` monolítico da Tauga). Complementos: `l10n_br_fiscal_certificate`
(certificado A1), `l10n_br_fiscal_dfe` (manifestação), `l10n_br_fiscal_edi`
(transmissão), `l10n_br_fiscal_closing` (fechamento).

**Documentos eletrônicos:** `l10n_br_nfe` (+ `_spec`), `l10n_br_cte` (+ `_spec`),
`l10n_br_mdfe` (+ `_spec`), `l10n_br_nfse` (+ `l10n_br_nfse_focus`),
`l10n_br_account_nfe`, `l10n_br_delivery_nfe`.

**Financeiro/cobrança:** `l10n_br_account` (lançamentos e faturamento BR),
`l10n_br_account_payment_order` + `l10n_br_cnab_structure` (CNAB remessa/retorno),
`l10n_br_account_payment_brcobranca` (boletos via lib Ruby BRCobranca),
`l10n_br_account_withholding` (retenções).

**SPED:** `l10n_br_sped_base` (framework), `l10n_br_sped_ecd` (ECD, o único SPED
efetivamente mergeado no 16.0).

**Logística/comercial:** `l10n_br_stock`, `l10n_br_stock_account`,
`l10n_br_purchase(_stock)`, `l10n_br_sale(_stock)`.

## 2. Bibliotecas Python de base (a "cola" com a SEFAZ)

O OCA não fala com a SEFAZ direto: delega a libs independentes.

| Lib | Versão / data | Mantenedor | Estado |
|---|---|---|---|
| **nfelib** | 2.5.2, mar/2026 | Akretion (Valyi) | **Vivo e central.** Bindings XML (xsdata) de NF-e, NFS-e nacional, CT-e, MDF-e, BP-e. **Licença MIT.** |
| **erpbrasil.edoc** | v3.1.1, jan/2026 | Renato Lima / Valyi | **Vivo.** Monta, assina, transmite e consulta na SEFAZ. |
| **erpbrasil.assinatura** | 1.8.0, ago/2025 | KMEE/erpbrasil | Vivo. Assinatura A1/A3. |
| **erpbrasil.transmissao** | 1.1.0, ago/2023 | erpbrasil | Estável (infra SOAP). |
| **brazilfiscalreport** | ativo (2026) | comunidade | Geração de PDF (DANFE/DACTE/DAMDFE). |
| **BRCobranca** (Ruby) | ativo | comunidade | Boletos, via `l10n_br_account_payment_brcobranca`. |
| PyTrustNFe / PySPED / python-sped | ~2020 | Trustcode / comunidade | **Legado/abandonado** (geração anterior). |

O stack `nfelib` + `erpbrasil.*` está saudável e mantido pelos mesmos núcleos do
OCA. A geração antiga (que a Tauga usa) está morta.

## 3. Cobertura fiscal real

| Documento | OCA emite hoje? | Realidade |
|---|---|---|
| **NF-e (mod. 55)** | **Sim, robusto** | Núcleo maduro. Assinatura, transmissão, manifestação, carta de correção, cancelamento. |
| **NFC-e (mod. 65)** | Fraco | Sem módulo dedicado forte no OCA. Aqui o Enterprise+Avalara (POS nativo) leva vantagem. |
| **CT-e** | Sim (16.0/17.0; não no 18.0) | Maduro no 16.0. Relevante ao perfil logística do cliente. |
| **MDF-e** | Sim (16.0/17.0; só spec no 18.0) | Idem. |
| **NFS-e** | **Fragmentado/fraco** | Maior buraco. Cada município tem padrão próprio. Saída pragmática (`l10n_br_nfse_focus`) depende de gateway pago (FocusNFE). |
| **NFS-e Padrão Nacional** | Chegando, ainda em PR | `l10n_br_nfse_nacional` em PRs abertos (POC/ADD), não mergeado. |

**Emissão de NF-e/CT-e/MDF-e é o forte.** NFS-e é o calcanhar de Aquiles. NFC-e em
PDV também é fraco.

## 4. SPED e obrigações acessórias

| Obrigação | Estado no OCA |
|---|---|
| **ECD** | **Mergeado (16.0)**, o SPED mais completo. |
| **EFD ICMS/IPI** | WIP, em PR (não mergeado no estável). |
| **EFD Contribuições (PIS/COFINS)** | WIP, em PR. |
| **ECF** | Ausente. |
| **EFD-Reinf** | Abandonado (só PRs antigos fechados). |
| **e-Social** | Abandonado (só modelos de RH). |

O OCA gera ECD hoje. EFD ICMS/IPI e Contribuições existem como PRs (dependem de
esforço para produção e validação contra o PVA). **ECF, Reinf e e-Social são
buracos reais**, normalmente terceirizados (TecnoSpeed, Tegra, ou PVA manual).

## 5. Reforma Tributária (IBS/CBS/IS): o maior risco

**Estado (meados de 2026): a comunidade sabe o que fazer e está codando, mas não
há módulo OCA liberado e testado de IBS/CBS.**

- Discussão-guia oficial: [OCA/l10n-brazil #4237](https://github.com/OCA/l10n-brazil/discussions/4237).
- Motor de cálculo IBS/CBS/IS: **PR aberto, não mergeado**,
  [#4299](https://github.com/OCA/l10n-brazil/pull/4299) (16.0). É o coração da
  reforma e ainda está em revisão.
- Documentos adaptados (todos em PR): CT-e com IBS/CBS, NFS-e nacional com campos
  de reforma, plano de contas ITG-1000/2022.
- CNPJ Alfanumérico (exigência 2026): em adição
  ([#4636](https://github.com/OCA/l10n-brazil/pull/4636)).
- Ofertas comerciais: KMEE e Escodoo anunciam pacotes de reforma.

**Timeline da transição (LC 214/2025):** 2026 é ano de teste/convivência (CBS
0,9%, IBS 0,1%, dado já exigido no XML da NF-e); 2027 CBS "de verdade", extingue
PIS/COFINS; 2029-2032 transição ICMS/ISS → IBS; 2033 IBS/CBS plenos. O impacto no
motor de cálculo é **estrutural**.

**Conclusão:** quem for para produção fiscal em 2026 sobre OCA vai depender de PRs
não mergeados (risco de regressão) **ou** de um integrador comercial que empacote
isso. Assumir o núcleo fiscal por conta própria bem na virada da reforma é o pior
momento possível para não ter especialista. **Argumento mais forte a favor de um
integrador OCA no motor fiscal.**

## 6. Forks e alternativas fora do OCA

**Não existe fork comunitário mais avançado que o OCA master.** O ecossistema
convergiu no OCA. As empresas (Akretion, KMEE, Escodoo, Engenere) mantêm forks
internos apenas como staging de PRs; o destino é sempre o OCA upstream. "Além do
OCA" existem **serviços** (integradores) e **APIs SaaS de emissão** (Nuvem Fiscal,
TecnoSpeed, FocusNFE, Avalara) que se plugam no OCA quando se quer terceirizar a
parte de SEFAZ. Não perca tempo procurando um fork mágico: ele não existe.

## 7. Odoo Enterprise BR (parceria Odoo/Avalara)

Desde v16/17, o Enterprise BR **não usa o OCA**: usa módulos próprios que delegam
cálculo de imposto E emissão para a **Avalara (AvaTax Brazil)** via créditos IAP
(In-App Purchase). Cobre NF-e, NFS-e e **NFC-e em PDV nativo** (ponto forte vs
OCA). Trade-offs: setup mais simples e suportado pela Odoo SA, porém **caixa-preta**
(a lógica fiscal vive na Avalara), **custo por documento** (cada cálculo/emissão
consome crédito) e menos controle/customização. Para o perfil do cliente
(logística, muito CT-e/MDF-e), o **OCA tende a encaixar melhor** que o pacote
Avalara (mais orientado a venda/varejo). Doc oficial:
[Odoo Brazil localization](https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations/brazil.html).

## 8. A linhagem `sped.*` da Tauga: identificada e morta

O achado da perícia (ver [01](01-pericia-instancia-tauga.md)) foi cruzado com a
pesquisa e a linhagem foi identificada com precisão:

**É a primeira geração da localização brasileira Odoo, o projeto "odoo-brazil" /
"Odoo Brasil SPED"** (org [github.com/odoo-brazil](https://github.com/odoo-brazil)),
da era KMEE + Akretion + Trustcode + ThinkOpen (Odoo 8-12). Repos-chave:

- [odoo-brazil/odoo-brazil-eletronic-documents](https://github.com/odoo-brazil/odoo-brazil-eletronic-documents),
  "Odoo SPED: NF-e, NFS-E, NFC-E, CT-E". Branches 7.1/8.0/10.0, último push
  **2018-11**. É o núcleo `sped.*`.
- [odoo-brazil/l10n-brazil](https://github.com/odoo-brazil/l10n-brazil), cemitério
  de migração (branches `12.0-mig-l10n_br_contabilidade`, `12.0-mig-sped_efdreinf`,
  `12.0-mig-sped_esocial`...), último push **2023-08**. Daqui saem os `contabil.*`,
  `finan.*` e `reinf.*` do cliente.

A filosofia dessa geração era **"SPED-first"**: modelar os registros do SPED
diretamente como modelos Odoo em português. A instância da Tauga é uma
customização proprietária sobre essa base (por isso até `sale`/`stock` viraram
`pedido`/`estoque`).

**Por que a comunidade abandonou o `sped.*` e foi para o `l10n_br_fiscal`:**
1. O approach `sped.*` era monolítico e acoplado, amarrado ao layout SPED, e
   **quebrava a cada upgrade do Odoo** (a explosão de branches `*-mig-*` prova isso).
2. A partir do Odoo 12, o core amadureceu, permitindo o conceito do OCA:
   `l10n_br_fiscal.document` **independente do `account.move`**, desacoplando
   fiscal de contábil e tornando a localização modular e migrável.
3. Governança: o OCA impôs testes, CI, code review e releases versionadas. As
   mesmas pessoas (Mileo/KMEE, Valyi/Akretion, Renato Lima) migraram para o OCA.

**Está vivo?** Não. Congelado no Odoo 8-14, sem atividade relevante desde
~2019-2023. Não tem Odoo 16+, não tem reforma tributária, não tem NFS-e nacional,
não tem CNPJ alfanumérico. Tecnicamente e legalmente defasado.

**Migrar de `sped.*` para OCA é upgrade ou re-platform?** **Re-platform**,
confirmado. Não há caminho de upgrade: os modelos de dados são incompatíveis por
design (`sped.documento`/`finan.lancamento`/`contabil.conta` vs
`account.move`/`l10n_br_fiscal.document`). É implantar um Odoo novo e migrar dados
via ETL. Some-se a isso que a customização é da Tauga (não temos o código), o que
reforça o re-platform.

## 9. Veredito: forte, frágil, e esforço real

**Forte (pode confiar):** emissão de NF-e/CT-e/MDF-e no OCA 16.0; motor fiscal
desacoplado e migrável; CNAB/boletos; ECD; libs de base (nfelib, erpbrasil)
vivas; comunidade ativíssima.

**Frágil (planejar contingência):** NFS-e (fragmentação municipal + nacional em
PR); NFC-e em PDV; EFD ICMS/IPI e Contribuições (PRs não mergeados); ECF/Reinf/
e-Social (buracos); **Reforma Tributária (só PR, sem release)**; versões novas do
Odoo (18/19 incompletas → produção = Odoo 16).

**Esforço real: médio-alto, exige integrador especialista.** Um projeto realista
envolve: (1) Odoo 16 + addons OCA + libs pip, em imagem própria; (2) certificado
A1, homologação SEFAZ, cadastro fiscal denso (NCM/CFOP/CST/CEST, posições
fiscais); (3) testes E2E de emissão contra homologação; (4) estratégia para os
buracos (NFS-e, SPED acessório, reforma); (5) no caso Tauga, a migração de dados
re-platform. Ver [07-roadmap-e-fases.md](07-roadmap-e-fases.md).
