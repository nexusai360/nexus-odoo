# 03, Empresas do ecossistema OCA Brasil

> Quem são as casas que mantêm a localização fiscal brasileira do Odoo. Objetivo:
> ao pensar em sair da Tauga, saber se trocar de integrador é "trocar seis por
> meia dúzia", e para quem faz sentido migrar. Fonte: API do GitHub, manifests,
> registros OCA, páginas oficiais. Data-base 01/07/2026.

## Resumo executivo

1. **É um mercado minúsculo e altamente concentrado.** A localização fiscal BR do
   Odoo é um projeto único (o OCA `l10n-brazil`), mantido por um punhado de
   empresas pequenas que **colaboram** dentro da OCA (não disputam a posse do
   código; competem por clientes de serviço).

2. **A concentração de conhecimento é extrema (o achado central).** A governança
   formal do projeto são **duas pessoas, ambas da Akretion**. Uma única pessoa
   (Renato Lima, Akretion) tem mais commits que KMEE, Escodoo e Engenere somadas.
   O **bus factor efetivo é de 1 a 2 indivíduos e 1 empresa (Akretion)**. Trocar
   de integrador não elimina esse risco sistêmico: só muda de qual das ~5 casas
   você depende.

3. **O lock-in que o cliente sente não é de licença, é de hospedagem + know-how.**
   O código é AGPL/LGPL (portável, sem trava de licença). O que prende é (a) o
   dado estar dentro de um tenant hospedado da Tauga, acessível só por JSON-RPC, e
   (b) a expertise fiscal viver na cabeça de poucos especialistas.

## Ranking de contribuidores do `l10n-brazil` (bots excluídos)

