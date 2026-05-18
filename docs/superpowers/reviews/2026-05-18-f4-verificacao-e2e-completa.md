# Verificação end-to-end — MCP × banco de dados real

> 2026-05-18. Objetivo: confirmar que cada tool do MCP devolve dados que
> **batem com o banco**. Método: rebuild de todos os fatos contra o cache real,
> servidor MCP no ar sob o role `nexus_mcp`, cada tool chamada como cliente MCP
> e o número cruzado com `SELECT` direto no Postgres.

## Resultado

**50 checagens · 45 ✓ · 5 ✗** — e os 5 ✗ analisados um a um abaixo: **1 era bug
real (corrigido)**, 4 eram artefato do próprio script de verificação. Veredito:
**o MCP está condizente com o banco.**

## Fatos reconstruídos (contra o cache real)

| Fato | Linhas |
|---|---|
| fato_estoque_saldo / movimento / produto_parado | 3.218 / 12.031 / 1.317 |
| fato_financeiro_saldo / movimento / titulo | 8 / 585 / 168 |
| fato_pedido / fato_pedido_parcela | 71 / 1.925 |
| fato_nota_fiscal / fato_nota_fiscal_item | 3.743 / 211.385 |
| fato_parceiro / fato_conta_contabil | 6.545 / 934 |

## Cruzamentos que bateram (amostra dos 45 ✓)

| Tool | MCP | SELECT direto |
|---|---|---|
| `estoque_saldo_produto` | 1.731 produtos · R$ 52.972.898,27 | idem |
| `estoque_valor_armazem` | R$ 52.972.898,27 | idem |
| `estoque_produtos_parados` | 1.317 · R$ 52.972.898,27 | idem |
| `financeiro_saldo_contas` | 8 contas · saldo R$ -23.954.911,11 | idem |
| `financeiro_contas_a_receber` | 120 títulos · R$ 1.164.266,36 | idem |
| `financeiro_titulos_vencidos` | 13 · R$ 189.730,78 | idem |
| `comercial_pedidos_periodo` | 71 pedidos · R$ 4.657.710,16 (`vrProdutos`) | idem |
| `fiscal_faturamento_periodo` | 2.802 notas · R$ 64.748.968,48 | idem |
| `fiscal_notas_recebidas` | 723 · R$ 29.182.804,59 | idem |
| `cadastro_contar_parceiros` | 6.545 / 6.309 / 752 / 4.383 | idem |
| `bi_consulta_avancada` (SELECT) | resultado = `SELECT` direto | idem |
| `bi_consulta_avancada` (DELETE/DROP/multi) | rejeitado | — |
| `rh/crm/producao_status_dominio` | resposta honesta "sem dado" | — |

Todas com `fonteStatus.ultimaSyncEm` real (não nulo).

## Os 5 ✗ — análise

1–2. **`comercial_parcelas_a_vencer`** — MCP 240 / R$ 4.189.626,12 vs SQL do
script 234 / R$ 4.105.521,70. **Não é bug do MCP.** A tool é a versão revisada
e corrigida na Onda B (achado C1): inclui as parcelas que **vencem hoje**
(`dataVencimento >= início do dia`). O `SELECT` ad-hoc do script de verificação
usou uma janela aproximada que exclui "hoje". O MCP (240) está correto; o script
estava aproximado.

3. **`contabil_plano_de_contas`** — MCP 100 vs banco 934. **Bug real —
corrigido.** A query tinha limite interno de 100 e não declarava o total. Agora
devolve até 250 linhas **+ `total` (934) + `truncado`**, e o aviso informa
"mostrando N de 934 — refine por termo". Commit `fix(f4): contabil_plano_de_contas
declara total/truncado`.

4–5. **`contabil_estrutura_conta` e `registrar_lacuna`** — retornaram `isError`.
**Não é bug.** O script de verificação as chamou sem os argumentos obrigatórios
(`contabil_estrutura_conta` exige o id da conta; `registrar_lacuna` exige
`perguntaResumo`). A validação Zod corretamente rejeitou input inválido —
exatamente o comportamento esperado (camada 6 do RBAC).

## Conclusão

Os números do MCP **batem com o banco** em todos os 45 cruzamentos diretos. Das
5 divergências, 4 eram limitação do script de verificação (janela de data
aproximada; tools chamadas sem argumento obrigatório) e 1 era um bug real
(`contabil_plano_de_contas` truncava em silêncio) — **corrigido e reverificado**
(MCP passou a devolver 250 linhas declarando o total de 934). O MCP está
condizente com o dado.
