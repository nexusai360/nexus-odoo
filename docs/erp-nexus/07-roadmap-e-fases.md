# 07, Roadmap e fases

> O caminho faseado do ERP Nexus, a estratégia de migração de dados, os riscos e
> as regras de ouro. Premissa: permanecer na Tauga até o projeto próprio estar
> maduro, testado e seguro.

## O calendário, com realismo (o balde de água fria)

O horizonte inicialmente imaginado ("4 meses") **é irreal** para um ERP fiscal
maduro, seguro e comercializável. Só a migração de sair da Tauga já é um projeto
grande. O horizonte revisado ("6 meses a 1 ano") é mais são, mas ainda otimista se
a meta é **vender para terceiros** (aí o nível de robustez, suporte e
responsabilidade sobe muito). O correto é pensar em **fases entregáveis**, não em
uma data única, e **cortar a Tauga só quando as fases de fundação estiverem
provadas**.

## Roadmap faseado

### Fase 0, já feita
Cache + MCP + dashboard + Nex sobre a Tauga. **O embrião do ERP Nexus já existe.**
As camadas L2-L4 da arquitetura ([05](05-arquitetura-alvo.md)) estão construídas.

### Fase 1, motor próprio em dev
- Subir um **Odoo 16 Community + OCA `l10n-brazil` 16.0** próprio, "de fábrica",
  em ambiente de dev.
- Configurar em **homologação SEFAZ (sandbox)**.
- Provar emissão de **NF-e, CT-e e MDF-e** num CNPJ de teste.
- **Aqui entra o integrador OCA** (ver [03](03-empresas-ecossistema.md)).

### Fase 2, repontar o Nexus para o motor novo
- Ajustar a camada de mapeamento (`src/worker/fatos/*`) para os modelos OCA
  (`account.*`, `l10n_br_fiscal.*`) em vez de `sped.*`/`finan.*`.
- O cache, o MCP e o Nex passam a rodar sobre o motor novo, **ainda sem migrar
  dado de produção**. Valida a arquitetura end-to-end com dados de teste.

### Fase 3, migração de dados (ETL)
- Escrever o **ETL de de-para** dos modelos custom da Tauga para o OCA:
  - Cadastros primeiro (parceiros, produtos, plano de contas)
  - Depois transacional (documentos fiscais, lançamentos, movimentações)
  - Por fim histórico
- Extração já resolvida pelo cache Postgres; escrita no destino apoiada pelos
  módulos de import da Akretion. Ver [06](06-reuso-repositorios.md).
- **Atenção legal/fiscal:** garantir a posse dos **XMLs de nota fiscal** (guarda
  obrigatória por 5 anos). Verificar via API quanto dos anexos (`ir.attachment`) é
  extraível antes de cortar a Tauga.

### Fase 4, telas de operação na cara Nexus
- Reconstruir no frontend Nexus as telas de operação diária que valham a pena.
- O resto (telas fiscais profundas: emissão, apuração, SPED) **fica no backoffice
  nativo do Odoo**, usado pelos operadores fiscais.

### Fase 5, canais / conversação
- Fork do Chatwoot (MIT) ou integração + ponte nativa. WhatsApp via n8n (F5) + Nex.
- Decidir forkar vs integrar pela real necessidade de mudar o núcleo.

### Fase 6, endurecimento
- Segurança, multi-tenant, **Reforma Tributária (com o integrador)**, validação
  fiscal **E2E contra dado real** (regra de raiz do projeto: `tsc`/`jest`/code
  review não bastam para dado fiscal).

### Fase 7, piloto e comercialização
- Piloto com 1 cliente real. Só depois, comercializar.

### Corte da Tauga
- **Só quando as Fases 1 a 3 estiverem provadas e maduras.** É exatamente a
  estratégia declarada de "sair só lá na frente". Nunca antes.

## Riscos (ordenados por severidade)

1. **Reforma Tributária (IBS/CBS/IS).** Maior risco técnico. Sem release OCA em
   2026 (só PRs), transição já começou. Mitigação: integrador OCA no núcleo fiscal;
   acompanhar/patrocinar os PRs. Ver [02](02-landscape-oca-fiscal.md), seção 5.
2. **Calendário subestimado.** Mitigação: fases entregáveis, não data única;
   Tauga no ar até a fundação provada.
3. **Migração de dados sem atalho.** Mitigação: ETL próprio, faseado; o cache já
   mapeado é o ativo; validar XMLs fiscais antes do corte.
4. **Buracos de cobertura (NFS-e, EFD/ECF/Reinf/e-Social).** Mitigação: gateway
   pago para NFS-e; software terceiro ou PVA para acessórias; priorizar o que a
   operação realmente usa.
5. **Bus factor do ecossistema (1-2 pessoas / Akretion).** Mitigação: relação com
   casa de oferta estruturada (KMEE/Escodoo) + acesso pontual à Akretion; posse do
   código AGPL e do dado.
6. **Responsabilidade fiscal ao vender para terceiros.** Mitigação: integrador no
   fiscal; contratos claros; validação E2E.
7. **Risco legal de licença.** Mitigação: cumprir AGPL §13, separação de processos,
   zero código Enterprise, rebrand completo; **advogado antes de faturar**. Ver
   [04](04-licencas-e-legal.md).

## Regras de ouro (não violar)

1. **Nunca reskin o Odoo.** Odoo é motor headless; o produto é o frontend Nexus.
2. **Inteligência proprietária vive acima da fronteira de API.** Nunca como módulo
   Odoo que herda o fiscal AGPL.
3. **Frontend é processo separado (JSON-RPC).** Não embutir, não empacotar como
   obra só.
4. **Zero código do Odoo Enterprise.** (Lição Flectra.)
5. **Rebrand completo:** sem marca Odoo/Chatwoot na interface.
6. **Cumprir o AGPL na camada fiscal:** fonte disponível aos usuários da rede.
7. **Motor "de fábrica":** não reescrever o miolo do Odoo/OCA, para manter os
   updates da comunidade fáceis de mergear.
8. **Integrador OCA no núcleo fiscal**, sobretudo na virada da Reforma.
9. **Validação E2E contra dado real** antes de declarar qualquer coisa pronta.
10. **Advogado de open source** antes da primeira nota fiscal cobrando pelo produto.

## O que já está pronto a favor do projeto

- Cache Postgres com o dado do Odoo mapeado (ativo de migração).
- Worker de sync por JSON-RPC (a extração, parte cara, resolvida).
- Servidor MCP com RBAC 7 camadas (mais maduro que os do ecossistema).
- Agente Nex e a experiência de produto.
- Integração WhatsApp/n8n (F5) e o construtor de relatórios (F6).

O ERP Nexus não parte do zero: parte de uma fundação já construída, trocando o
motor do porão e assumindo o que já existe como produto.
