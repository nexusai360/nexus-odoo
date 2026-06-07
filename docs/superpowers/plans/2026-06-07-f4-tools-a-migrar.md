# F4 , Tools de leitura a migrar para o envelope canonico

> Inventario gerado em 2026-06-07. Objetivo: listar todas as tools de **leitura** do MCP
> (em `mcp/tools/**`) que ainda **nao** chamam `enriquecerEnvelope` (de
> `mcp/lib/with-responder.ts`) e portanto sao candidatas a migrar na Fase 4.
> Tools de escrita (`WriteToolEntry` / `operation: "write"`) ficam fora do escopo.

## Resumo de contagens

| Metrica | Valor |
|---|---|
| Total de tools (entradas com `id:`) | 109 |
| Tools de escrita (fora do escopo) | 9 |
| Tools de leitura | 100 |
| Leitura **com** `enriquecerEnvelope` | 47 |
| Leitura **sem** envelope (a migrar) | 53 |

As 9 tools de escrita (todas em `cadastros/` e `crm/`, single-id) sao:
`cadastros.res_partner.update`, `cadastros.res_partner.delete`, `cadastros.res_partner.archive`,
`cadastros.res_partner_category.set_tags`, `cadastros.res_partner_category.create`,
`cadastros.mail_activity.create`, `cadastros.mail_activity.update`,
`cadastros.mail_activity.complete`, `crm.res_partner.create`.

## Chaves de array distintas (uniao) , base para a constante ARRAY_KEYS

As chaves de array usadas em `dados` pelas tools a migrar, deduplicadas:

```
contas, eventos, familia, familias, linhas, marca, porEtapa, produtos
```

(Observacao: a maioria esmagadora usa `linhas`. As variantes `contas`, `familia`,
`familias`, `marca`, `produtos`, `eventos`, `porEtapa` aparecem em tools tabulares
com nomenclatura propria. Tools escalares , sem array em `dados` , aparecem como
`(nenhuma/escalar)` e nao contribuem chaves.)


## Cadastros (8)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `cadastro_cidades_listar` | `mcp/tools/cadastros/cidades-listar.ts` | `linhas` |  |
| `servico_contar` | `mcp/tools/cadastros/contar-servicos.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |
| `cadastro_parceiros_por_cidade` | `mcp/tools/cadastros/parceiros-por-cidade.ts` | `linhas` |  |
| `cadastro_filiais_listar` | `mcp/tools/cadastros/filiais-listar.ts` | `linhas` |  |
| `cadastro_parceiros_sem_documento` | `mcp/tools/cadastros/parceiros-sem-documento.ts` | `linhas` |  |
| `cadastro_parceiros_novos` | `mcp/tools/cadastros/parceiros-novos.ts` | `linhas` |  |
| `servico_buscar` | `mcp/tools/cadastros/servico-buscar.ts` | `linhas` |  |
| `servico_listar` | `mcp/tools/cadastros/servico-listar.ts` | `linhas` |  |

## Comercial (12)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `comercial_produtos_por_margem` | `mcp/tools/comercial/produtos-por-margem.ts` | `linhas` |  |
| `comercial_contar_pedidos` | `mcp/tools/comercial/contar-pedidos.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |
| `comercial_produtos_por_familia` | `mcp/tools/comercial/produtos-por-familia.ts` | `familias/produtos` | dois arrays em dados |
| `preco_contar_regras` | `mcp/tools/comercial/contar-regras-preco.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |
| `comercial_pedido_historico_etapas` | `mcp/tools/comercial/pedido-historico-etapas.ts` | `eventos/porEtapa` | dois arrays em dados |
| `comercial_cotacoes` | `mcp/tools/comercial/cotacao-comissao.ts` | `linhas` | factory honest-tool (usa withFreshness, sem enriquecerEnvelope) |
| `comercial_comissoes` | `mcp/tools/comercial/cotacao-comissao.ts` | `linhas` | factory honest-tool (usa withFreshness, sem enriquecerEnvelope) |
| `comercial_tempo_medio_fechamento` | `mcp/tools/comercial/tempo-medio-fechamento.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |
| `preco_tabela` | `mcp/tools/comercial/preco-tabela.ts` | `linhas` |  |
| `comercial_pedidos_por_uf` | `mcp/tools/comercial/pedidos-por-uf.ts` | `linhas` |  |
| `comercial_pedido_travados_por_etapa` | `mcp/tools/comercial/pedido-travados-por-etapa.ts` | `linhas` |  |
| `preco_produto` | `mcp/tools/comercial/preco-produto.ts` | `linhas` |  |

## CRM (2)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `crm_pipeline_funis` | `mcp/tools/crm/pipeline-funis.ts` | `linhas` | factory honest-tool (usa withFreshness, sem enriquecerEnvelope) |
| `crm.res_partner.get` | `mcp/tools/crm/res-partner-get.ts` | `(nenhuma/escalar)` | get raw, retorno {found, record} sem envelope |

## Dominios vazios (3)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `rh_status_dominio` | `mcp/tools/dominios-vazios/rh-status-dominio.ts` | `(nenhuma/escalar)` | status de dominio, retorno flat sem envelope |
| `producao_status_dominio` | `mcp/tools/dominios-vazios/producao-status-dominio.ts` | `(nenhuma/escalar)` | status de dominio, retorno flat sem envelope |
| `crm_status_dominio` | `mcp/tools/dominios-vazios/crm-status-dominio.ts` | `(nenhuma/escalar)` | status de dominio, retorno flat sem envelope |

