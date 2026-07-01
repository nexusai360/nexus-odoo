# 04, Licenças e questões legais

> **AVISO IMPORTANTE.** Este documento é **análise técnica de licenças open
> source**, baseada nos textos reais dos arquivos `LICENSE` e nas FAQs oficiais.
> **NÃO é parecer jurídico.** Copyleft (sobretudo a cláusula de rede do AGPL) e
> direito de marca envolvem interpretação e jurisprudência. **Antes de
> comercializar, validar com advogado de propriedade intelectual/open source com
> experiência em SaaS e AGPL.** Os dois pontos a fechar com o advogado: a mecânica
> de cumprimento do AGPL §13 e a separação real de processos entre o frontend
> proprietário e o Odoo.

## Mapa das licenças por camada

| Camada | Licença real |
|---|---|
| Odoo Community (core) | **LGPL v3** (desde Odoo 9 / 2015; antes era AGPL) |
| OCA `l10n-brazil` (fiscal) | **AGPL v3** (por módulo, confirmado nos manifests) |
| Frontend Next.js (nosso) | **Proprietário** (nosso) |
| Chatwoot (atendimento) | **MIT** (core) + pasta `enterprise/` comercial |
| Odoo Enterprise | **Proprietário** (Odoo Enterprise Edition License) |
| Marca "Odoo" / "Chatwoot" | Marcas registradas (camada separada do código) |

## 1. Odoo Community = LGPL v3

