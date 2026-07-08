# SPEC v1 , Inteligência de Demanda em Aberta, Faturamento de Venda Real, Estoque Disponível e Seriais

> Base: dossiê `pericia-fluxos-2026-07/` (00 a 07) + decisões do usuário (07).
> Metodologia: esta é a v1; passa por 2 reviews adversariais até a v3 antes do PLAN.
> Tudo LOCAL; merge para `main` só com autorização (dispara produção).

## 1. Problema e objetivo
Hoje a plataforma (Agente Nex, ~30 tools fiscais, tools comerciais e relatórios da
diretoria) soma pedidos e notas com lógica antiga que mistura o que não é venda a
cliente externo e usa `vr_nf` como proxy furado de emissão. Resultado: demanda em
aberta e faturamento saem errados. O objetivo é corrigir isso na RAIZ e entregar
uma inteligência nova de operação, com um núcleo único de classificação reusado em
todos os pontos, e capacidades novas de alto valor para a diretoria:
demanda em aberta detalhada, faturamento de venda real, estoque disponível
(saldo menos comprometido em demanda) e visão de seriais.

## 2. Resultados esperados (o que o usuário poderá perguntar/ver)
- "Quanto temos de demanda em aberta?" (total em R$ e nº de pedidos, consolidado do
  grupo, com opção por empresa; quebra por etapa; lista das mais paradas).
- "Qual produto tem mais demanda?" (ranking por QUANTIDADE).
- "Qual o faturamento de venda do mês?" (só venda externa real, sem transferência/
  triangulação/demonstração/remessa/bonificação/intragrupo).
- "Qual o estoque disponível de X?" (saldo menos comprometido em demanda; destaca
  negativos = precisa comprar).
- "Qual a situação do pedido PV-xxxx?" (trilha, etapa atual, tempo parado, o que
  falta para avançar).
- Seriais: o que já saiu em nota vs o que está parado em estoque.
- Respostas em TABELA bem formatada no Nex, com resumo + distribuição por etapa +
  follow-ups. Mesmos números nos relatórios da diretoria.

## 3. Decisões canônicas (de 07-decisoes-usuario.md)
Produto por QUANTIDADE; demanda por grupo E empresa (padrão consolidado, sugerir
cortes); peças entram no faturamento; venda futura conta no faturamento na emissão
e sai do estoque disponível até a saída física; buckets "(confirmar)" resolvidos
pelo Claude via gatilhos+histórico.

## 4. Núcleo , helpers de classificação (a base de tudo)
Módulo único (ex.: `src/lib/reports/classificacao/`), com testes sobre o dado real:
- `classificaOperacao(operacaoNome, participanteNome, empresaNome)` → `{ categoria,
  entraFaturamentoVenda, entraDemanda, intragrupo }`. Categorias: VENDA_EXTERNA,
  VENDA_INTRAGRUPO, VENDA_FUTURA, TRANSFERENCIA, REMESSA, BONIFICACAO, DEMONSTRACAO,
  ARMAZENAGEM, DEVOLUCAO, PRODUCAO, INVENTARIO, COMPRA, CORRECAO, OUTRO. Regra: tipo
  da operação + CFOP no nome (dicionário em dossiê 02 §3) + participante do grupo
  (CNPJ base, dossiê 02 §4). Peças = VENDA_EXTERNA. Venda futura = VENDA_FUTURA
  (entraFaturamentoVenda=true, entraDemanda=true para estoque).
- `classificaEtapaDemanda(etapa)` → `ABERTA | FECHADA | IGNORAR`, usando os gatilhos
  da config (`aprova_pedido`, `finaliza_faturamento`, `finaliza_pedido_confirmando`,
  `finaliza_pedido_cancelando`) + exceções (`Nota emitida e não entregue.` força
  ABERTA; nota sem `finaliza_estoque`/sem movimento força ABERTA). Detalhe: dossiê 03.
- `isVendaExterna(nota)` → boolean, para `fato_nota_fiscal` (entrada_saida='1',
  situação autorizada, natureza de venda, participante externo). Dossiê 03 §5.
Estes helpers são PUROS, testados com casos reais (tabela de etapas/operações do
dossiê como fixtures), e importados por todas as tools/queries/relatórios.

## 5. Modelo de dados
### 5.1 `fato_pedido_item` (NOVO, obrigatório)
Linhas de produto do pedido, sincronizadas do Odoo (linhas do documento de pedido).
Colunas mínimas: `odoo_id`, `pedido_id` (→ fato_pedido.odoo_id), `produto_id`,
`produto_nome`, `familia_nome`, `marca_nome`, `quantidade`, `vr_unitario`,
`vr_produtos`, `serial`/`lote` (quando houver), `local_reserva_id/nome`,
`atualizado_em`. Habilita: produto com mais demanda, estoque disponível real,
seriais reservados. Worker: novo builder + entrada no catálogo de modelos; atenção
à armadilha do rebuild do worker (via `app`).
### 5.2 Enriquecer `fato_serial`
Popular `local_nome` e `data_saida`; ou criar visão cruzando com
`raw_sped_documento_item_rastreabilidade` (serial ↔ item de nota) para saber o que
já saiu. Habilita seriais parados vs vendidos.
### 5.3 Classificação materializada (opcional, decidir no PLAN)
Colunas derivadas (`categoria_operacao`, `bucket_demanda`) em `fato_pedido` e
`fato_nota_fiscal`, preenchidas no sync, para leitura barata. Alternativa: aplicar
o helper em query time. Trade-off custo de sync x latência.

