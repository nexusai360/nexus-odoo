# Extrator inteligente de número Mercos (B-09) , design

Data: 2026-07-22
Branch: `feat/entregas-parciais-base-calculo`

## Problema

A coluna "Nº Mercos" do relatório B-09 (Entregas parciais) é preenchida a partir do
texto livre de observação do pedido (`raw_pedido_documento.data.obs`), pela função
`extrairNumeroMercos`. O regex atual exige a palavra literal `mercos` e devolve apenas
um número. Medido no dado real (442 pedidos do B-09, 439 com obs): extrai 387. As falhas
reais concentram-se em:

1. Erro de digitação no rótulo (ex.: `PEDIDO MERVCOS: 47519` , não tem o literal "merc").
2. Rótulo alternativo sem a palavra Mercos (ex.: `Pedido Nº 31737`).
3. Múltiplos pedidos numa mesma obs, hoje só pega o primeiro
   (`48524 | 48529`, `38043 - 45375`, `33611 33885`).

Casos-armadilha reais que NÃO podem virar falso-positivo:
- `PEDIDO MERCOS: 47434 PEDIDO DE TROCA ... AO PEDIDO 45829` -> extrai só `47434`.
- `PEDIDO MERCOS: 46864 1 PALETE CONTEM 47 VOLUMES` -> extrai só `46864`.
- Linhas de endereço com `OC 573546` -> não extrai nada (não há rótulo Mercos).

## Contrato crítico descoberto (perícia)

`numeroMercos` NÃO é só display: é chave de **busca reversa do agente Nex**. A tool
`comercial_pedido_situacao` (`queryPedidoSituacao`, `src/lib/reports/queries/comercial.ts`)
aceita um número de Mercos e devolve a situação do pedido, com desambiguação 1:N
(um Mercos que corresponde a vários pedidos do Odoo). Hoje a busca é match EXATO
(`where: { numeroMercos: alvo }`). Se um pedido passar a ter 2 números juntos, a busca
exata quebra. Decisão do dono (2026-07-22): resolver do jeito correto, com schema próprio.

## Decisão de armazenamento (opção 2, aprovada)

- Adicionar `numerosMercos String[]` (Postgres `text[]`) em `FatoPedido`, com índice GIN,
  como **chave de busca** correta para a relação 1:N / N:M.
- Manter `numeroMercos String?` como **display** (a lista unida por `", "`), consumido pela
  coluna do B-09 sem alteração de UI.
- Ambos preenchidos pelo worker a partir do MESMO extrator (fonte única).

## Extrator novo (`src/lib/fiscal/regras/numero-mercos.ts`)

Nova função `extrairNumerosMercos(obs): string[]` (ordenada, deduplicada). A antiga
`extrairNumeroMercos(obs): string | null` passa a ser um wrapper que devolve
`lista.join(", ") || null` (display / retrocompatibilidade).

Algoritmo:
1. **Âncora de rótulo com tolerância a erro** , procura palavra semelhante a `MERCOS`
   por distância de edição (Levenshtein) <= 2, com guardas:
   - nunca casar `MERCOSUL` (mantém o bloqueio de hoje);
   - o número tem que vir logo após (só `: `, espaço, `nº` no meio), sem atravessar `\n`.
2. **Cadeia de múltiplos números** , a partir do rótulo, pega o 1º número no formato Mercos
   (4 a 6 dígitos) e continua pegando os seguintes enquanto houver só um separador entre
   eles. Separadores aceitos (medidos no dado): `|  -  ,  /  ;` e espaço. A cadeia para no
   primeiro token que não seja número-Mercos+separador (uma palavra quebra a cadeia).
3. **Fallback `Pedido Nº`** , só quando NÃO há rótulo Mercos em lugar nenhum do texto:
   aceita `Pedido Nº/N°/No/Numero NNNNN`.
4. Saída: lista de dígitos. Vazia -> `[]`.

Guardas de precisão: número de forma Mercos = 4-6 dígitos puros; separador único entre
números; palavra interrompe a cadeia (protege o caso "PEDIDO DE TROCA ... AO PEDIDO NNN"
e o "1 PALETE CONTEM 47 VOLUMES").

## Integração

- `src/worker/fatos/fato-pedido.ts`: materializa `numerosMercos` (array) e `numeroMercos`
  (joined). Atualizar `FatoPedidoRow` + mapeamento + upsert.
- `prisma/schema.prisma`: campo + índice GIN; migration
  `add_numeros_mercos_fato_pedido`. Rodar `agente schema-changed` após.
- `src/lib/reports/queries/comercial.ts` (`queryPedidoSituacao`): trocar a busca reversa de
  `numeroMercos: alvo` para `numerosMercos: { has: alvo }` (mantém corte e desambiguação 1:N).
- Rebuild de `fato_pedido` (repopular base) + rebuild dos containers (`app`/worker + `mcp`).

## Testes (TDD)

Tabela de casos reais vira teste de `extrairNumerosMercos` + wrapper:

| Observação | Esperado |
|---|---|
| `PEDIDO MERVCOS: 47519` | `["47519"]` |
| `PEDIDO MERCOS: 48524 \| 48529` | `["48524","48529"]` |
| `PEDIDO MERCOS: 38043 - 45375` | `["38043","45375"]` |
| `PEDIDOS MERCOS: 33611 33885` | `["33611","33885"]` |
| `PEDIDO MERCOS: 47434 PEDIDO DE TROCA ... AO PEDIDO 45829` | `["47434"]` |
| `PEDIDO MERCOS: 46864 1 PALETE CONTEM 47 VOLUMES` | `["46864"]` |
| `Pedido Nº 31737` | `["31737"]` |
| `... / OC 573546 / ENDEREÇO ...` | `[]` |

Manter verdes os testes atuais: mercosul, quebra de linha, bloco de 8+ dígitos, vazio/null.

## Verificação

- `tsc` + `jest` verdes.
- Re-rodar a análise contra o cache real: extração sobe de 387 e os casos de falha
  (Pedido Nº, typo, multi) passam a extrair; zero falso-positivo em linhas de endereço/OC.

## Fora de escopo (próximo passo proposto)

- Desambiguação por número parcial de pedido (hoje retorna só 1).
- Busca por nome de cliente (hoje inexistente).
