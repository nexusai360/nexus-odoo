# Frente B , Etapas da venda e cores (mapa completo contra o dado real)

Data: 2026-07-20. Fonte: cache Postgres `nexus_odoo_l1` (container `nexus-odoo-db-1`,
porta 5436) + código do repo. Objetivo: renderizar cada etapa como tag com a MESMA cor
que aparece no Odoo.

## TL;DR (o que muda o jogo)

1. **A cor JÁ está ingerida no cache.** O campo se chama `cor` (não `color`), fica em
   `raw_pedido_etapa.data->>'cor'`. Não precisa sincronizar nada novo.
2. **A cor NÃO é o índice inteiro 0-11 da paleta padrão do Odoo.** O módulo SPED da Tauga
   guarda a cor como **string hexadecimal literal** (ex.: `#fa7e1e`, `#00b159`, `#740001`).
   Ou seja: **usar o hex direto como cor da tag**, sem tabela de-para de paleta.
3. Quando a etapa não tem cor definida, `cor` vem como **`false` (booleano JSON)**, não
   string. Nesse caso renderizar cinza/neutro (é o "vazio" que você viu no Odoo).
4. A cor **não é propagada para nenhuma tabela `fato_*`** hoje. Para a tag, a UI/consulta
   tem que ler `cor` do `raw_pedido_etapa` (join por `etapa_id`), ou passamos a carregar
   `etapa_cor` junto de `etapa_nome`/`etapa_id` no `fato_pedido`. Nenhum código TS lê `cor`
   ainda (grep vazio).
5. Os **27 IDs do relatório oficial de entregas parciais classificam TODOS como
   `bucketDemanda = ABERTA`** na nossa lógica. A divergência não está dentro dos 27; está no
   fato de a nossa lógica classificar dinamicamente **todas** as etapas por gatilho, então
   ela conta como ABERTA várias etapas de venda que **não** estão na lista fixa de 27 (ver
   seção 4).

---

## 1. Onde as etapas vivem no cache

### Tabela raw
- **Tabela:** `raw_pedido_etapa` (modelo Prisma `RawPedidoEtapa`, `prisma/schema.prisma`
  ~linha 1033).
- **Schema da tabela (colunas físicas):**

  | coluna | tipo | observação |
  |---|---|---|
  | `odoo_id` | Int (PK) | id da etapa no Odoo |
  | `data` | Json (jsonb) | payload completo do registro Odoo (todos os campos) |
  | `odoo_write_date` | DateTime? | `write_date` do Odoo |
  | `synced_at` | DateTime | quando entrou no cache |
  | `raw_deleted` | Boolean | soft-delete da reconciliação |

  Toda a informação de negócio (nome, cor, gatilhos, tipo) vive **dentro do `data`
  jsonb**, não em colunas próprias. É um raw "espelho" do Odoo.

### Ingestão (worker)
- Registrado em `src/worker/catalog/model-catalog.ts:90`:
  `{ odooModel: "pedido.etapa", mode: "incremental" }`.
- **Sem lista de `fields` restrita** => o worker puxa o registro inteiro do Odoo, por isso
  `cor`, `icone`, `tipo`, todos os `finaliza_*`/`aprova_*` já estão no `data`.
- Não há builder que crie um `fato_pedido_etapa`. A etapa é consumida por join a partir do
  `raw_pedido_etapa` nos builders de classificação (`src/worker/fatos/fato-pedido-classificacao.ts`).

### Onde etapa aparece nos fatos (só id/nome, nunca cor)
- `fato_pedido`: colunas `etapa_id`, `etapa_nome`, `etapa_finaliza`, `pendencia_etapa`.
- `fato_pedido_etapa_historico` (modelo O3): `etapa_id`, `etapa_nome`, `etapa_tipo`,
  `tempo_etapa_dias`. **Nenhuma dessas carrega a cor.**

