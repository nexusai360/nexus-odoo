# PERÍCIA DE RAIZ , "Demanda em aberta" + "Faturamento de venda real"

> **Fonte da verdade deste tema. Passar sessão por sessão.**
> Origem: reunião com a Mariane (admin comercial) + prints da tela de etapas do
> Odoo Tauga (2026-07-07) + investigação direta no cache Postgres (`nexus_odoo_l1`).
> Consolidado por Claude nesta sessão. Enquanto não virar spec formal executada,
> este doc é o mapa. NÃO apagar sem substituir.

## 0. Por que isto existe (o problema de raiz)

A plataforma inteira (relatórios da diretoria, Agente Nex, tools MCP fiscais e
comerciais) hoje soma pedido e nota com **lógica antiga**, que mistura o que não
deveria. Dois conceitos de negócio precisam ser corrigidos em TODA a plataforma,
não só numa tool:

1. **Demanda em aberta** = pedido **aprovado** que **ainda não teve a nota fiscal
   de venda ao cliente final emitida**. É definido **por ETAPA**, não por `vr_nf`.
2. **Faturamento / comparações de venda** = **somente notas de VENDA a cliente
   externo** (fora do grupo). Fora: transferência, triangulação, venda interna
   (intragrupo), demonstração, bonificação, remessa, armazenagem, inventário,
   produção, compra, devolução.

Se somarmos "tudo", os números incham e todos os relatórios ficam errados. Este é
o entendimento a propagar em cada ponto da plataforma.

## 1. ACHADO CRÍTICO , `vr_nf` NÃO indica se a nota foi emitida

O plano antigo (`2026-06-19-demanda-em-aberta-CONTINUACAO.md`) assumia
`vr_nf = 0 ⇒ ainda não carregado/sem nota`. **Isso está furado no dado real.**
Quase todo pedido tem `vr_nf > 0`, inclusive os claramente em aberto:

| etapa_nome | qtd | com vr_nf>0 |
|---|---|---|
| Aprovado | 32 | 32 |
| Input financeiro | 54 | 54 |
| GERA BOLETO | 136 | 136 |
| Fracionar | 70 | 70 |

Conclusão: `vr_nf` no `fato_pedido` é o valor faturável/previsto, **não** a prova
de emissão. **A classificação de "aberta x fechada" tem que ser por ETAPA** (+ tipo
de operação + operação de estoque). Descartar o critério `vr_nf = 0`.

## 2. O fluxo real (reunião + prints)

Exemplo base: Venda Lucro Real (consumidor final). Fluxo principal:

1. `Venda direta consumidor final` (1ª etapa, lançamento do pedido) , ainda NÃO aprovado.
2. `Aguardando Autorização` , Tatiana confere o financeiro. Ainda NÃO aprovado.
3. `Aprovado` , a partir daqui **conta como demanda em aberta**.
4. `GERA BOLETO` / `Input financeiro` , gera boletos, cliente paga, lança financeiro.
5. Separação: `Reserva de Estoque` (vai direto pra separação) **ou** `Fracionar`
   (define o que entrega primeiro). `Em separação` / `Em montagem` / `Em contagem`
   / `Em conferência`.
6. `SEPARAÇÃO ESTOQUE CONCLUIDO` , libera emissão.
7. Faturamento/triangulação: `CONFIRMA MOVIMENTAÇÃO` (movimentação sistêmica de estoque).
8. `Emite NF Consumidor Final` (última etapa da venda, cor preta, id 89) , **aqui SAI
   da demanda**. Só deixa de ser demanda aberta quando esta NF é emitida.
9. Exceção: `Nota emitida e não entregue.` (id 89 → seguinte) , criada para casos
   em que a nota foi emitida mas a mercadoria ainda não saiu (ex.: a Kátia precisa
   da nota pro banco). **Conta como demanda aberta mesmo tendo nota.**