Confirmado no `LICENSE` oficial ([github.com/odoo/odoo/blob/master/LICENSE](https://github.com/odoo/odoo/blob/master/LICENSE)):

> "Odoo is published under the GNU LESSER GENERAL PUBLIC LICENSE, Version 3
> (LGPLv3) [...]"

Até o Odoo 8 o core era **AGPL v3**. A partir do **Odoo 9.0 (2015)** foi
relicenciado para **LGPL v3** (e criado o Enterprise proprietário por cima). Como
a Tauga/OCA usa 16.0, o core está em **LGPLv3**.

**O que a LGPL permite (Seção 0):**

> "An 'Application' is any work that makes use of an interface provided by the
> Library [...] **Defining a subclass of a class defined by the Library is deemed a
> mode of using an interface provided by the Library.**"
> ([lgpl-3.0](https://www.gnu.org/licenses/lgpl-3.0.en.html))

Consequências para o core LGPL:
- **Pode** manter módulos e frontend proprietários por cima, **inclusive herdando
  classes do core** (é "uso de interface", não obra derivada da Library).
- A obrigação de copyleft recai **só sobre modificações no próprio core LGPL**.
- **Não há cláusula de rede na LGPL**: rodar o core LGPL modificado num SaaS não
  obriga a publicar nada aos usuários.

**O problema de copyleft não vem do core Odoo (LGPL, permissivo). Vem dos módulos
OCA l10n-brazil, que são AGPL.**

## 2. OCA l10n-brazil = AGPL v3 e a cláusula de rede

Confirmado no `LICENSE` ([OCA/l10n-brazil](https://github.com/OCA/l10n-brazil/blob/16.0/LICENSE))
e no header de cada módulo. Exemplo real (`l10n_br_fiscal/__manifest__.py`):

```python
# Copyright (C) 2013  Renato Lima - Akretion
# License AGPL-3 - See http://www.gnu.org/licenses/agpl-3.0.html
{ "name": "Módulo fiscal brasileiro", "license": "AGPL-3",
  "author": "Akretion, Odoo Community Association (OCA)", ... }
```

### AGPL Seção 13, a cláusula de rede (o ponto que muda tudo em SaaS)

> "**13. Remote Network Interaction [...] if you modify the Program, your modified
> version must prominently offer all users interacting with it remotely through a
> computer network [...] an opportunity to receive the Corresponding Source of your
> version [...] at no charge [...]**"
> ([agpl-3.0, §13](https://www.gnu.org/licenses/agpl-3.0.en.html))

Na prática, para o ERP Nexus:
- O AGPL fecha a "brecha SaaS" da GPL. **Acessar o software pela rede já dispara a
  obrigação** de fornecer o fonte (mesmo sem entregar binário).
- **Gatilho:** "if you modify the Program". Se você modificar um módulo AGPL e
  disponibilizá-lo pela rede (o SaaS), precisa **oferecer o Corresponding Source
  da sua versão modificada a todos os usuários que interagem pela rede**, de graça,
  por meio padrão (link/repositório visível na aplicação).
- **O que NÃO precisa abrir:** programas separados que apenas conversam com o
  software AGPL à distância (o frontend Next.js, ver seção 3).
- **Postura segura:** assumir que os módulos AGPL e suas modificações neles serão
  publicáveis, e desenhar o produto para que isso não vaze nada proprietário. (Na
  prática, quase não dói: a camada fiscal OCA já é pública.)

### Módulo custom que herda de módulo AGPL vira AGPL?

**Sim.** Módulos Odoo são plug-ins carregados no mesmo processo Python, que
herdam classes (`_inherit`), chamam métodos e compartilham o ORM. Pela FSF:

> "If the program dynamically links plug-ins, and they make function calls to each
> other and share data structures, we believe they form a single program [...] the
> main program must be released under the GPL or a GPL-compatible free software
> license [...]"
> ([GPL FAQ, #GPLPlugins](https://www.gnu.org/licenses/gpl-faq.html))

Logo: um módulo custom que **herda/depende** de um módulo AGPL é obra
derivada/combinada → **AGPL**. Um módulo que depende **só do core LGPL** (sem
tocar AGPL) **pode ser proprietário**.

> **Regra de ouro:** não coloque a inteligência proprietária como módulo Odoo que
> estende o fiscal AGPL. Coloque-a **acima da fronteira de API** (no cache, no
> MCP, no frontend Nexus).

## 3. A fronteira de API (o ponto CRÍTICO que viabiliza o produto)

**Pergunta:** o frontend Next.js proprietário, que conversa com os módulos AGPL
**só por JSON-RPC/rede (arm's length)**, é obra derivada contaminada, ou pode ser
proprietário?

**Resposta (interpretação padrão da FSF): é "mera agregação", NÃO obra combinada,
e PODE permanecer proprietário e fechado.** Base:

> "[...] **pipes, sockets and command-line arguments are communication mechanisms
> normally used between two separate programs.** So when they are used for
> communication, the modules normally are separate programs. But if the semantics
> of the communication are intimate enough, exchanging complex internal data
> structures, that too could be a basis to consider the two parts as combined [...]"
> ([GPL FAQ, #MereAggregation](https://www.gnu.org/licenses/gpl-faq.html))

E a GPL v3 (Seção 5, embutida no `LICENSE` do Odoo):

> "[...] a covered work [...] with other separate and independent works [...] is
> called an 'aggregate' [...]. **Inclusion of a covered work in an aggregate does
> not cause this License to apply to the other parts of the aggregate.**"

Aplicando ao ERP Nexus:
- Frontend Next.js em **processo/host separado**, falando por **JSON-RPC (sockets
  HTTP)** com a API pública do Odoo (`search_read`, `create`, `write`, métodos
  expostos) = **dois programas separados** → **agregação** → frontend **pode ficar
  proprietário e fechado**.
- **A ressalva "intimate enough":** JSON-RPC sobre API pública padronizada é
  comunicação cliente/servidor, não troca de estruturas internas de memória. Pesa
  fortemente a favor de "programas separados".
- **O que NÃO fazer:** embutir o frontend no processo Odoo, importar código Python
  AGPL no build do frontend, empacotar tudo como uma obra só. Um "wrapper"
  proprietário no mesmo processo **não** descontamina (FSF `#GPLWrapper`). A
  proteção é o frontend ser **genuinamente um processo separado falando por rede**.

**Resumo:** o AGPL alcança os módulos fiscais AGPL e as modificações neles, **não**
o cliente que os consome à distância. Sua joia (UX, IA, marca) fica proprietária.

## 4. Trademark do Odoo

- **A licença de código (LGPL) NÃO concede direito de marca.** "Odoo" é marca
  registrada da Odoo SA (USPTO nº 4911927). Poder copiar/vender o **código** não dá
  direito de usar o **nome/logo "Odoo"**.
- **NÃO pode** num fork rebrandeado comercial: chamar o produto de "Odoo", usar o
  logo, manter "Powered by Odoo", ou sugerir endosso/origem Odoo. O rebranding deve
  **remover** as marcas Odoo da interface (footer, título, favicon, e-mails).
- **PODE** comercializar um fork rebrandeado sobre o Community (LGPL), com marca
  própria ("Nexus"), removendo o nome/logo Odoo. Página oficial:
  [odoo.com/page/brand-assets](https://www.odoo.com/page/brand-assets).

### O caso Flectra (o precedente a estudar)

Flectra é um fork do Odoo Community que rebrandeou (marca própria). **O problema
jurídico dela NÃO foi o rebranding nem o uso do Community: foi terem copiado
código do Odoo Enterprise (proprietário) para dentro do fork.** Resultado: DMCA
takedown no GitHub (dez/2017) + injunção na Índia; caso encerrado por acordo em
2018.

> **Lição para o ERP Nexus:** rebrandeie à vontade sobre Community (LGPL) + OCA
> (AGPL cumprida), com marca própria. **JAMAIS copie qualquer código do Odoo
> Enterprise para dentro do fork.** Reimplementar uma funcionalidade do zero (sem
> olhar o código Enterprise) é permitido; copiar, não.

Fontes: [odoo.com/page/flectra-vs-odoo](https://www.odoo.com/page/flectra-vs-odoo-flectrahq-enterprise),
[flectrahq.com/the-great-copyright-suit](https://flectrahq.com/the-great-copyright-suit-of-odoo-vs-flectra-and-the-conclusion).

## 5. Odoo Enterprise = proprietário, NÃO pode entrar no fork

- O Enterprise é proprietário (Odoo Enterprise Edition License, OEEL); o repo
  `odoo/enterprise` é privado. A OEEL proíbe publicar, distribuir, sublicenciar ou
  vender cópias; uso atrelado a subscrição paga válida.
- **Fronteira CE vs Enterprise:** repositórios separados. Community aberto em
  `github.com/odoo/odoo` (LGPLv3); módulos Enterprise no repo privado
  `odoo/enterprise` (accounting full, studio, marketing automation, sign, etc.),
  com `license` proprietário no manifest.
- **Regra:** o fork usa **somente** Community (LGPL) + OCA + módulos próprios.
  Nenhum módulo, snippet ou funcionalidade do Enterprise pode ser copiado ou
  portado.

## 6. Chatwoot = MIT (core) + `enterprise/` comercial

Confirmado no `LICENSE` ([chatwoot/chatwoot](https://github.com/chatwoot/chatwoot/blob/develop/LICENSE)):

> "[...] All content that resides under the 'enterprise/' directory [...] is
> licensed under the license defined in 'enterprise/LICENSE'. [...] Content outside
> [...] is available under the 'MIT Expat' license [...]"

- **MIT permite forkar, fechar o código e revender como proprietário.** Única
  obrigação: **preservar o aviso de copyright e o texto MIT** nos arquivos
  derivados.
- **Restrições:** (1) não usar a pasta `enterprise/` sem assinatura Chatwoot,
  **remova-a do build**; (2) rebrandear (tirar nome/logo "Chatwoot"); (3) preservar
  o aviso MIT original.

Diferente do Odoo, aqui você **não precisa abrir nada**.

## 7. Tabela consolidada: PODE x NÃO PODE

| Camada | PODE | NÃO PODE / cuidado |
|---|---|---|
| **Odoo core (LGPL)** | Forkar, modificar, usar em SaaS, rebrandear, pôr módulos/frontend proprietários por cima (inclusive herdando classes do core) | Fechar o próprio core LGPL modificado (modificações nos arquivos LGPL continuam LGPL) |
| **OCA fiscal (AGPL)** | Usar, modificar e comercializar o SaaS **cumprindo o AGPL** (manter AGPL + oferecer fonte aos usuários da rede). Receber updates da OCA para sempre | Fechar módulos AGPL ou custom que **herda** AGPL. Esconder o fonte modificado dos usuários. Copiar código AGPL para dentro do frontend |
| **Frontend Next.js (nosso)** | Ficar **fechado e proprietário** (processo separado por JSON-RPC = agregação) | Importar código Python AGPL no processo do frontend; empacotar tudo como obra só; trocar estruturas internas complexas |
| **Chatwoot (MIT)** | Forkar o core MIT, fechar, rebrandear, revender (preservando aviso MIT) | Usar a pasta `enterprise/` sem assinatura; usar a marca "Chatwoot" |
| **Odoo Enterprise** | Nada, para o fork | Copiar/portar/redistribuir qualquer código Enterprise (lição Flectra) |
| **Marca "Odoo"** | Rebrandear com marca própria ("Nexus"), removendo nome/logo Odoo | Usar nome/logo "Odoo", "Powered by Odoo", sugerir endosso |

## 8. "Pode receber updates da OCA para sempre e comercializar?"

**Sim.** A l10n-brazil é AGPL e a OCA publica atualizações continuamente. Você pode
puxar esses updates para sempre e comercializar o ERP Nexus como SaaS, cumprindo:

1. Manter os módulos AGPL (e suas modificações neles) **sob AGPL**;
2. **Oferecer o Corresponding Source** desses módulos aos usuários da rede,
   gratuitamente, por meio padrão;
3. **Não** fechar módulos AGPL nem custom-modules que herdam de AGPL;
4. Manter o **frontend proprietário como processo separado** (JSON-RPC);
5. **Rebrandear** (sem marca Odoo/Chatwoot) e **não tocar no Enterprise**.

Cumprindo isso, o modelo é **legalmente sustentável e comercializável de forma
perpétua**: o valor proprietário e fechado vive no **frontend Next.js**, na
orquestração, na experiência e na IA; a camada fiscal AGPL permanece aberta, o que,
para localização fiscal, é o padrão de mercado no Brasil e não é o diferencial
competitivo.