### Volume real
- `raw_pedido_etapa`: **239 registros** ativos (todos `active=true`, nenhum `raw_deleted`).
- Distribuição por `tipo` (top): **venda = 79** (bate com a tela "Etapas da venda" do Odoo),
  romaneio = 64, compra = 10, requisicao = 9, os = 7, transferencia_saida = 6, etc.
- As 79 de `tipo = 'venda'` são o universo da tela que interessa. As demais 160 são de
  outros fluxos (romaneio, compra, produção, ...).

---

## 2. O campo de COR

- **Coluna lógica:** `data->>'cor'` em `raw_pedido_etapa`.
- **Tipo:** heterogêneo por design do Odoo:
  - **string** quando definida: hexadecimal literal, ex. `#fa7e1e`, `#00b159`, `#740001`,
    `#272f38`, `#0091ff`.
  - **`false` (boolean JSON)** quando não definida => 121 dos 239 registros; renderizar cinza.
- **NÃO é índice 0-11.** Confirmado: `jsonb_typeof(data->'cor')` retorna `string` para as
  cores e `boolean` para os vazios; nunca `number`. Portanto **não existe paleta de-para** a
  construir , a cor final é o próprio hex.
- Campo `icone`: existe mas está `false` em 100% dos registros (não há ícone para usar).
- **Nada precisa ser sincronizado a mais.** O worker já traz `cor`. Se um dia o dono mudar a
  cor de uma etapa no Odoo, o ciclo incremental atualiza o `data` (write_date muda) e o hex
  novo aparece no cache automaticamente.

### Amostra da diversidade de cores (venda)
Há ~68 hexes distintos no total. Exemplos usados nas etapas de venda: `#fa7e1e` (laranja),
`#00b159` (verde), `#740001` (vinho), `#272f38` (grafite), `#d979a2` (rosa), `#006188`
(azul-petróleo), `#4ac2bb` (ciano), `#c65d52` (terracota), `#1795b5` (azul), `#ff9500`/
`#ffbb00`/`#f5a700`/`#ffd500` (família amarelo/laranja Sergipe), `#0091ff` (azul).

> Recomendação de implementação: `const cor = (data.cor && typeof data.cor === 'string') ?
> data.cor : null;` e cair para um token neutro (`bg-muted`/cinza) quando `null`. Garantir
> contraste do texto calculando luminância do hex (texto branco/preto conforme o fundo),
> porque a paleta do dono varia de `#ffffff` a `#000000`.

---

## 3. Enumeração completa das 79 etapas de venda

Colunas: `id` = odoo_id; `cor` = valor cru (`false` = sem cor); `fpc` =
finaliza_pedido_confirmando; `fpx` = finaliza_pedido_cancelando; `ff` =
finaliza_faturamento; `27` = está na lista oficial de 27; `bucket` = classificação da nossa
lógica (`classificaEtapaDemanda`).

