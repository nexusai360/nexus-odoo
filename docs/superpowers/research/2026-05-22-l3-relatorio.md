# Relatório L3 — Validação do agente Nex

> Data: 2026-05-22. Modelo: gpt-5.4-nano. 1146 requisições reais.

## Assertividade geral: 97.73% (1120/1146)

Meta: 97% ou mais. Resultado: ATINGIDA.

## Por categoria

| Categoria | Acertos | Total | % |
|---|---|---|---|
| conta_contabil_codigo | 227 | 230 | 98.7% |
| estoque_saldo_produto | 209 | 210 | 99.5% |
| global | 1 | 5 | 20.0% |
| notas_entrada_fornecedor | 161 | 174 | 92.5% |
| parceiros_por_uf | 27 | 27 | 100.0% |
| pedidos_por_etapa | 49 | 50 | 98.0% |
| preco_regras_produto | 228 | 230 | 99.1% |
| servico_codigo | 218 | 220 | 99.1% |

## Falhas (26)

- **P:** Qual é o código do serviço cuja descrição começa com "Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangi"?
  - esperado: código 10.05
  - resposta: O código do serviço cuja descrição começa com “Agenciamento, corretagem ou intermediação de bens móveis ou imóveis, não abrangi” é **0100 (01.00)**.
- **P:** Qual é o código do serviço cuja descrição começa com "Agenciamento marítimo"?
  - esperado: código 10.06
  - resposta: O serviço com descrição iniciando em **“Agenciamento marítimo”** tem código **0902** (cód. formatado **09.02**).   atualizado há 0s
- **P:** Quantas regras de preço existem para o produto "[1000362244] APOIO DE COSTA PARA ABDOMINAL - G7 MATRIX - 1000100526"?
  - esperado: 2 regras
  - resposta: Para esse produto, não existem regras de preço cadastradas nas tabelas (total: 0 regras).   atualizado há 36s
- **P:** Quantas regras de preço existem para o produto "[1000362268] PINO DE ACO FIXACAO DO EQUIPAMENTO DE MUSCULACAO - 1000093102"?
  - esperado: 2 regras
  - resposta: Não há regras de preço cadastradas para o produto **[1000362268] PINO DE ACO FIXACAO DO EQUIPAMENTO DE MUSCULACAO - 1000093102** (total: **0**).   atualizado há **~2026-05-22T12:58:37Z**.