### Regra de nomes de etapa (importante)
Em outras operações a etapa terminal tem a palavra **`Emite NF`** no nome. Mas
`Emite NF` **nem sempre é a saída da demanda**: existe `CORREÇÃO - Emite NF`,
`Emite NF - SIMPLES REMESSA`, `Emite NF Retorno Demo`, `Emite NF Transferência`,
`EMITE NF BONIFICAÇÃO`, `EMITE NF RETORNO DE ARMAZENAGEM`, etc. Só conta como saída
de demanda a **emissão de NF de VENDA ao cliente final**. As demais `Emite NF` são
movimentações internas e devem ser tratadas conforme a operação (ver §4).

Config real (tela "Etapas da venda", filtro `emite`, 11 resultados): `EMITE NF
RETORNO DE ARMAZENAGEM`, `EMITE NF BONIFICAÇÃO`, `Emite NF - Peças`, `CORREÇÃO -
Emite NF`, `Emite NF Consumidor Final` (→ `Nota emitida e não entregue`), `VF -
Emite NF`, `Emite NF Retorno Demo`, `V.O - Emite NF`, `Emite NF Transferência`,
`Emite NF`, `Emite NF - SIMPLES REMESSA`.

## 3. Buckets de ETAPA (a partir do dado real de `fato_pedido`, 2316 pedidos)

> Classificação preliminar. As marcadas **(confirmar)** dependem do mapa fino da
> Mariane (ela mostrou o fluxo, mas não ditou cada um dos ~60 nomes por bucket).

**A) DEMANDA EM ABERTA** (aprovado, sem NF de venda ao cliente):
`Aprovado`, `Aprovação dono`, `Input financeiro`, `GERA BOLETO`, `Fracionar`,
`Novo Fracionamento`, `Fracionamento concluído`, `AJUSTE FRACIONADO`,
`Reserva de Estoque - DEFINE ARMAZEM`, `Reserva de Estoque`,
`VF - SEGUIR COM RESERVA/FRACIONAMENTO`, `Em montagem`, `Em separação`,
`Em contagem`, `Em conferência`, `Em trânsito`, `Recebimento parcial`,
`Nota emitida e não entregue.` (exceção: conta mesmo com NF).

**B) DEMANDA FECHADA** (NF de venda ao cliente emitida):
`Emite NF Consumidor Final`, `Emite NF`, `VF - Emite NF`, `V.O - Emite NF`,
`Concluída` **(confirmar)**, `Confirmada` **(confirmar)**, `Confirmado` **(confirmar)**.

**C) IGNORAR** (não é venda a cliente externo):
- Demonstração: `Demonstração confirma`, `Pedido demonstração`, `Retorno
  Demonstração`, `Emite NF Retorno Demo`, `(DEMO) CONFIRMA MOV`, `Preview
  Demonstração`, `Confirma reserva retorno demonstração`.
- Cancelado: `Cancelado`, `Cancelada`.
- Bonificação: `EMITE NF BONIFICAÇÃO`, `REMESSA DE BONIFICAÇÃO 5910/6910`,
  `BONIFICAÇÃO RESERVA ESTOQUE`.
- Transferência/triangulação: `Transf. DF x Sergipe confirma`, `Retorno
  transferencia SERGIPE x DF`, `Pedido Transferência`, `FAT JDS x GRUPO`,
  `FAT Cliente final` **(confirmar)**, `[THIAGO] - Concluir movimentação de estoque`.
- Remessa/Armazenagem: `Emite NF - SIMPLES REMESSA`, `EMITE NF RETORNO DE
  ARMAZENAGEM`, `Retorno de Armazenagem - LR`, `Armazenagem - NF CONFIRMA` **(confirmar)**.
- Exposição/feira: `Confirma exposição/feira`, `Confirma retorno exposição/feira`.
- Garantia: `Emite NF Saída Garantia`.
- Peças **(confirmar se é venda real de baixo valor)**: `Emite NF - Peças`,
  `Gera Boleto - Peças`, `Preview NF - Peças`.
- Não fechado / pré-aprovação: `Venda direta consumidor final`, `Aguardando
  Autorização`, `Aguardando autorização`, `Em cotação/provisório`, `Em cotação`,
  `EM ANÁLISE`, `Devolução em solicitação`.

## 4. Classificação de OPERAÇÃO (o filtro que resolve a maioria automaticamente)