| id | nome (cru do Odoo) | cor | fpc | fpx | ff | 27 | bucket |
|---|---|---|---|---|---|---|---|
| 3 | Venda direta consumidor final | false | · | · | · |  | ABERTA |
| 4 | VF - Aguardando autorização | #fa7e1e | · | · | · | SIM | ABERTA |
| 5 | Aprovado | #00b159 | · | · | · | SIM | ABERTA |
| 6 | Cancelado | false | · | · | · |  | ABERTA |
| 86 | Input financeiro | #d979a2 | · | · | · | SIM | ABERTA |
| 88 | Preview Fat Cliente Final | #6a0d83 | · | · | · |  | ABERTA |
| 89 | Emite NF Consumidor Final | #272f38 | t | · | t |  | FECHADA |
| 90 | FAT JDS x GRUPO | #dd4124 | · | · | · |  | ABERTA |
| 91 | FAT JDS X GRUPO CONFIRMA | #dd4124 | · | · | · |  | ABERTA |
| 93 | FAT Cliente final | #8b8800 | · | · | · |  | ABERTA |
| 94 | Aprovação diretoria | #740001 | · | · | · | SIM | ABERTA |
| 95 | Aprovação dono | #740001 | · | · | · | SIM | ABERTA |
| 98 | Pedido Transferência Matriz/Filial | #ffffff | · | · | · |  | ABERTA |
| 100 | TRANSF LR Matriz - Filial | false | · | · | · |  | ABERTA |
| 101 | TRANSF LP Matriz - Filial | false | · | · | · |  | ABERTA |
| 102 | TRANSF SN Matriz - Filial | false | · | · | · |  | ABERTA |
| 103 | VF 5922/6922 - PDV | #c65d52 | · | · | · | SIM | ABERTA |
| 106 | Remessa de Armazenagem 5905/6905 | false | · | · | · |  | ABERTA |
| 110 | Emite NF Transferência | #272f38 | t | · | t |  | FECHADA |
| 111 | Preview NF - Transferência | #6a0d83 | · | · | · |  | ABERTA |
| 116 | Preview Retorno Demo | #6a0d83 | · | · | · |  | ABERTA |
| 117 | Emite NF Retorno Demo | #272f38 | t | · | t |  | FECHADA |
| 120 | VF - Fracionar | #006188 | · | · | · | SIM | ABERTA |
| 121 | VF - Novo Fracionamento | #4ac2bb | · | · | · | SIM | ABERTA |
| 122 | VF - Fracionamento concluído | #00b159 | t | · | · |  | FECHADA |
| 123 | VF - Cancelado | #ff0000 | · | t | · |  | IGNORAR |
| 124 | VF - Input Financeiro | #d979a2 | · | · | · | SIM | ABERTA |
| 125 | VF - Fat Cliente Final Real | #8b8802 | · | · | · |  | ABERTA |
| 126 | VF - Fat Cliente Final Presumido | #8b8800 | · | · | · |  | ABERTA |
| 127 | VF - Fat Cliente Final Simples | #8b8800 | · | · | · |  | ABERTA |
| 128 | VF - Emite NF | #272f38 | t | · | t |  | FECHADA |
| 129 | VF - Aprovado | #00b159 | · | · | · | SIM | ABERTA |
| 130 | Aguardando Autorização | #fa7e1e | · | · | · | SIM | ABERTA |
| 132 | Fracionar | #006188 | · | · | · | SIM | ABERTA |
| 133 | Novo Fracionamento | #4ac2bb | · | · | · | SIM | ABERTA |
| 134 | Fracionamento concluído | #00b159 | t | · | · |  | FECHADA |
| 151 | FAT TRANSF CONFIRMA | #2cba43 | · | · | · |  | ABERTA |
| 154 | CORREÇÃO | #fa0000 | · | · | · |  | ABERTA |
| 155 | CORREÇÃO - Preview | #ff0000 | · | · | · |  | ABERTA |
| 156 | CORREÇÃO - Emite NF | #ff0000 | · | · | t |  | FECHADA |
| 158 | Venda Peças | #d400ff | · | · | · |  | ABERTA |
| 159 | Input Financeiro - Peças | #d400ff | · | · | · |  | ABERTA |
| 160 | Reserva Estoque - Peças | #e100ff | · | · | · |  | ABERTA |
| 161 | Preview NF - Peças | #e100ff | · | · | · |  | ABERTA |
| 162 | Emite NF - Peças | #e100ff | · | · | t |  | FECHADA |
| 163 | Pedido - SIMPLES REMESSA | #00ff1e | · | · | · |  | ABERTA |
| 164 | Preview NF - SIMPLES REMESSA | #04ff00 | · | · | · |  | ABERTA |
| 165 | Emite NF - SIMPLES REMESSA | #1eff00 | t | · | t |  | FECHADA |
| 167 | GERA BOLETO | #f36a30 | · | · | · | SIM | ABERTA |
| 171 | VF - SEGUIR COM RESERVA/FRACIONAMENTO - 5117/6117 | #1795b5 | · | · | · | SIM | ABERTA |
| 174 | Gera Boleto - Peças | #d400ff | t | · | · |  | FECHADA |
| 175 | V.O 5119/6119 - PDV | false | · | · | · |  | ABERTA |
| 179 | VF - 5117/6117 | false | · | · | · | SIM | ABERTA |
| 180 | V.O - 5923/6923 | false | · | · | · | SIM | ABERTA |
| 181 | V.O - Fat Cliente Presumido | false | · | · | · |  | ABERTA |
| 182 | V.O - Emite NF | false | · | · | t |  | FECHADA |
| 183 | V.O - Input Financeiro | false | · | · | · | SIM | ABERTA |
| 184 | V.O - Aguardando Autorização | false | · | · | · |  | ABERTA |
| 185 | V.O - Aprovado | false | · | · | · | SIM | ABERTA |
| 186 | V.O - Aprovação Dono | false | · | · | · | SIM | ABERTA |
| 187 | V.O - Aprovação diretoria | false | · | · | · | SIM | ABERTA |
| 188 | V.O - Fat Cliente Real | false | · | · | · |  | ABERTA |
| 189 | V.O - Fat Cliente Simples | false | · | · | · |  | ABERTA |
| 195 | VF - Mudar | #f3841b | · | · | · |  | ABERTA |
| 202 | Transf. DF x Sergipe Preview | #ff9500 | · | · | · | SIM | ABERTA |
| 203 | Transf. DF x Sergipe confirma | #ffbb00 | · | · | · | SIM | ABERTA |
| 204 | Retorno transferencia SERGIPE x DF | #f5a700 | · | · | · | SIM | ABERTA |
| 205 | Retorno transferencia SERGIPE x DF CONFIRMA | #ffd500 | · | · | · | SIM | ABERTA |
| 206 | [SMARTFIT] - FAT JDS X GRUPO | #879801 | · | · | · |  | ABERTA |
| 207 | [SMARTFIT] - FAT JDS X GRUPO CONFIRMA | #8a9400 | · | · | · |  | ABERTA |
| 211 | REMESSA DE BONIFICAÇÃO 5910/6910 | #d400ff | · | · | · |  | ABERTA |
| 213 | PREVIEW NF BONIFICAÇÃO | #ee00ff | · | · | · |  | ABERTA |
| 214 | EMITE NF BONIFICAÇÃO | #fb00ff | t | · | t |  | FECHADA |
| 218 | FAT JDS X GRUPO BONIFICAÇÃO | #bb00ff | · | · | · |  | ABERTA |
| 219 | FAT JDS X GRUPO BONIFICAÇÃO CONFIRMA | #e100ff | · | · | · |  | ABERTA |
| 222 | Fracionar (Retorno armazenagem) | #639900 | · | · | · |  | ABERTA |
| 253 | CONF. MOV. ESTOQUE - FLUXO SERGIPE | #62fec2 | · | · | · |  | ABERTA |
| 254 | FAT JIB DF X GRUPO | #8c00ff | · | · | · |  | ABERTA |
| 255 | FAT JIB DF X GRUPO CONFIRMA | #c800ff | · | · | · |  | ABERTA |