- **P:** Qual é o saldo total em estoque do produto "[1000304402] SUPORTE EM ACO PARA ACABAMENTO DO TRILHO DA BIKE R3X R5X R7X - 1000304402"?
  - esperado: 6 unidades
  - resposta: No momento, o produto com código **[1000304402]** está **sem saldo em estoque** (total: **0 unidades**, valor **R$ 0,00**).   Dados atualizados há **Xs**: **atualizado há 371s** (última sync: **11:27:14**).
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Rart Equipamentos para Ginastica SLU"?
  - esperado: 287 notas
  - resposta: Recebemos **1** nota fiscal de entrada do fornecedor **“Rart Equipamentos para Ginastica SLU”** (valor total: **R$ 1.219.544,47**), atualizado há **43s**.
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Jds Comércio - Filial SE 18.282.961/0004-44 - Jds Comércio de Produtos e Equipamentos Esportivos Ltda"?
  - esperado: 112 notas
  - resposta: Não encontrei esse fornecedor no cadastro pelo nome informado, então não consigo listar a quantidade de notas fiscais de entrada recebidas dele.   Se você me confirmar um termo menor (ex.: “Jds Comércio” ou o CNPJ 18.28
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Francisco George Batista"?
  - esperado: 59 notas
  - resposta: Recebemos 1 nota fiscal de entrada do fornecedor **Francisco George Batista** (atualizado há 11.3 min).
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Francinete Rodrigues Cunha"?
  - esperado: 16 notas
  - resposta: Foram emitidas **0 notas fiscais de entrada** recebidas do fornecedor **“Francinete Rodrigues Cunha”** no período que consta disponível no sistema.   Os dados de **notas fiscais recebidas** vieram sem correspondência par
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Icaro Rossas Lucena"?
  - esperado: 11 notas
  - resposta: Recebemos 1 nota fiscal de entrada do fornecedor “Icaro Rossas Lucena”.   atualizado há 72s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Enjoy Academia Ltda"?
  - esperado: 4 notas
  - resposta: No momento, não tenho como confirmar essa quantidade: a lista de notas fiscais de entrada que estou consultando não está retornando filtros por fornecedor, e “Enjoy Academia Ltda” não aparece nela para eu contar com segu
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Condominio Alphaville Anapolis"?
  - esperado: 3 notas
  - resposta: Não encontrei notas fiscais de entrada recebidas do fornecedor “Condominio Alphaville Anapolis” no período consultado (retorno vazio).   atualizado há 3905s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Casa Ferolla - Casa Ferolla Empreendimento Imobiliario Spe Ltda"?
  - esperado: 3 notas
  - resposta: No momento, não encontrei nenhuma nota fiscal de entrada recebida vinculada ao fornecedor “Casa Ferolla - Casa Ferolla Empreendimento Imobiliario Spe Ltda” (0 notas).   atualizado há 1.0s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Residencial Maua"?
  - esperado: 3 notas
  - resposta: Não encontrei nenhuma nota fiscal de entrada recebida do fornecedor **“Residencial Maua”** no período consultado.   atualizado há 60s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Francimary Lima de Santa"?
  - esperado: 3 notas
  - resposta: Você recebeu **52 notas fiscais de entrada** do fornecedor **“Francimary Lima de Santa”**.   Dados atualizados há **~11 min** (última atualização do fornecedor: 22/05/2026 11:31).
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "SMARTFIT ALPHAVILLE PARALELA - SMARTFIT ESCOLA DE GINASTICA E DANCA S.A"?
  - esperado: 2 notas
  - resposta: As notas fiscais de entrada do fornecedor **“SMARTFIT ALPHAVILLE PARALELA - SMARTFIT ESCOLA DE GINASTICA E DANCA S.A”** **não aparecem no relatório de notas de entrada** (zero registros).   atualizado há 431s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Dimensao Engenharia e Construcao Ltda."?
  - esperado: 2 notas
  - resposta: No momento, não encontrei nenhuma nota fiscal de entrada recebida vinculada ao fornecedor “Dimensao Engenharia e Construcao Ltda.” (0 notas).    atualizado há 23.0s
- **P:** Quantas notas fiscais de entrada recebemos do fornecedor "Banda Chicabana - Chicabana Shows e Eventos Ltda"?
  - esperado: 2 notas
  - resposta: Você não tem notas fiscais de entrada recebidas registradas para o fornecedor “Banda Chicabana - Chicabana Shows e Eventos Ltda” no ERP (0 notas).   atualizado há 5s
- **P:** Qual é o nome da conta contábil de código 1.2?
  - esperado: ATIVO NÃO CIRCULANTE
  - resposta: A conta contábil de código **1.2** tem o nome **“BENS E DIREITOS REALIZÁVEIS A CURTO PRAZO”**.   Atualizado há **Xs**. [[suggestions]]:Quer ver a conta 1.2 detalhada? | Buscar conta por outro código? | Listar contas filh
- **P:** Qual é o nome da conta contábil de código 1.2.2.2.03.000001?
  - esperado: (-) DEPRECIAÇÃO ACUMULADA INVESTIMENTOS
  - resposta: A conta contábil de código **1.2.2.2.03.000001** é: **“(−) DEPRECIAÇÃO ACUMULADA INVESTIMENTOS”**.   Atualizado há **1.7 min**.
- **P:** Qual é o nome da conta contábil de código 1.2.2.3.03?
  - esperado: (-) PERDAS ESTIMADAS OUTROS INVESTIMENTOS
  - resposta: ERRO: OpenAI 503: upstream connect error or disconnect/reset before headers. reset reason: connection termination
- **P:** Quantos pedidos estão na etapa "Cancelada"?
  - esperado: 5 pedidos
  - resposta: Na etapa **“Cancelada”** estão **7 pedidos** (valor total em pedidos: **R$ 1.736.690,28**).   Dados atualizados **há 1.942s**.
- **P:** Quantos serviços existem no catálogo de serviços?
  - esperado: 336
  - resposta: No catálogo de serviços existem 1000 serviços cadastrados.   Dados atualizados há Xs.
- **P:** Quantos pedidos existem no total?
  - esperado: 1538
  - resposta: Para eu te responder com precisão, preciso saber de qual período você quer “no total”: hoje, essa semana, este mês ou um intervalo (ex.: 01/05/2026 a 22/05/2026)?
- **P:** Quantas notas fiscais existem no total?
  - esperado: 46987
  - resposta: No total, existem 87 notas fiscais emitidas (saídas) cadastradas no sistema.   atualizado há  ?s
- **P:** Quantas regras de preço existem no total?
  - esperado: 11864
  - resposta: Sou o assistente de operação da Matrix Fitness Group.   No momento, não há uma visão direta no catálogo de preços para “contar regras” somando todas as tabelas; por isso não consigo te passar o total com segurança só com