## 6. Tools de MCP
### Novas
- `comercial_demanda_em_aberta`: parâmetros (empresa?, ordenacao=[tempo_parado|
  valor|data_criacao|previsao_vencida], etapa?, limit=20). Retorna: total pedidos,
  valor total travado, quebra `etapa: qtd`, e lista (default 20 por tempo parado na
  etapa atual). Sempre com freshness (última sync). Consolidado por padrão; por
  empresa quando pedido.
- `comercial_demanda_por_produto`: ranking por QUANTIDADE (depende de fato_pedido_item).
- `comercial_pedido_situacao`: imersão (trilha via fato_pedido_historico + etapa
  atual + tempo parado + próxima etapa provável + gatilho pendente).
- `estoque_disponivel`: por produto/família, saldo menos comprometido em demanda
  (inclui venda futura como comprometida); destaca negativos.
- (Serial) `estoque_seriais`: seriais parados vs saídos por produto.
### Ajustar (aplicar helpers)
Todas as `fiscal/faturamento-*.ts`, `receita-consolidada.ts`, `ponte-faturamento.ts`,
`intercompany.ts`, `notas-emitidas*.ts`, `produtos-faturados.ts`,
`vendas-produto-por-empresa.ts`, `contar-notas.ts`; e comerciais
`pedidos-por-etapa.ts`, `pedido-travados-por-etapa.ts`, `contar-pedidos.ts`,
`pedidos-periodo.ts`, `pedidos-listar-top-valor.ts`, `pedidos-por-vendedor.ts`,
`pedidos-por-uf.ts`, `pedidos-atrasados.ts`. Atualizar contagens/goldens e testes.

## 7. Agente Nex , UX de tabela e formato de resposta
- Renderização de tabela (markdown GFM) no chat, estilizada (ui-ux-pro-max, sessão
  principal): header, zebra, números à direita, scroll-x no mobile.
- Formato padrão de resposta de demanda/faturamento/comparativo: tabela + parágrafo
  curto + lista `etapa: qtd` + follow-ups (sugerir cortes por empresa/cliente/
  vendedor, e "detalhar pedido PV-xxxx"). Reaproveitar o rastreador de formato
  (lista/tabela/texto) já existente.
- Regra de prompt (`identity-base.ts`): vocabulário e critérios corretos de demanda,
  faturamento de venda, estoque disponível; instrução de tabela; honestidade sobre
  limitações (não inventar número quando o dado não existe).

## 8. Relatórios da diretoria
`src/components/diretoria`, `src/lib/diretoria`, `src/app/(protected)/diretoria/*`,
`src/app/api/diretoria/*`, `relatorios/*`: consumir os mesmos helpers/queries (mesma
verdade que o Nex). Novos painéis de demanda em aberta e estoque disponível quando
fizer sentido (validar UX com ui-ux-pro-max).

## 9. Não-objetivos (desta entrega)
- Escrever no Odoo (segue read-only via cache).
- Reprojetar o worker além do necessário para `fato_pedido_item` e serial.
- Mudar o motor de fluxo do Odoo (só lemos e classificamos).

## 10. RBAC, segurança, performance
- Tools respeitam o RBAC de 7 camadas existente (catálogo filtrado, tenant scoping,
  Zod, audit, rate limit).
- `fato_pedido_item` pode ser volumoso; indexar por `pedido_id`, `produto_id`.
- Estoque disponível e demanda por produto devem ser eficientes (agregação no banco).

## 11. Ondas de entrega (proposta)
- **Onda 0:** helpers de classificação + testes (fixtures reais). Sem UI.
- **Onda 1:** `fato_pedido_item` (worker/sync) + validação de contagem vs Odoo.
- **Onda 2:** tools de demanda (`comercial_demanda_em_aberta`, `comercial_pedido_
  situacao`) + `estoque_disponivel`. E2E contra o cache.
- **Onda 3:** uniformização do faturamento de venda real (tools fiscais + queries).
- **Onda 4:** seriais (enriquecer + `estoque_seriais`).
- **Onda 5:** UX do Nex (tabela + formato) + relatórios da diretoria.

## 12. Plano de verificação (E2E obrigatório contra o cache real)
- Demanda aberta total = SELECT com o motor (dossiê 03 §2), conferido manualmente.
- Faturamento de venda = soma só VENDA_EXTERNA, batendo com exemplo real (as "15
  notas do dia" menos triangulação/transferência).
- Estoque disponível de T600X = saldo (`fato_estoque_saldo`) menos itens em demanda
  (`fato_pedido_item`).
- Produto com mais demanda por quantidade = top do somatório de itens em demanda.
- Cada onda: tsc + eslint + jest + rebuild do container afetado + E2E.

## 13. Questões abertas (para os reviews resolverem)
- Materializar classificação (5.3) vs query time: decidir por custo/latência.
- Fonte exata das linhas de pedido no Odoo (modelo/relacionamento) para
  `fato_pedido_item`: confirmar no worker/discovery antes da Onda 1.
- "Tempo parado" quando o histórico tem idas e voltas: usar `data_entrada` da
  passagem MAIS RECENTE na etapa atual.
- Situação de nota autorizada: mapear domínio real de `situacao_nfe`.
