# Plano de execução: Balde B pré-ativação (construir tools antes do dado)

> **Decisão do usuário (2026-05-30):** construir AGORA as tools dos domínios Balde B
> (CRM, contábil e demais sem registro), para ficarem prontas quando a Matrix começar
> a operar/popular esses módulos. Alinhado ao P8 do roadmap ("construir Balde B antes
> da ativação"). Depois validamos/calibramos com dado real.
>
> **Base confirmada: PRODUÇÃO.** `ODOO_URL=https://grupojht.tauga.online` alimenta
> todos os fatos/tools de leitura. A base de teste (`grupojht.teste.tauga.online`) só
> é usada para ESCRITA (`ODOO_WRITE_URL`). Tudo que se constrói aqui é sobre produção.

## 0. Princípios deste plano

1. **Padrão idêntico ao das ondas O1/O3/O4** (provado): migration aditiva do fato →
   builder `src/worker/fatos/fato-*.ts` (mapper puro testado) → `FATO_BUILDERS` +
   `FATO_FONTE` → query layer testada → tool(s) `ToolEntry` no padrão → registro no
   índice do domínio + bumps de contagem (`integration.test`, `model-catalog.test`) →
   `BI_SCHEMA_REFERENCE` → vocabulário do Router → rebuild da PASTA PRINCIPAL
   (`build app` + recreate worker, ver `docs/runbooks/sync-novo-fato.md`).
2. **Estrutura dos campos vem do `fields_get` JSON-RPC** (funciona mesmo com 0
   registros) ou dos 11 XLSX em `discovery/odoo-schema/`. Cada modelo novo a
   sincronizar entra no `MODEL_CATALOG` (e some no painel "Estado da ingestão").
3. **Validação sintética (P8):** como há 0 registros, cada onda valida com (a) teste
   unitário do builder/query com mocks realistas, e (b) quando possível, criar 1-3
   registros de teste via a base de ESCRITA (`grupojht.teste.tauga.online`) para um
   E2E estrutural. Cada fato/tool nasce marcado "aguardando dado de produção".
4. **Distinção crítica , existe vs precisa-instalar:** os modelos Balde B abaixo
   EXISTEM no registry do Odoo (responderam ao `search_count`, por isso são B). Já os
   modelos que o R2 jogou em C como `abstract_ou_inexistente` (ex.: `rh.*`, e o CRM
   transacional `crm.lead/oportunidade` que NEM EXISTE como modelo) **não dá para
   pré-construir** , dependem de a Matrix INSTALAR o módulo no Odoo primeiro. Estão
   fora deste plano (ver §6).
5. **Cada onda Balde B segue a metodologia §6** (SPEC v1→v3 + PLAN v1→v3 + reviews),
   mas com esforço proporcional , a SPEC já parte deste mapa, então tende a ser SPEC
   única + 1 review aterrada no `fields_get`, como o O4.

## 1. Priorização (ordem de execução proposta)

Critério: valor de produto × probabilidade de ativação (`instalado_sem_uso` > `sem_sinal`)
× tamanho. Cada item vira uma "onda B-x" com branch/PR próprios (ou na mesma branch,
conforme o usuário).

### B1 , Contábil (movimento) , PRIORIDADE MÁXIMA
Modelos (todos `instalado_sem_uso`, módulo presente, vão popular quando lançarem
contabilidade): `contabil.lancamento`, `contabil.lancamento.item`,
`contabil.lancamento.item.rateio`, `contabil.demonstracao`, `contabil.demonstracao.item`,
`contabil.encerramento`, `contabil.depreciacao`, `contabil.centro.custo`,
`contabil.operacao`/`.item`, `contabil.historico`, `contabil.conta.referencial` (2216, JÁ TEM dado).
- **Fatos:** `FatoContabilLancamento` (cabeçalho) + `FatoContabilLancamentoItem` (partidas:
  conta, débito/crédito, valor, centro de custo) + `FatoContabilContaReferencial` (de-para).
- **Tools:** `contabil_razao_por_conta` (lançamentos por conta), `contabil_balancete`
  (saldos por conta no período: débito/crédito/saldo), `contabil_dre_contabil`
  (resultado por grupo de conta), `contabil_centro_custo`. Reusa `fato_conta_contabil`
  (plano de contas, já existe) como dimensão.
- **Por quê 1º:** é o gap que o roadmap mais valoriza (O5), tem o módulo instalado, e a
  estrutura de partida dobrada é estável (fields_get confiável).

### B2 , Fiscal complementar (MDF-e / DF-e header / REINF)
`sped.consulta.dfe` (35, lote NSU , complementa o `fato_dfe` do O1 com a empresa/lote),
`sped.mdfe`* (manifesto de transporte, se presente), `reinf.evento`/`reinf.evento.item`
(eventos REINF , obrigação acessória).
- **Fatos/tools:** `FatoMdfe` + tool de manifestos de transporte; `FatoReinfEvento` +
  tool de eventos REINF pendentes/enviados. `fato_consulta_dfe` (lote) para enriquecer DF-e.
- (*) confirmar no fields_get se `sped.mdfe` existe como modelo.

### B3 , Financeiro , cobrança bancária (remessa/retorno/cheque/pix)
`finan.remessa`/`finan.remessa.item`, `finan.retorno`/`finan.retorno.item`, `finan.cheque`,
`finan.pix`, `finan.carteira` (boletos), `finan.forma.pagamento` (dimensão).
- **Fatos/tools:** `FatoRemessaBancaria` + `FatoRetornoBancario` + tools de "remessas
  geradas", "retornos processados", "boletos em carteira", "cheques", "PIX recebidos".
  Cobrança bancária detalhada que o O4/financeiro atual não cobre.

### B4 , Pedido , cotação/proposta + comissão
`pedido.documento.cotacao`/`.cotacao.item`/`.cotacao.analise` (funil de cotação),
`pedido.comissao` (comissão), `pedido.documento.reajuste`/`.reajuste.item` (contratos).
- **Fatos/tools:** `FatoCotacao` + tools "cotações abertas/convertidas", `FatoComissao`
  + tool "comissão por vendedor/pedido". Completa o comercial (O3).

### B5 , Produção
`producao.processo`, `producao.centro.trabalho`, `producao.parametro.qualidade`,
`producao.alteracao.materia.prima`/`.item`.
- **Fatos/tools:** `FatoProducaoProcesso` + tool de ordens/processos de produção.

### B6 , Estoque avançado / WMS
`estoque.local.endereco`, `estoque.minimo.maximo`, `estoque.norma.palete`/`.item`,
`estoque.tipo.palete`, `estoque.requisito` (todos `instalado_sem_uso`); + `wms.*` (6
modelos, se existirem como modelo).
- **Fatos/tools:** `FatoEstoqueMinMax` + tool "produtos abaixo do mínimo / acima do
  máximo" (alto valor operacional quando popular); endereçamento/palete (WMS).

### B7 , CRM (limitado) + auditoria + relatório
- **CRM:** só `crm.pipeline` + `crm.pipeline.etapa` (config, `sem_sinal`). `FatoCrmPipeline`
  + tool de etapas do funil. **ATENÇÃO:** o CRM transacional (lead, oportunidade,
  conversão) NÃO existe como modelo neste Odoo , só aparece se a Matrix instalar o
  módulo CRM. Pré-build de CRM = só a config do pipeline (marginal). Documentar.
- **Auditoria:** `auditoria.regra` (15, em_uso) + `auditoria.*` , tool de regras/eventos de auditoria.
- **Relatório:** `relatorio.relatorio` (44) , catálogo de relatórios SQL do Odoo (baixa prioridade).

## 2. Estimativa e sequência

- B1 (contábil) é a maior e mais valiosa , fazer primeiro, sozinha.
- B2..B6 são médias (1-2 fatos + 2-3 tools cada).
- B7 é pequena/marginal , por último.
- Cada onda: ~meio a 1 dia de trabalho no padrão atual.

## 3. Checklist por onda B-x (reusar)

- [ ] `fields_get` do(s) modelo(s) (estrutura real dos campos) , script tsx temporário.
- [ ] SPEC curta aterrada no fields_get + 1 review (overlap vs o que já existe).
- [ ] Migration aditiva do(s) fato(s).
- [ ] Modelo(s) raw novo(s) no `MODEL_CATALOG` (aparecem no painel).
- [ ] Builder(s) + teste pareado.
- [ ] Query layer + teste.
- [ ] Tool(s) no padrão + registro no índice do domínio.
- [ ] Bumps: `integration.test` (FISCAL/FINANCEIRO/... IDs + counts), `model-catalog.test`.
- [ ] `BI_SCHEMA_REFERENCE` + vocab Router.
- [ ] Validação sintética (mock + opcional 1-3 registros na base de teste de escrita).
- [ ] Rebuild PASTA PRINCIPAL (`build app` + recreate worker) , conferir painel.
- [ ] Marcar fato "aguardando dado de produção" até popular.

## 4. O que JÁ está pronto (não refazer)

R2 (discovery), O1 (DF-e), O3 (histórico de etapas), O4 (DRE gerencial) , todos
mergeados na main. Plano de contas (F4) cobre `contabil.conta`. As 79+ tools da F4
seguem intocadas (P1 aditivo).

## 5. Gate de validação ao vivo (pendente para todas as ondas entregues)

Bateria R-X (>= 95,5%) rodando contra a main mergeada, com perguntas das ondas novas
adicionadas ao banco de perguntas (`scripts/quality-audit/03-run-test-questions.ts`).
É a validação do agente, separada do E2E estrutural.

## 6. Fora de escopo (precisa instalar módulo no Odoo primeiro)

Modelos que o R2 classificou como inexistentes/abstratos (Balde C
`abstract_ou_inexistente`): `rh.*` (folha, ponto, holerite , módulo RH não instalado),
CRM transacional (`crm.lead`, `crm.oportunidade` , não existem como modelo). Não dá
para pré-construir sem a Matrix instalar/ativar o módulo no Odoo. Quando instalarem, o
R2 (re-rodado) os pega e uma onda nova os cobre.
