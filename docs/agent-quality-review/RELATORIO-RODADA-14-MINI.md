# R14 mini — Onda E (intercept lacuna + _DESTAQUE)

**100 turnos, 0 falhas tecnicas, 324s.** Mini + Onda E (registrar_lacuna intercepta padroes evitaveis + sanitizer promove totais pro topo via _DESTAQUE).

## Numeros

| Métrica | R12 | R13 | R14 |
|---|---|---|---|
| CORRETO | 75 | 74 | **74** |
| PARCIAL | 17 | 17 | 16 |
| ERRADO | 0 | 0 | **0** |
| FORA | 8 | 9 | 10 |

## Conquistas Onda E

Casos onde a Onda E (intercept) funcionou **com evidencia nos tool calls**:

- ✅ "Conta a pagar em 30 dias" → CORRETO (era PARCIAL/FORA): `financeiro_contas_a_pagar` chamada, "R$ 1.348.362,69 em 21 títulos"
- ✅ "Fornecedor que mais devemos" → CORRETO: `financeiro_contas_a_pagar` agregou por participanteNome
- ✅ "Vendedores cadastrados" → CORRETO: `comercial_pedidos_por_vendedor` retornou 20 nomes (era FORA em R12)
- ✅ "Quanto vai entrar essa semana?" → CORRETO: respeitou filtro semana
- ✅ "Cliente que mais compra + saldo a receber dele" → CORRETO via composição

## Onde E2 (_DESTAQUE) NAO funcionou — bug residual

Sanitizer tem early return em `dados.linhas`, mas as tools de financeiro retornam `dados.titulos`. Por isso:
- ❌ "Total em aberto a pagar" → ainda PARCIAL ("não consegui obter agora")
- ❌ "Total a receber esse mês" → idem
- ❌ "Top 10 maiores contas a receber" → "retorno veio cortado"

**Fix p/ Onda F**: estender sanitizer pra aceitar `dados.titulos`, `dados.serie`, `dados.contas`, etc OU promover totais independente de `linhas` existir.

## Outros PARCIAIS persistentes

- "Pedidos cancelados vs fechados" → declarou que não consegue separar (status canceled existe)
- "Cliente com pedido aberto + título vencido" → cruzamento ainda falha
- "Conta 2.1.1" → fuzzy retorna contas erradas
- "Quais armazéns têm produto 102" → não citou nomes dos 5 locais
- Perguntas vagas (`?`, `qual conta?`, `quanto?`) → mini pede clarificação (regra é não pedir)

## Análise honesta

74% é estatísticamente equivalente a R12 (75) e R13 (74) com n=100 e shuffle aleatório. Variância natural domina o sinal.

**O que MUDOU de verdade:** os 4-5 casos atacados pela Onda E1 (intercept de lacuna) viraram CORRETO. Mas isso é absorvido pelo ruído da amostra. Pra detectar ganho real precisaria **bateria 300q determinística** (mesmas perguntas em cada rodada).

**O que NÃO mudou:** bloco "agregado ignorado" persiste porque o _DESTAQUE só ativa quando `dados.linhas` existe (early return bug). Onda F precisa fixar isso.

## Plano Onda F (próxima)

1. **Fix sanitizer**: aceitar `dados.titulos|serie|contas|top` além de `linhas`; promover totais SEMPRE que existirem (independente de array). **+4pp esperado.**
2. **Aceitar lacuna real**: pra "parceiros novos da semana", "vai bater meta", "tempo médio fechamento" — adicionar tools reais OU aceitar lacuna sem penalizar.
3. **Bateria 300q determinística** (sem shuffle) — única forma de medir progresso real entre rodadas.