Observações:
- **18 das 79 etapas de venda não têm cor** (`false`): 3, 6, 100, 101, 102, 106, 175, 179,
  180, 181, 182, 183, 184, 185, 186, 187, 188, 189. Todo o bloco `V.O -` (180-189) e alguns
  transfer/PDV estão sem cor no Odoo (renderizariam cinza lá também).
- A classificação `bucket` acima é a mesma da função pura `classificaEtapaDemanda`
  (`src/lib/fiscal/regras/classifica-etapa-demanda.ts`): cancelamento => IGNORAR; exceção
  "Nota emitida e não entregue" => ABERTA; `finaliza_faturamento` ou
  `finaliza_pedido_confirmando` => FECHADA; senão ABERTA.

---

## 4. Os 27 IDs do relatório oficial e a nossa classificação

Lista oficial (entregas parciais):
`130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167, 202, 203, 204, 205,
179, 180, 185, 186, 187, 183, 226`.

**Resultado: os 27 caem TODOS em `bucketDemanda = ABERTA`** pela nossa lógica de gatilhos.
Nenhum deles tem `finaliza_pedido_confirmando`, `finaliza_pedido_cancelando` ou
`finaliza_faturamento` marcado; e o id 226 é a exceção explícita "Nota emitida e não
entregue".