`operacao_nome` traz o **tipo entre parênteses** no fim. Distribuição real
(`fato_pedido`):

| tipo | qtd | entra em venda real? |
|---|---|---|
| venda | 1276 | **candidato** (mas ver exceções abaixo) |
| produção | 448 | não (montagem de kit) |
| transferência [entrada] | 163 | não |
| transferência [solicitação] | 157 | não |
| romaneio | 146 | não (demonstração/remessa) |
| inventário | 82 | não |
| compra | 25 | não |
| transferência [saída] | 16 | não |
| devolução [venda] | 1 | não |

**Cuidado:** o tipo `(venda)` NÃO basta. Dentro de `(venda)` há operações que não
são venda a cliente externo e precisam sair: `REMESSA DE ARMAZENAGEM ... (venda)`,
`Remessa Armazenagem (venda)`, `REMESSA DE BONIFICAÇÃO ... (venda)`, `Simples
Remessa (venda)`, `Remessa por Conta e Ordem de Terceiros (venda)`, `Venda Futura`
(mercadoria ainda não saiu). Filtro por nome, além do tipo.

## 5. Intragrupo (triangulação) , empresas do grupo

Vendas entre empresas do próprio grupo NÃO são faturamento externo. Empresas do
grupo (por CNPJ base, de `fato_pedido.empresa_nome` e `fato_nota_fiscal`):
`18.282.961` (Jds), `34.161.829` (Jht SP), `33.718.546` (Jib DF), `10.557.556`
(Jht DF), `07.390.039` (JHT Brasília), `34.461.908` (Ks), `35.156.509` (Cs),
`45.424.185` (Jmf). **Regra:** se o `participante` (cliente) da nota tem CNPJ base
do grupo, é **intragrupo** e sai do faturamento de venda externa.

Evidência no cache (`fato_nota_fiscal`, saídas): das notas com natureza `VENDA DE
MERCADORIA...`, centenas têm participante do próprio grupo; e há volume grande de
`TRANSFERENCIA DE MERCADORIA...`, `REMESSA ... DEMONSTRACAO`, `DEVOLUCAO`,
`BONIFICACAO`, `SIMPLES FATURAMENTO` misturados. Somar tudo infla o faturamento.

> Já existe tratamento parcial de intragrupo em `mcp/tools/fiscal/intercompany.ts`,
> `receita-consolidada.ts`, `ponte-faturamento.ts`, `faturamento-por-cfop.ts`
> (BRUTO×REAL, `receitaIntragrupo`). O trabalho é **uniformizar** esse critério em
> TODAS as tools/relatórios, não reinventar. Ver RADAR R2/decisão CFOP bruto×real.

## 6. Faturamento de venda real , critério a padronizar (fato_nota_fiscal)

Nota entra no faturamento de venda quando, cumulativamente:
- `entrada_saida = '1'` (saída);
- `situacao_nfe` = autorizada (não cancelada/denegada) , confirmar domínio real;
- `natureza_operacao_nome` é **VENDA** (não TRANSFERENCIA / REMESSA / DEMONSTRACAO
  / DEVOLUCAO / BONIFICACAO / SIMPLES FATURAMENTO / retorno / conserto / garantia);
- participante **externo** (CNPJ base fora do grupo , §5);
- opcional por caso: teve **operação/movimentação de estoque** real (ver §7).

Construir um helper único e reusável (ex.: `isVendaExterna(nota)` /
`classificaOperacao(op)`) e aplicar em todas as tools de faturamento e nos
relatórios da diretoria.

## 7. Exceções confirmadas pela Mariane / usuário

1. **`Nota emitida e não entregue.`** , tem NF mas CONTA como demanda aberta
   (mercadoria não saiu). Observação do sistema confirma: "Foi emitido nota fiscal
   por alguma necessidade e a mercadoria ainda precisa ser entregue e constar demanda."
2. **Nota sem operação de estoque** , às vezes emitem NF só para o banco/cliente
   destravar algo, **sem movimentar estoque** (gambiarra, rara). Mesmo com NF, o
   pedido segue como **demanda aberta** e a nota **não** conta como venda finalizada.
   Critério: checar se há operação/movimentação de estoque na nota/pedido
   (`fato_estoque_movimento`; flags "Inicia estoque/Estoque confirmado" na aba
   Estoque do pedido). Sem movimentação de estoque ⇒ tratar como aberta / não-venda.