Fonte: [contributors API](https://github.com/OCA/l10n-brazil/graphs/contributors)
+ créditos nos manifests + registro de membros OCA.

| Commits | GitHub | Nome | Empresa |
|---|---|---|---|
| 2.247 | renatonlima | Renato Lima | **Akretion** |
| 1.485 | rvalyi | Raphaël Valyi | **Akretion** |
| 748 | mbcosta | Magno Costa | **Akretion** |
| 725 | mileo | Luis Felipe Mileo | **KMEE** |
| 651 | marcelsavegnago | Marcel Savegnago | **Escodoo** |
| 369 | gabrielcardoso21 | Gabriel Cardoso de Faria | **KMEE** |
| 339 | antoniospneto | Antônio S. Pereira Neto | **Engenere** |
| 257 | luismalta | Luis Otávio Malta | **KMEE** |
| 94 | CristianoMafraJunior | Cristiano Mafra Jr. | Escodoo |
| 92 | felipemotter | Felipe Motter Pereira | **Engenere** |
| 38 | mstuttgart | Michell Stuttgart | Multidados |
| 28 | danimaribeiro | Danimar Ribeiro | Trustcode (fundador) |
| 16 | kaynnan | Kaynnan Lemes | Escodoo |

A conta da concentração (bus factor):
- Top 1 (Renato Lima) = ~21,7% de todo o código humano.
- Trio Akretion (renatonlima + rvalyi + mbcosta) = 4.480 commits, **mais que KMEE
  (~1.461) + Escodoo (~761) + Engenere (~431) somadas**.
- Top 3 humanos = ~43%; top 5 = ~57%.
- Os dois assentos de governança formal são Akretion.

## Akretion (a origem e a líder técnica)

- Integradora Odoo **bi-nacional (Brasil + França)**, boutique/pequena. Entidade
  BR no Rio de Janeiro; braço francês em Lyon. Fundada ~2009 por Raphaël Valyi,
  que trouxe o OpenERP ao Brasil.
- **Papel:** criadora e líder do projeto desde 2009. Autoria/arquitetura dos
  módulos centrais: `l10n_br_fiscal` (motor fiscal), `l10n_br_account`,
  `spec_driven_model` (binding XML). Ambos os papéis de governança são Akretion.
  Mantém a lib [`nfelib`](https://github.com/akretion/nfelib).
- Pessoas: Raphaël Valyi (cofundador da própria OCA em 2013) e Renato Lima (maior
  committer; exportou a primeira NF-e a partir do OpenERP em 2011).
- **Negócio:** serviços de alto valor (integração, migração, recuperação de
  projetos, upgrades), hosting, treinamento. Não vende SaaS fechado.
- **Diferencial:** a mais forte em **fiscal e SPED de baixo nível (o "motor")**.
  Se algo quebra no núcleo do NF-e/SPED, o conhecimento definitivo está aqui.
- Site: [akretion.com](https://akretion.com/en/about-us).

## KMEE (a mais comercial/produtizada)

- Consultoria Odoo em **Itajubá (MG)**, ~40 colaboradores, "50+ implementações",
  "14+ anos". Liderança: Luis Felipe Mileo (CEO) e Ananias Filho (CTO). Fundação
  entre ~2010-2012 (constituição jurídica atual 2015).
- **Papel:** segundo maior bloco de committers (~1.461). Co-autora de NF-e,
  plano de contas, NFS-e e do framework de **ordens de pagamento CNAB/boleto**.
- **Negócio:** o portfólio mais produtizado do grupo: consultoria/implantação,
  módulos customizados, **squads dedicados**, **suporte/AMS**, **Cloud KMEE**
  (hosting), **White Label** (revenda do ERP com a marca do cliente), módulo de
  IA, KMEE Academy.
- **Solidez:** única com carteira de clientes pública de porte (BNDES, ABGF,
  Cosmos Atacado, Redsis, etc.).
- **Diferencial:** framework financeiro (CNAB/boleto) e tropicalização
  "resolvida", com a oferta comercial mais completa e a maior base de clientes.
- Site: [kmee.com.br](https://kmee.com.br/a-kmee).

> **Nota de relevância direta:** o modelo **White Label** da KMEE é exatamente o
> que o ERP Nexus pretende ser (revender o ERP com marca própria). É prova de que
> o modelo de negócio é viável e já praticado no mercado.

## Escodoo (a mais visível em governança e conteúdo)

- Pequena (~8 funcionários), em **Ribeirão Preto / Sertãozinho (SP)**. Parceiro
  Odoo desde 2015. Pessoa-chave: **Marcel Savegnago**, cofundador e **membro do
  PSC da OCA** (governança oficial). Top 10 contribuidores globais da OCA em 2024.
- **Negócio:** implementação/consultoria (bandeira Community + OCA sem custo de
  licença), suporte/AMS e **Academia Escodoo** (treinamento como produto).
  Marketing de conteúdo técnico forte (blog sobre reforma e NFS-e nacional).
- **Diferencial:** a melhor documentação pública sobre o `l10n_br_fiscal`, MDF-e,
  NFS-e, e presença de governança. É a mais "aberta/didática".
- Site: [escodoo.com.br](https://escodoo.com.br/aboutus).

## Engenere (menor, jovem, Community-purista)

- Boutique de dois sócios (Antônio Pereira Neto e Felipe Motter). Site
  `engenere.one`. Top-5 em commits (~430).
- **Papel:** contribuidores oficiais do `l10n_br_account`; desenvolveram EDI/NF-e.
  Mantêm fork próprio atualizado.
- **Postura:** pró-OCA/Community explícita (declararam publicamente não firmar
  parceria que os obrigasse a adaptações exclusivas para versões proprietárias).
- **Diferencial:** contribuições reais e recentes ao core fiscal, pegada pequena.
  Menos oferta comercial estruturada, sem clientes públicos.
- GitHub: [github.com/Engenere](https://github.com/Engenere).

## Cauda longa e correções

- **Multidados:** contribuidor real mas minúsculo (Michell Stuttgart, 38 commits).
  Empacota o Odoo como "MultiERP" (sobre Odoo 12). **Não é casa central de
  localização fiscal.** Sinalizado por risco de confusão de identidade.
- **Trustcode:** historicamente relevante (era `sped.*`/PyTrustNFe), hoje trilha
  parcialmente proprietária/paralela (Nuvem Fiscal, API SaaS). É alternativa, não
  co-mantenedora da linha OCA.
- **Não confirmados** como contribuidores do l10n-brazil (não apresentar como
  tal): Nexdata, Marcos Kunzler, "Luis Emmanuel Ochô", Codenge, Iterativo. O
  apelido "Trevisan/KMEE" não foi confirmado.

## Tauga (o incumbente)

- **TAUGA SOLUÇÕES INFORMÁTICA LTDA**, parceiro Odoo de implantação/hospedagem.
  Autodescrição: 26 anos de existência, 12 com Odoo, especialidade em automação de
  **"grupos econômicos"** (empresas juridicamente independentes, regimes fiscais
  distintos, administração central compartilhada).
- `grupojht.tauga.online` é um subdomínio de tenant na plataforma hospedada da
  Tauga. O Grupo JHT é **inquilino** de um Odoo hospedado e operado por eles. É o
  lock-in operacional de tenant que motiva a saída.
- Página: [odoo.com/partners/tauga](https://www.odoo.com/partners/tauga-solucoes-informatica-ltda-4052891).

## Síntese: "reduzir dependência sem virar o especialista fiscal"

**Resposta desconfortável, mas honesta: você não elimina a dependência de
especialista fiscal ficando no Odoo BR.** A complexidade fiscal brasileira é
reconhecida pelas próprias mantenedoras como "das mais complexas do mundo", com
curva de aprendizado de anos. Internalizar 100% significaria contratar e reter um
perfil escaso, disputado justamente por essas ~5 casas, reproduzindo o mesmo bus
factor dentro de casa.

**O que muda ao trocar de integrador:** você sai de "cliente hospedado de um
implantador" (Tauga) para "cliente de quem escreve a localização". É uma melhora
estrutural real; a dependência permanece, mas fica melhor endereçada, e o código
passa a ser seu.

**Ranking prático para quem migrar (por profundidade no `l10n-brazil`):**

1. **Akretion**, a fonte técnica definitiva (fiscal/SPED/motor). Melhor se o medo
   é "e se o núcleo fiscal quebrar". Mais sênior, mais cara, mais boutique.
2. **KMEE**, melhor equilíbrio para "reduzir dependência sem virar o especialista":
   segundo maior bloco de código, maior oferta comercial estruturada, carteira
   pública, portfólio produtizado (inclusive White Label). Resposta mais direta ao
   objetivo do ERP Nexus.
3. **Escodoo**, se valoriza transparência, documentação e governança OCA, e quer
   treinar parte do time (meio-termo entre in-house e terceirizado).
4. **Engenere**, competente mas pequena; melhor como reforço/segunda fonte.
5. **Trustcode**, só se preferir motor fiscal empacotado fora da linha OCA pura
   (muda o modelo, não recomendado se quer permanecer no OCA/AGPL).

**Mitigação de risco (independente da escolha):**
- O ativo que protege o cliente é o **código AGPL**, não o contrato. Garantir
  posse do código e do dado (sair do tenant Tauga para infra própria/portável)
  remove o lock-in real (licença + hospedagem).
- **Não depender de uma pessoa só.** Como a governança é 2 pessoas da Akretion, o
  ideal é relação com uma casa de oferta estruturada (KMEE/Escodoo) **+ acesso
  pontual à Akretion** para o núcleo fiscal.
- **Híbrido (integrador no fiscal + time interno no negócio)** é o ponto ótimo. É,
  aliás, o caminho que o próprio projeto já tomou ao construir cache + MCP sobre a
  instância. Ver [05-arquitetura-alvo.md](05-arquitetura-alvo.md).