| id | nome | cor | tipo | bucket (nosso) |
|---|---|---|---|---|
| 4 | VF - Aguardando autorização | #fa7e1e | venda | ABERTA |
| 5 | Aprovado | #00b159 | venda | ABERTA |
| 86 | Input financeiro | #d979a2 | venda | ABERTA |
| 87 | Reserva de Estoque - DEFINE ARMAZEM | #499292 | **romaneio** | ABERTA |
| 94 | Aprovação diretoria | #740001 | venda | ABERTA |
| 95 | Aprovação dono | #740001 | venda | ABERTA |
| 103 | VF 5922/6922 - PDV | #c65d52 | venda | ABERTA |
| 120 | VF - Fracionar | #006188 | venda | ABERTA |
| 121 | VF - Novo Fracionamento | #4ac2bb | venda | ABERTA |
| 124 | VF - Input Financeiro | #d979a2 | venda | ABERTA |
| 129 | VF - Aprovado | #00b159 | venda | ABERTA |
| 130 | Aguardando Autorização | #fa7e1e | venda | ABERTA |
| 132 | Fracionar | #006188 | venda | ABERTA |
| 133 | Novo Fracionamento | #4ac2bb | venda | ABERTA |
| 167 | GERA BOLETO | #f36a30 | venda | ABERTA |
| 171 | VF - SEGUIR COM RESERVA/FRACIONAMENTO - 5117/6117 | #1795b5 | venda | ABERTA |
| 179 | VF - 5117/6117 | false | venda | ABERTA |
| 180 | V.O - 5923/6923 | false | venda | ABERTA |
| 183 | V.O - Input Financeiro | false | venda | ABERTA |
| 185 | V.O - Aprovado | false | venda | ABERTA |
| 186 | V.O - Aprovação Dono | false | venda | ABERTA |
| 187 | V.O - Aprovação diretoria | false | venda | ABERTA |
| 202 | Transf. DF x Sergipe Preview | #ff9500 | venda | ABERTA |
| 203 | Transf. DF x Sergipe confirma | #ffbb00 | venda | ABERTA |
| 204 | Retorno transferencia SERGIPE x DF | #f5a700 | venda | ABERTA |
| 205 | Retorno transferencia SERGIPE x DF CONFIRMA | #ffd500 | venda | ABERTA |
| 226 | Nota emitida e não entregue. | #0091ff | **romaneio** | ABERTA (exceção) |

### A divergência (o ponto-chave)
- **Dois dos 27 não são `tipo = venda`:** id 87 (`Reserva de Estoque - DEFINE ARMAZEM`) e id
  226 (`Nota emitida e não entregue.`) são **`tipo = romaneio`**. Ou seja, a lista oficial
  não é "as etapas de venda"; é um recorte manual que mistura venda + romaneio.
- **A nossa lógica é dinâmica, a oficial é uma lista fixa.** Nós classificamos ABERTA/FECHADA
  por gatilho em TODAS as etapas. Resultado: o nosso "demanda aberta" inclui **muitas etapas
  de venda ABERTA que não estão nos 27** (ex.: 3, 88, 90, 91, 93, 111, 116, 125, 126, 127,
  151, 154, 155, 158, 159, 160, 161, 163, 164, 175, 181, 184, 188, 189, 195, 206, 207, 211,
  213, 218, 219, 222, 253, 254, 255). Por isso os totais podem não bater com o relatório
  oficial: a base do oficial é mais estreita (27 etapas escolhidas a dedo).
