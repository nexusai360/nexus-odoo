# 01 , TODOS os fluxos, etapas e gatilhos

> Reconstruído do histórico REAL (`fato_pedido_historico`, 12.371 passagens) +
> config das etapas (`raw_pedido_etapa.data`, jsonb). A reunião cobriu só o fluxo
> de venda lucro real; aqui estão TODOS.

## 1. Como uma etapa "funciona" (os gatilhos)

Cada etapa (`raw_pedido_etapa.data`) tem um `nome`, um `tipo` (venda, romaneio,
transferencia_*, inventario, producao, compra, desmontagem, devolucao_venda,
requisicao, os, contrato_venda, evento...), uma `sequence` (ordem canônica no
fluxo), `obs`/`descricao`, `cor`, e um conjunto de **flags booleanos de gatilho**
que definem o que ela FAZ. Os grupos de gatilho (batem 1:1 com os prints):

- **Pedido (caixa):** `aprova_pedido` (marca como aprovado), `pausa_pedido`,
  `finaliza_pedido_confirmando` (conclui e confirma = fecha o pedido),
  `finaliza_pedido_cancelando` (conclui e cancela).
- **Faturamento (nota):** `inicia_faturamento`, `aprova_faturamento`,
  `finaliza_faturamento` (**emite/transmite a nota**), e as variações
  `_seguinte` e `_especifico` (notas seguintes/específicas, ex.: triangulação).
- **Estoque:** `inicia_estoque`, `aprova_estoque`, `finaliza_estoque`
  (confirma a movimentação de estoque).
- **Financeiro:** `inicia_financeiro`, `aprova_financeiro`, `finaliza_financeiro`.
- **Operação derivada / Desvio:** `inicia/aprova/finaliza_operacao_derivada`,
  `inicia/finaliza_desvio` (gera operações derivadas, ex.: triangulação, ou
  desvia o fluxo).
- Navegação: `pode_entrar`, `pode_sair`, `depois_entrar`, `depois_sair`.

**Notação de flags usada no dossiê:** `finFat/finConf/finEst` =
`finaliza_faturamento` / `finaliza_pedido_confirmando` / `finaliza_estoque`.
Ex.: `Emite NF Consumidor Final` = `ttf` (emite nota + conclui pedido, sem
finalizar estoque nessa etapa).

**Regra de ouro para "fim da demanda":** o pedido deixa de ser demanda aberta na
etapa que **emite a NF de venda ao cliente final** (`finaliza_faturamento=true`
numa etapa `tipo=venda` de faturamento ao consumidor final) e/ou **conclui o
pedido** (`finaliza_pedido_confirmando=true`). O nome "Emite NF" sozinho não
basta (há Emite NF de remessa, transferência, demonstração, bonificação).

## 2. Fluxo VENDA a consumidor final (o principal , lucro real/presumido/simples)

Ordem canônica (sequence) com os gatilhos e volume real de pedidos:

| seq | etapa | flags | papel |
|---|---|---|---|
| 32 | Venda direta consumidor final | fff | lançamento do pedido (ainda NÃO aprovado) |
| 0 | Aguardando Autorização | fff | Tatiana confere financeiro (NÃO aprovado) |
| 38 | Aprovado | fff | **aprovado , começa a demanda aberta** |
| 27 | Input financeiro | fff | lança parcelas/boletos pagos |
| 39 | GERA BOLETO | fff | gera boletos ao cliente |
| 30 | Reserva de Estoque - DEFINE ARMAZEM | fff (romaneio) | inicia separação |
| 34 | Reserva de Estoque - CONFIRMA MOVIMENTAÇÃO | fft | confirma movimentação de estoque |
| 31 | SEPARAÇÃO ESTOQUE CONCLUIDO | fff | separação pronta, libera emissão |
| 40/41 | Fracionar / Novo Fracionamento | fff | define entregas parciais |
| 49 | FAT Cliente final | fff | prepara faturamento ao cliente |
| 54/55/56 | VF - Fat Cliente Final Real/Presumido/Simples | fff | faturamento por regime |
| 14 | **Emite NF Consumidor Final** | **ttf** | **emite a NF de venda , FECHA a demanda** |
| 16 | Nota emitida e não entregue. | fff (romaneio) | **exceção: continua demanda mesmo com NF** |

Observações do dado real:
- O fluxo NÃO é linear: pedidos voltam etapas (ex.: PV-2037 passou Aprovado →
  Input financeiro → Aguardando Autorização → VF-Mudar → Aprovado de novo). Por
  isso a **etapa ATUAL** é a que vale para classificar demanda, e o **histórico**
  conta a jornada.
- `Emite NF Consumidor Final`: 536 pedidos passaram por ela (etapa terminal de venda).
- O regime (lucro real / presumido / simples nacional) vem da OPERAÇÃO
  (`0-Venda Lucro Real 5102/6102/6108`, `...Lucro Presumido...`, `...Simples
  Nacional...`), não da etapa. As três são VENDA a cliente final (ver 02).

### Subfluxo VENDA DE PEÇAS (é venda, valor baixo)
Venda Peças(0) → Preview NF - Peças(1) → Input Financeiro - Peças(6) → Emite NF -
Peças(7, tff) → Reserva Estoque - Peças(10, fft) → Gera Boleto - Peças(17, ftf).
`Emite NF - Peças` emite a nota (fecha a demanda de peças). 206 pedidos de
`Venda de Peças (venda)`, R$295k (ticket pequeno). **Confirmar com a Mariane se
entra no faturamento de venda** (provavelmente sim, é venda real).

