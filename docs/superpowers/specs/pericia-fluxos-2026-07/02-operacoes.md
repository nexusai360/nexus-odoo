# 02 , Operações (126) e a classificação "venda real a cliente externo"

## 1. Tipos de operação (do cache, por pedido)
`fato_pedido.operacao_nome` traz o tipo entre parênteses. Distribuição real:

| tipo | pedidos | é venda a cliente externo? |
|---|---|---|
| venda | 1276 | **candidato** (depende de CFOP + nome + participante) |
| produção | 448 | não (montagem de kit) |
| transferência [entrada] | 163 | não (intragrupo) |
| transferência [solicitação] | 157 | não (intragrupo) |
| romaneio | 146 | não (demonstração/remessa) |
| inventário | 82 | não (ajuste de estoque) |
| compra | 25 | não (entrada) |
| transferência [saída] | 16 | não (intragrupo) |
| devolução [venda] | 1 | não |

## 2. Por que o TIPO `venda` não basta
Dentro de `tipo=venda` há operações que NÃO são venda a cliente externo. Os flags
`gera_faturamento/gera_estoque/gera_financeiro` ajudam mas não fecham (ex.:
`REMESSA DE ARMAZENAGEM (RETORNO -TERCEIROS)` é `ttt`, igual a uma venda real). O
separador confiável é o **CFOP embutido no nome da operação** + o **participante**:

| operação (tipo venda) | flags | leitura |
|---|---|---|
| 0-Venda Lucro Real 5102/6102/6108 | ttt | **VENDA REAL** (512) |
| 0-Venda Lucro Presumido 5102/6102/6108 | ttt | **VENDA REAL** (248) |
| 0-Venda Simples Nacional 5102/6102/6108 | ttt | **VENDA REAL** (210) |
| Venda de Peças | ttt | **VENDA REAL** (206, confirmar) |
| Venda 5117/6117 (Real/Presumido/Simples) | ttf | venda à ordem (confirmar) |
| Venda à Ordem 5119/6119 | ttt | venda à ordem |
| Venda Futura 5922/6922 | tft | **venda futura** (fatura antes da saída, confirmar quando conta) |
| REMESSA DE ARMAZENAGEM 5906/6906 | ttt | **não** (armazém geral) |
| Remessa Armazenagem 5905/6905 | ttf | **não** |
| REMESSA DE BONIFICAÇÃO 5910/6910 | ttf | **não** (brinde/doação) |
| Simples Remessa | ttf/tff | **não** |
| Remessa por Conta e Ordem 5923/6923 | ttt | **não** (remessa) |
| Demonstração 5912/6912 | ttf | **não** |
| Correção (vários CFOP) | tff/ttf | **não** (nota de correção) |
| Devolução de compra 5202/6202 | ttt | **não** |

## 3. Dicionário de CFOP (prefixo no nome da operação)
- **5101/5102/5103/6102/6108** , venda de mercadoria , **conta como venda**.
- **5117/6117** , venda à ordem , confirmar se entra.
- **5119/6119** , venda à ordem (entrega futura) , confirmar.
- **5922/6922** , simples faturamento de venda para entrega futura (venda futura).
- **5152/6152** , transferência entre estabelecimentos , **não é venda**.
- **5905/5906/6905/6906** , remessa/retorno para depósito/armazém geral , **não**.
- **5910/6910** , remessa em bonificação/doação/brinde , **não**.
- **5912/6912** , remessa para demonstração , **não**.
- **5202/6202** , devolução de compra , **não**.
- **1913/2913** , retorno/correção , **não**.

## 4. Intragrupo (triangulação) , empresas do grupo
Vendas em que o **participante (cliente) é uma empresa do próprio grupo** são
intragrupo e saem do faturamento de venda externa. CNPJ base das empresas do grupo
(de `empresa_nome` em `fato_pedido`/`fato_nota_fiscal`):

`18.282.961` Jds, `34.161.829` Jht SP, `33.718.546` Jib DF, `10.557.556` Jht DF,
`07.390.039` JHT Brasília, `34.461.908` Ks, `35.156.509` Cs, `45.424.185` Jmf.

**Regra:** se o participante da nota/pedido tem CNPJ base do grupo, é intragrupo.
Já há tratamento parcial (`fiscal/intercompany.ts`, `receita-consolidada.ts`,
`ponte-faturamento.ts`, CFOP bruto×real com `receitaIntragrupo`). O trabalho é
**uniformizar** um único critério em toda a plataforma.

## 5. Helper de classificação a construir (núcleo único)
`classificaOperacao(operacao_nome, participante_nome)` retorna:
- `categoria`: VENDA_EXTERNA | VENDA_INTRAGRUPO | TRANSFERENCIA | REMESSA |
  BONIFICACAO | DEMONSTRACAO | ARMAZENAGEM | DEVOLUCAO | PRODUCAO | INVENTARIO |
  COMPRA | CORRECAO | OUTRO.
- `entraFaturamentoVenda`: boolean (true só p/ VENDA_EXTERNA, e VENDA_FUTURA/PEÇAS
  conforme decisão pendente).
- `entraDemanda`: boolean (o pedido, quando aberto, entra na demanda , só vendas a
  cliente final; ver 03).
Regra = tipo da operação + CFOP do nome + (participante externo x grupo). Este
helper alimenta TODAS as tools/relatórios (fim das listas de nomes à mão).