- Dentro da interseção, não há conflito de rótulo: os 27 são todos ABERTA para nós também.
  A diferença é de **cobertura** (quais etapas entram na conta), não de rótulo por etapa.

---

## 5. Padronização de capitalização pedida pelo dono

Regra do dono: **primeira letra maiúscula, resto minúsculo; siglas de 2 letras (DF, NF, VF)
todas maiúsculas.**

Interpretação aplicada (sentence-case no nome inteiro, preservando as siglas de 2 letras em
caixa alta e mantendo pontuação/números como estão):

| nome cru | após a regra |
|---|---|
| VF - Aguardando autorização | VF - Aguardando autorização |
| Aprovação diretoria | Aprovação diretoria |
| GERA BOLETO | Gera boleto |
| CORREÇÃO - Emite NF | Correção - Emite nf → **Correção - Emite NF** (NF é sigla 2 letras) |
| Aguardando Autorização | Aguardando autorização |
| VF - Novo Fracionamento | VF - Novo fracionamento |
| Transf. DF x Sergipe Preview | Transf. DF x sergipe preview |
| Retorno transferencia SERGIPE x DF | Retorno transferencia sergipe x DF |
| Nota emitida e não entregue. | Nota emitida e não entregue. |
| REMESSA DE BONIFICAÇÃO 5910/6910 | Remessa de bonificação 5910/6910 |
| EMITE NF BONIFICAÇÃO | Emite NF bonificação |
| V.O - Input Financeiro | V.o - input financeiro (ver ressalva) |
| VF 5922/6922 - PDV | VF 5922/6922 - pdv (ver ressalva) |

### Ressalvas que precisam de decisão do dono (a regra "2 letras" não cobre)
A regra literal só protege siglas de **2 letras**. No dado real aparecem tokens que ficariam
estranhos em minúsculo se seguirmos a regra ao pé da letra:
- **Siglas de 3+ letras:** `PDV`, `JDS`, `JIB`, `SMARTFIT` viram `Pdv`, `Jds`, `Jib`,
  `Smartfit`. Provavelmente o dono quer manter maiúsculas.
- **Sigla de 2 letras com ponto:** `V.O` (bloco 180-189) tem 2 letras mas com ponto no
  meio; pela regra de "sentence case" viraria `V.o`. Precisa confirmar se `V.O` deve ficar
  todo maiúsculo (recomendado, por simetria com VF/DF).
- **Códigos CFOP numéricos** (`5117/6117`, `5922/6922`, `5905/6905`, `5910/6910`): não têm
  caixa, ficam intocados. OK.
- **`SN`, `LR`, `LP`** (TRANSF SN/LR/LP Matriz - Filial): são siglas de 2 letras => a regra
  as mantém maiúsculas (`SN`, `LR`, `LP`). Provavelmente correto.

Recomendação: implementar a regra como (1) sentence-case do nome, (2) um **allowlist de
siglas** que ficam sempre em caixa alta , começando por DF, NF, VF e estendendo para V.O,
PDV, JDS, JIB, SN, LR, LP, SMARTFIT , em vez de derivar só de "tem 2 letras". Assim o
resultado casa com a intenção do dono e não quebra os códigos de 3+ letras. Confirmar a lista
final de siglas com ele antes de fixar.

---

## Referências de código
- `prisma/schema.prisma` (~1033): `model RawPedidoEtapa`.
- `src/worker/catalog/model-catalog.ts:90`: ingestão de `pedido.etapa` (raw completo, cor incluída).
- `src/lib/fiscal/regras/classifica-etapa-demanda.ts`: função pura ABERTA/FECHADA/IGNORAR.
- `src/worker/fatos/fato-pedido-classificacao.ts`: onde os gatilhos da etapa são lidos do raw
  e cruzados com a operação para gerar `bucket_demanda` (nenhuma cor é carregada aqui).
- Nenhum arquivo TS lê `cor` hoje (grep vazio) , é campo virgem para a Frente B consumir.