### Subfluxo VENDA FUTURA (VF)
VF - Mudar(1) → VF - SEGUIR COM RESERVA/FRACIONAMENTO(2) → VF - Input Financeiro(53)
→ VF - Fat Cliente Final Real/Presumido/Simples(54/55/56) → VF - Emite NF(19, ttf).
Faturamento antecipado (mercadoria ainda não sai). **Confirmar quando conta como
faturamento** (na emissão do faturamento futuro ou só na saída física).

### Subfluxos que usam operação (venda) mas NÃO são venda a cliente externo
(devem SAIR do faturamento de venda, ver 02/03):
- **Triangulação intragrupo:** FAT JDS x GRUPO(1) → FAT JDS X GRUPO CONFIRMA(44) →
  TRANSF LP/LR Matriz-Filial(45/47) → FAT TRANSF CONFIRMA(48). `[SMARTFIT] - FAT
  JDS X GRUPO`. Vende de uma empresa do grupo para outra antes do cliente final.
- **Simples Remessa:** Pedido - SIMPLES REMESSA(31) → Preview NF - SIMPLES
  REMESSA(33) → Emite NF - SIMPLES REMESSA(35, ttf).
- **Bonificação:** REMESSA DE BONIFICAÇÃO(0) → PREVIEW NF BONIFICAÇÃO(4) → EMITE NF
  BONIFICAÇÃO(5, ttf) e BONIFICAÇÃO RESERVA/CONFIRMA ESTOQUE.
- **Armazenagem:** Remessa de Armazenagem(27) → ESTOQUE ARMAZENAGEM RESERVA(5) →
  Armazenagem - NF(36) → Armazenagem - NF CONFIRMA(38, ttf) → Retorno de
  Armazenagem(3). Remessa/retorno de armazém geral (não é venda ao cliente).
- **Transf. DF x Sergipe / Retorno transferência SERGIPE x DF:** triangulação entre
  filiais.

## 3. Fluxo PRODUÇÃO (montagem de kit) , NÃO é venda
Aguardando montagem(78) → Em montagem(79) → Concluída(80, ftt). Monta kits de
produto (`Montagem de kit (produção)`, 445 pedidos). Alimenta estoque, não fatura
a cliente. `Cancelada` (desmontagem) desfaz.

## 4. Fluxo INVENTÁRIO , NÃO é venda
Em contagem(78) → Em conferência(79) → Confirmado(78/79, ftt). Ajuste/contagem de
estoque (`INVENTÁRIO JDS ...`, valores enormes por serem saldo, não venda).

## 5. Fluxo COMPRA , NÃO é venda (é entrada)
Em cotação/provisório(2) → Aguardando autorização(5) → Aprovado(6). Compra de
fornecedor (`Compra Johnson`).

## 6. Fluxo TRANSFERÊNCIA (entre empresas do grupo) , NÃO é venda externa
- **Solicitação:** Pedido Transferência(26) → Preview NF(37) → Emite NF(39, ttt) →
  Reserva de Estoque(41). Emite nota de transferência (intragrupo).
- **Saída:** Em separação(401) / Em trânsito(501).
- **Entrada:** Em trânsito(501) → Confirmada(502, ftt) → Cancelado(503).

## 7. Fluxo DEMONSTRAÇÃO / ROMANEIO , NÃO é venda
- **Ida:** Pedido demonstração(40) → Reserva de Estoque Demo(41) → Preview
  Demonstração(42) → Demonstração confirma(43, ttt).
- **Retorno:** Retorno Demonstração(48) → Reserva retorno demonstração(9) →
  Confirma reserva retorno demonstração(10) → Preview Retorno Demo(21) → Emite NF
  Retorno Demo(23, ttt) → (DEMO) MOV/CONFIRMA(25/26). Remessa de mercadoria para
  demonstração e seu retorno (não fatura venda).

## 8. Fluxo DEVOLUÇÃO / GARANTIA / EXPOSIÇÃO , NÃO é venda
- Devolução: `Devolução em solicitação` (devolucao_venda).
- Garantia: `Emite NF Saída Garantia` (romaneio, tf).
- Exposição/feira: `Confirma exposição/feira` / `Confirma retorno exposição/feira`.

## 9. Etapas de CANCELAMENTO (todos os tipos)
`Cancelado` / `Cancelada` (com `finaliza_pedido_cancelando=true`) em venda,
transferência, inventário, romaneio, desmontagem. Saem de qualquer métrica de
demanda/faturamento.

## 10. Leitura de negócio dos gatilhos (para o motor de classificação)
- **`aprova_pedido=true`** , marca o ponto em que o pedido passa a contar como
  demanda (ex.: `Aprovado`, `Demonstração confirma`, `Em montagem`).
- **`finaliza_faturamento=true`** , a etapa emite/transmite uma nota. É "saída da
  demanda" SOMENTE quando a operação é venda a cliente final externo.
- **`finaliza_pedido_confirmando=true`** , conclui o pedido (fecha o ciclo).
- **`finaliza_estoque=true`** , confirma a movimentação de estoque (a mercadoria
  de fato saiu/entrou). Chave para diferenciar "nota sem movimento" (gambiarra pro
  banco) de saída real.
- **`finaliza_pedido_cancelando=true`** , cancela.
Combinando (operação + tipo de etapa + esses flags) o sistema classifica sem
depender de listas de nomes escritas à mão.
