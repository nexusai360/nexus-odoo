# ERP Nexus, dossiê de viabilidade e estratégia

> Documentação de estudo para transformar a plataforma Nexus em um **ERP próprio
> comercializável**, usando Odoo Community + OCA l10n-brazil como motor fiscal,
> saindo da dependência do implantador atual (Tauga).
>
> **Status:** estudo de viabilidade (não é decisão executada). Nada aqui foi
> implementado. É material de apoio à decisão.
> **Data-base:** 01/07/2026.
> **Autoria:** sessão de pesquisa e perícia conduzida na branch `feat/nex-reconstrucao`.

---

## Sumário executivo (leia isto primeiro)

A pergunta que originou este estudo: *"com o acesso que temos hoje ao Odoo da
Tauga, dá para construir um ERP nosso, usando o que existe na OCA + nossos dados,
rebrandear como ERP Nexus e comercializar, continuando a receber as atualizações
da comunidade?"*

**Resposta curta: sim, é viável, é legal, e o embrião já existe (o cache + MCP +
Nex que já construímos). Mas não é o que parecia à primeira vista, e há três
verdades duras a respeitar.**

1. **A Tauga não roda OCA, roda um fork proprietário morto.** A perícia na
   instância provou que o ERP atual usa uma localização brasileira de primeira
   geração (namespace `sped.*` em português, linhagem pré-OCA congelada por volta
   de 2018-2019), não a OCA `l10n-brazil` moderna. Consequência: sair da Tauga é
   uma **re-implantação com migração de dados**, não um "copiar e colar". Ver
   [01-pericia-instancia-tauga.md](01-pericia-instancia-tauga.md).

2. **O caminho é legalmente sólido, com cinco regras.** Odoo Community é LGPL
   (permissivo), OCA l10n-brazil é AGPL (cumprível), Chatwoot é MIT (pode fechar).
   Dá para forkar, rebrandear como ERP Nexus, comercializar e receber updates da
   OCA para sempre, desde que: (1) a camada fiscal AGPL fique aberta com fonte
   disponível aos usuários; (2) a inteligência proprietária viva **acima da
   fronteira de API**, nunca como módulo que herda o fiscal; (3) o frontend seja
   um **processo separado** falando por JSON-RPC; (4) toda marca Odoo/Chatwoot
   seja removida; (5) **nenhuma linha do Odoo Enterprise** seja copiada. Ver
   [04-licencas-e-legal.md](04-licencas-e-legal.md).

3. **O calendário realista é de fases ao longo de bem mais que "4 meses".** O
   maior risco técnico é a **Reforma Tributária (IBS/CBS/IS)**, que em meados de
   2026 ainda não tem módulo OCA liberado (só PRs abertos) e cuja transição já
   começou. Por isso, um integrador OCA no núcleo fiscal é quase obrigatório. A
   estratégia de permanecer na Tauga até o projeto estar maduro está correta. Ver
   [07-roadmap-e-fases.md](07-roadmap-e-fases.md).

**O modelo de produto:** o Odoo (CE + OCA) vira o **motor fiscal invisível no
porão**; o **ERP Nexus** que o cliente vê é o nosso frontend Next.js + o cache +
o MCP + o agente Nex. A fronteira de rede (JSON-RPC) entre os dois é o que mantém
a joia proprietária **e** cumpre o AGPL ao mesmo tempo. Ver
[05-arquitetura-alvo.md](05-arquitetura-alvo.md).

---

## Índice dos documentos

| # | Documento | Conteúdo |
|---|---|---|
| 00 | [Visão e objetivo](00-visao-e-objetivo.md) | O sonho, o objetivo de negócio, o que é e o que não é este projeto |
| 01 | [Perícia da instância Tauga](01-pericia-instancia-tauga.md) | Análise forense do ERP atual: 652 modelos, o fork `sped.*`, evidências, o que temos e o que não temos |
| 02 | [Landscape OCA fiscal](02-landscape-oca-fiscal.md) | Estado da arte do open source fiscal BR: versões, módulos, cobertura, SPED, Reforma Tributária |
| 03 | [Empresas do ecossistema](03-empresas-ecossistema.md) | Akretion, KMEE, Escodoo, Engenere, Multidados, Trustcode, Tauga; a concentração de conhecimento (bus factor) |
| 04 | [Licenças e questões legais](04-licencas-e-legal.md) | LGPL, AGPL §13, MIT, fronteira de API, trademark, o caso Flectra, tabela do que pode e não pode |
| 05 | [Arquitetura-alvo](05-arquitetura-alvo.md) | O desenho do ERP Nexus em camadas, a fronteira proprietário/aberto, multi-tenant |
| 06 | [Reúso de repositórios](06-reuso-repositorios.md) | O que pegar da Akretion e KMEE: nfelib, mcp-fiscal-brasil, akaidoo, import helpers; comparativo de MCP |
| 07 | [Roadmap e fases](07-roadmap-e-fases.md) | Roadmap faseado, migração de dados (ETL), riscos, regras de ouro |
| 08 | [Fontes](08-fontes.md) | Todos os links e fontes consolidados |

---

## Aviso importante

Este dossiê contém **análise técnica de licenças open source**, não parecer
jurídico. Copyleft (sobretudo a cláusula de rede do AGPL) e direito de marca
envolvem interpretação. **Antes de comercializar**, validar com advogado de
propriedade intelectual/open source com experiência em SaaS e AGPL. Ver os
detalhes e as ressalvas em [04-licencas-e-legal.md](04-licencas-e-legal.md).