## Estoque (2)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `estoque_minimo_maximo` | `mcp/tools/estoque/minimo-maximo.ts` | `linhas` | factory honest-tool (usa withFreshness, sem enriquecerEnvelope) |
| `estoque_concentracao` | `mcp/tools/estoque/concentracao.ts` | `familia/marca` | dois arrays em dados |

## Financeiro (10)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `financeiro_saldo_contas` | `mcp/tools/financeiro/saldo-contas.ts` | `contas` |  |
| `financeiro_baixas_cobranca` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_retornos_processados` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_remessas_geradas` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_carteiras_cobranca` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_cheques` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_pix_recebidos` | `mcp/tools/financeiro/cobranca-bancaria.ts` | `linhas` | factory makeTool no arquivo (withFreshness, sem enriquecerEnvelope) |
| `financeiro_caixa_periodo` | `mcp/tools/financeiro/caixa-periodo.ts` | `(nenhuma/escalar)` | escalar ({entrada, saida, saldo}); decisao explicita sem estado vazio |
| `financeiro_resultado_por_conta` | `mcp/tools/financeiro/resultado-por-conta.ts` | `linhas` |  |
| `financeiro_liquidez` | `mcp/tools/financeiro/liquidez.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |

## Fiscal (14)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `fiscal_dfe_por_fornecedor` | `mcp/tools/fiscal/dfe-por-fornecedor.ts` | `linhas` |  |
| `fiscal_dfe_importados_periodo` | `mcp/tools/fiscal/dfe-importados-periodo.ts` | `linhas` |  |
| `fiscal_notas_emitidas_por_produto` | `mcp/tools/fiscal/notas-emitidas-por-produto.ts` | `linhas` |  |
| `fiscal_dfe_pendentes_manifestacao` | `mcp/tools/fiscal/dfe-pendentes-manifestacao.ts` | `linhas` |  |
| `fiscal_mdfe_manifestos` | `mcp/tools/fiscal/mdfe-manifestos.ts` | `linhas` |  |
| `fiscal_faturamento_por_marca` | `mcp/tools/fiscal/faturamento-por-marca.ts` | `linhas` |  |
| `fiscal_impostos_periodo` | `mcp/tools/fiscal/impostos-periodo.ts` | `(nenhuma/escalar)` | escalar, sem array em dados |
| `referencia_buscar` | `mcp/tools/fiscal/referencia-buscar.ts` | `linhas` |  |
| `fiscal_reinf_eventos` | `mcp/tools/fiscal/reinf-eventos.ts` | `linhas` |  |
| `fiscal_faturamento_por_uf` | `mcp/tools/fiscal/faturamento-por-uf.ts` | `linhas` |  |
| `fiscal_produtos_faturados` | `mcp/tools/fiscal/produtos-faturados.ts` | `linhas` |  |
| `fiscal_notas_emitidas_por_cliente` | `mcp/tools/fiscal/notas-emitidas-por-cliente.ts` | `linhas` |  |
| `fiscal_carta_correcao` | `mcp/tools/fiscal/carta-correcao.ts` | `linhas` |  |
| `fiscal_certificados` | `mcp/tools/fiscal/certificados.ts` | `linhas` |  |

## Fora do catalogo (2)

| id | arquivo | chave_de_array | observacao |
|---|---|---|---|
| `registrar_lacuna` | `mcp/tools/fora-do-catalogo/registrar-lacuna.ts` | `(nenhuma/escalar)` | registro de gap; `sugestoesRelacionadas` nao e array tabular de dados |
| `bi_consulta_avancada` | `mcp/tools/fora-do-catalogo/bi-consulta-avancada.ts` | `linhas` | Caminho 3c, dados.{colunas, linhas} |

---

_Total a migrar: 53 tools de leitura sem envelope, distribuidas em 8 dominios._

## Notas para a migracao

- **31 tools usam `linhas` puro** , o caso trivial, deve ser a base default da
  constante ARRAY_KEYS.
- **3 tools tabulares com nomenclatura propria de array unico:** `financeiro_saldo_contas`
  (`contas`).
- **3 tools com DOIS arrays em `dados`** (precisam decisao de qual e a chave canonica
  ou suporte a multiplos): `comercial_produtos_por_familia` (`familias` + `produtos`),
  `comercial_pedido_historico_etapas` (`eventos` + `porEtapa`), `estoque_concentracao`
  (`familia` + `marca`).
- **9 tools factory honest-tool / makeTool** (6 em `cobranca-bancaria.ts`, 2 em
  `cotacao-comissao.ts`, `crm_pipeline_funis`, `comercial_cotacoes`, `comercial_comissoes`,
  `estoque_minimo_maximo`) , todas usam `linhas`; a migracao pode ser feita no proprio
  factory, cobrindo varias tools de uma vez.
- **9 tools escalares** (sem array em `dados`): `servico_contar`, `comercial_contar_pedidos`,
  `preco_contar_regras`, `comercial_tempo_medio_fechamento`, `financeiro_caixa_periodo`,
  `financeiro_liquidez`, `fiscal_impostos_periodo`, mais `registrar_lacuna`. Avaliar se o
  envelope canonico se aplica a elas ou se ficam de fora por nao terem lista.
- **5 tools sem o envelope de freshness padrao** (retorno flat/raw): os 3 `*_status_dominio`
  de `dominios-vazios/` e `crm.res_partner.get`. Decidir se entram no envelope ou se sao
  excecao consciente.