## 8. Gaps de dado (limitações a declarar com honestidade)

- **"Produto com mais demanda" tem limitação:** `fato_pedido` NÃO tem itens de
  produto (não há `fato_pedido_item`). Itens por produto só existem em
  `fato_nota_fiscal_item` (ou seja, só após a NF). Para ranquear produto DENTRO da
  demanda em aberta (pedidos ainda sem NF), o dado de item de pedido pode não estar
  no cache. **Ação:** verificar `raw_pedido_*` / se o worker consegue trazer linhas
  de pedido; se não, declarar a limitação (não inventar número).

## 9. Perguntas ainda ABERTAS para a Mariane

1. **Métrica:** "demanda" e "produto com mais demanda" é por **valor (R$)**,
   **quantidade**, ou os dois?
2. **Granularidade:** demanda em aberta **consolidada do grupo** ou **por empresa**
   (com filtro de empresa)?
3. **Mapa fino de etapas:** confirmar os buckets marcados **(confirmar)** no §3
   (principalmente `Concluída`/`Confirmada`/`Confirmado` = fechada? `Peças` = venda?
   `Armazenagem - NF CONFIRMA` = ignorar?).

## 10. INVENTÁRIO , onde a lógica vive hoje (perícia a executar, ponto a ponto)

Cada item abaixo precisa ser auditado e atualizado para os critérios §1 a §7.

- **Queries base:** `src/lib/reports/queries/comercial.ts`,
  `src/lib/reports/queries/fiscal.ts` (+ testes).
- **Tools MCP fiscais de faturamento (~30):** `mcp/tools/fiscal/faturamento-*.ts`
  (periodo, mensal-serie, por-cfop, por-cliente, por-empresa, por-marca,
  por-operacao, por-regime, por-uf, por-vendedor, recebido, nao-autorizado),
  `receita-consolidada.ts`, `ponte-faturamento.ts`, `intercompany.ts`,
  `notas-emitidas*.ts`, `produtos-faturados.ts`, `vendas-produto-por-empresa.ts`,
  `contar-notas.ts`, `margem-aproximada.ts`.
- **Tools MCP comerciais (pedido/etapa/demanda):** `mcp/tools/comercial/*` , em
  especial `pedidos-por-etapa.ts`, `pedido-travados-por-etapa.ts`,
  `contar-pedidos.ts`, `pedidos-periodo.ts`, `pedidos-listar-top-valor.ts`,
  `pedidos-por-vendedor.ts`, `pedidos-por-uf.ts`, `pedidos-atrasados.ts`. E a tool
  nova `comercial_demanda_em_aberta` (a criar).
- **Relatórios da diretoria (front + lib + api):** `src/components/diretoria`,
  `src/lib/diretoria`, `src/app/(protected)/diretoria/*` (pedidos, vendas, agenda),
  `src/app/api/diretoria/*`, `src/app/(protected)/relatorios/*`.
- **Regra de prompt do Agente Nex:** `identity-base.ts` e afins , ensinar o
  vocabulário "demanda em aberta" e "faturamento de venda" com os critérios certos.

## 11. Metodologia proposta (a validar com o usuário)

Escopo é de raiz e grande. Seguir o workflow do projeto: SPEC (com os 2 reviews
adversariais) → PLAN (2 reviews) → execução em microtarefas com TDD, tudo com
**E2E contra o cache real** (bater cada número com SELECT manual). Primeiro
consolidar o helper de classificação (operação + intragrupo + venda-externa +
etapa-bucket) como núcleo único, depois propagar tool a tool / relatório a
relatório. Nada entra em produção sem validação do usuário.

## 12. Pendências de input do usuário antes de fechar a SPEC
- Respostas 1, 2, 3 da Mariane (§9).
- Confirmar se `Peças` é venda que entra no faturamento.
- Confirmar tratamento de `Venda Futura` (conta como faturamento quando? na
  emissão do faturamento futuro ou só na saída real?).
