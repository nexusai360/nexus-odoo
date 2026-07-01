# 00, Visão e objetivo

## O ponto de partida

O projeto Nexus (para o cliente Matrix Fitness Group / Grupo JHT) nasceu como uma
camada de leitura sobre o Odoo da Tauga: um **cache Postgres** alimentado por
sincronização via JSON-RPC, um **dashboard de relatórios**, um **servidor MCP
semântico** e um **agente de IA (Nex)** que responde sobre a operação. Tudo isso
já está construído e funcionando, lendo do cache, sem tocar o Odoo ao vivo.

A partir dessa base, surgiu uma ambição maior, que é o objeto deste dossiê.

## O sonho (o objetivo declarado pelo usuário)

Transformar a plataforma Nexus num **ERP próprio, com marca própria (ERP Nexus)**,
que:

1. **Use o Odoo Community + OCA l10n-brazil como base/motor**, em vez de construir
   um ERP fiscal do zero (o que seria inviável).
2. **Tenha a cara do Nexus**, o layout moderno que já temos, e não a interface do
   Odoo (considerada ultrapassada, sobretudo no Odoo 16).
3. **Seja comercializável**: vendável como produto/SaaS para outros clientes.
4. **Continue recebendo as atualizações da comunidade OCA** para sempre, sem
   conflito legal com Odoo/OCA.
5. **Incorpore uma plataforma de conversação própria** (um fork do Chatwoot,
   rebrandeado), integrada nativamente ao ERP.
6. **Substitua a Tauga só lá na frente**, quando o projeto próprio estiver maduro,
   testado e seguro. Até lá, a operação continua na Tauga.

O horizonte declarado é de **seis meses a um ano** de desenvolvimento, teste e
validação, com trabalho intenso, antes de qualquer corte da Tauga.

## O que este projeto É

- Um **estudo de viabilidade** técnico, legal e estratégico.
- Uma **arquitetura de produto** onde o Odoo é motor de backend e o Nexus é o
  produto que o cliente vê.
- Um **caminho faseado** para, no futuro, migrar da Tauga para uma stack própria
  sobre Odoo + OCA, e eventualmente comercializar.

## O que este projeto NÃO é (ainda)

- **Não é uma decisão executada.** Nada foi implementado a partir deste estudo.
- **Não é uma migração imediata.** A operação fiscal permanece na Tauga até o
  projeto próprio estar maduro.
- **Não é "construir a base de cálculo fiscal do zero".** A base de cálculo já
  existe, madura, na OCA. O verbo correto é *adotar + configurar + migrar +
  operar*, não *construir*.
- **Não é reskin do Odoo.** A estratégia não é fazer o Odoo parecer o Nexus (luta
  perdida contra o framework dele), e sim usar o Odoo headless atrás do frontend
  Nexus.

## A tese central de produto

> **O Odoo (CE + OCA) é o motor fiscal/contábil invisível no porão. O "ERP Nexus"
> que o cliente enxerga é o nosso frontend Next.js + o cache + o MCP + o agente
> Nex + a conversa. A ponte entre os dois é a API (JSON-RPC).**

Essa separação resolve três problemas de uma vez:

- **Produto:** o cliente tem a experiência bonita e moderna do Nexus, não a tela
  do Odoo.
- **Legal:** o frontend, sendo um programa separado que fala por API, permanece
  proprietário e fechado, enquanto a camada fiscal AGPL fica aberta (como já é).
- **Esforço:** não se reescreve o Odoo; adiciona-se por fora. O motor fica "de
  fábrica" e continua recebendo updates da OCA.

## Por que isso não é uma viagem

Vale registrar, porque a pergunta do usuário foi honesta ("me diga se estou
viajando"): **forkar um projeto open source, rebrandear e comercializar é legal e
já foi feito** (o Flectra é um fork do Odoo; o próprio Odoo nasceu de um fork do
OpenERP). O que era imaginado como "impossível" é, na verdade, um modelo de
negócio estabelecido (é o que os integradores OCA fazem, é o modelo white-label
da KMEE). O que exige cuidado não é a legalidade do fork em si, e sim: cumprir o
AGPL na camada fiscal, manter a separação de processos, jamais tocar no código
Enterprise, e dimensionar o calendário com realismo.

## Próximos documentos

- Para entender **de onde partimos** (o ERP atual da Tauga), ver
  [01-pericia-instancia-tauga.md](01-pericia-instancia-tauga.md).
- Para entender **para onde vamos** (a base OCA), ver
  [02-landscape-oca-fiscal.md](02-landscape-oca-fiscal.md).
