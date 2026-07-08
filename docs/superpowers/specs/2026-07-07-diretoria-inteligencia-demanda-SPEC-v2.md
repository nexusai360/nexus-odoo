# SPEC v2 , Inteligência de Demanda, Faturamento de Venda Real, Estoque Disponível e Seriais

> v2 = v1 + os 2 reviews adversariais (negócio/dado e arquitetura/execução), com
> tudo comprovado no cache real. Mudanças materiais marcadas com [R]. Próximo passo:
> 1 review final → v3 → PLAN. Tudo LOCAL; merge só com autorização.

## 0. Correções que a v2 absorve dos reviews (as decisivas)
- **[R-C1] Itens de pedido JÁ existem no cache.** Comprovado: `raw_sped_documento_item`
  liga ao pedido por `data->'pedido_id'->>0 = fato_pedido.odoo_id` (2291/2316 = 99%
  dos pedidos; **1 documento por pedido**, sem fan-out; 100% de cobertura nas etapas
  abertas). Campos: `produto_id/nome`, `quantidade`, `quantidade_confirmada/planejada`,
  `cfop_id`, `local_reserva_livre_id`, `local_destino/origem_id`, `pedido_item_id`,
  valores. **`fato_pedido_item` é DERIVAÇÃO INTERNA do cache, NÃO um sync novo no
  worker.** Só `app`/`mcp` rebuildam. Risco de descoberta no Odoo eliminado.
- **[R-C2 arq] Reusar o núcleo existente.** Já existem `src/lib/fiscal/{regras,grupo,
  cnpj,regime}` e `src/lib/metrics/fiscal/_itens-venda-grupo.ts` (CORE compartilhado
  da "Fase 2.5" que já define venda-externa/intragrupo de forma idêntica em
  `receitaConsolidada`, `faturamentoSerieMensal`, `faturamentoPorClienteCanon`). NÃO
  criar módulo paralelo. `classificaOperacao/EtapaDemanda` são uma camada ACIMA
  desses helpers.
- **[R-C4] Não regredir a Fase 2.5.** Várias tools fiscais já respondem venda-real
  (receita externa CPC 36). Baseline ANTES + teste de não-regressão dos canônicos.
- **[R] Duas camadas distintas:** tools MCP consomem `src/lib/metrics/fiscal/*`;
  relatórios da diretoria consomem `src/lib/reports/queries/*` (ambas existem). O
  filtro de venda-real entra na MÉTRICA/QUERY, não no wrapper da tool.

## 1. Problema e objetivo
(inalterado da v1) Corrigir na raiz a classificação de demanda e faturamento e
entregar inteligência nova (demanda detalhada, faturamento de venda real, estoque
disponível, seriais), com um núcleo único reusado por Nex e relatórios da diretoria.

## 2. Decisões canônicas (07 + resolução dos reviews)
- Produto com mais demanda = por QUANTIDADE (soma de `quantidade` dos itens em
  pedidos de etapa aberta). Roda sobre `raw_sped_documento_item`. Ex. real hoje:
  PISO BLACK PREMIUM 1367, T600X ESTEIRA 810, COLCHONETE 322.
- Demanda consolidada por grupo E por empresa (padrão consolidado; sugerir cortes).
- Peças entram no faturamento de venda.
- **[R-C3] Venda futura (resolve a contradição dossiê 03 §5 x decisão 07):** do lado
  da NOTA, INCLUIR a nota de simples faturamento (CFOP 5922/6922) e EXCLUIR a remessa
  de entrega futura (a que efetiva a saída), para não duplicar. Do lado do ESTOQUE,
  a mercadoria segue comprometida (fora do disponível) até a saída física. Corrigir
  o dossiê 03 §5 (que mandava excluir "simples faturamento futuro").
- **[R-M5] Venda à ordem (5117/6117/5119/6119) , decisão do Claude:** entra como
  VENDA_EXTERNA quando o destinatário é externo (é venda a cliente, entrega por
  terceiro). Revisável com a Mariane.
- **[R-A2] Faturamento bruto x líquido , decisão do Claude:** reportar os dois. O
  headline "faturamento de venda" é a **venda bruta externa**; expor também
  **devoluções de venda** (finalidade 4) e o **líquido** (bruto menos devoluções).
  Revisável.

## 3. Núcleo de classificação (Onda 0) , [R-C2] estender o que existe
Local: estender `src/lib/fiscal/*` e `src/lib/metrics/fiscal/_itens-venda-grupo.ts`
(NÃO criar `src/lib/reports/classificacao`). Entregar, com testes sobre o dado real:
- `classificaOperacao(...)` , camada acima de `regras` (CFOP) e `grupo`
  (`carregarParticipantesGrupo`/`ehNotaIntragrupo`). Categorias do dossiê 02 §5.
  **[R-M9] assinatura por IDs** (`participanteId`, `empresaId`, `operacaoId`), nome
  só como último fallback.
- `classificaEtapaDemanda(etapa)` → ABERTA|FECHADA|IGNORAR pelos gatilhos
  (`aprova_pedido`, `finaliza_faturamento`, `finaliza_pedido_confirmando/cancelando`)
  + exceções (Nota emitida e não entregue → ABERTA; nota sem `finaliza_estoque`/sem
  movimento → ABERTA).
- **[R-A1/A2/A3] `isVendaExterna(nota)` robusto**, cumulativo:
  `entrada_saida='1'` AND `situacao_nfe`=autorizada AND `modelo IN ('55','65')`
  (exclui CT-e modelo 57, 03, 23) AND `finalidade_nfe NOT IN ('4')` (exclui
  devolução; complementar '2' tratado à parte) AND classificação de venda por
  `natureza_operacao_id`/CFOP canônico (NÃO `ILIKE` no nome; evita falso-positivo
  como "VENDA DE BEM DO ATIVO IMOBILIZADO") AND **participante externo por join**
  `fato_nota_fiscal.participante_id → fato_parceiro.documento_digits`, comparando
  `left(documento_digits,8)` com as 8 raízes do grupo (NÃO regex no nome, que perde
  ~9% por separadores unicode). Intragrupo é ~41% do valor das "vendas": crítico.

## 4. Modelo de dados
### 4.1 `fato_pedido_item` [R-C1] , derivação interna
Builder novo em `src/worker/fatos/` que LÊ `raw_sped_documento_item` (join por
`pedido_id`), NÃO chama o Odoo. Colunas: `pedido_id`, `produto_id`, `produto_nome`,
`familia_nome`, `marca_nome`, `quantidade`, `quantidade_confirmada`, `cfop_id`,
`local_reserva_id/nome`, `vr_produtos`, `vr_custo`, `atualizado_em`. Índices
`pedido_id`, `produto_id` na migration inicial. Cobertura ~99% (declarar os 24
pedidos sem linha: 15 transf.saída, 6 produção, 2 inventário, 1 compra, 1 venda).
Ressalva: `pedido_item_id` só em 16% das linhas, então agregar por `pedido_id`
(seguro, 1 doc/pedido), não por item.
### 4.2 Seriais [R-A7]
`fato_serial` bruto vem vazio (`local_nome`/`data_saida` nulos). Usar
`raw_sped_documento_item_rastreabilidade` (54308 linhas: serial ↔ item de nota) para
derivar o que já saiu; parados = em estoque sem rastreabilidade de saída.
### 4.3 Classificação materializada [R-M10] , DECISÃO: materializar
Gravar `categoria_operacao` e `bucket_demanda` como colunas derivadas em
`fato_pedido` (e `is_venda_externa` em `fato_nota_fiscal`) no builder (determinístico,
barato, fonte única). Tools/queries filtram por COLUNA. O helper puro fica disponível
para casos ad-hoc. Elimina a divergência de re-derivar CFOP/participante por tool.

## 5. Tools de MCP (novas + ajustes)
### Novas
- `comercial_demanda_em_aberta`: total (pedidos e R$), quebra `etapa: qtd`, lista
  (default 20). **[R-M1] Ordenação padrão = tempo parado** = `NOW - max(data_entrada)`
  da passagem na etapa ATUAL (NÃO `tempo_etapa_dias`, que é intervalo fechado; nenhuma
  linha tem `data_proxima` nula). Alternativas: valor, data_criacao, previsão vencida.
  Consolidado; por empresa quando pedido.
- `comercial_demanda_por_produto`: ranking por QUANTIDADE (via `fato_pedido_item`).
- `comercial_pedido_situacao`: trilha (`fato_pedido_historico`) + etapa atual + tempo
  parado + **[R-M12] próxima etapa INFERIDA** (rotulada como probabilística, das
  transições reais mais comuns) + gatilho pendente.
- `estoque_disponivel`: saldo (`fato_estoque_saldo`) menos comprometido em demanda
  (via `fato_pedido_item` em pedidos abertos + venda futura). **[R-M3] descontar o já
  faturado** do mesmo pedido (itens de NF emitida) para não superestimar reservas em
  fracionamento parcial. Destacar negativos.
- `estoque_seriais`: parados vs saídos (via rastreabilidade).
### Ajustar [R-C3 arq/C4] , na MÉTRICA, com baseline
Editar em `src/lib/metrics/fiscal/*` (não nos wrappers): `faturamento-por-operacao`,
`-por-regime`, `-por-cfop`, `-por-empresa`, `-por-vendedor`, `-recebido`,
`-autorizado`, e conferir os já-canônicos (`receita-consolidada`, `serie-mensal`,
`-por-cliente-canon`, `-por-marca-canon`, `-por-uf-canon`, `matriz-intercompany`,
`ponte-faturamento`, `impacto-cancelamentos`) para NÃO regredir. Espelhar na camada
`src/lib/reports/queries/*` usada pelos relatórios da diretoria. Snapshot baseline
antes; proteger goldens; teste de não-regressão.

## 6. Agente Nex , tabela [R-A5] (sem desculpa, bem feito)
O renderer atual é um `MarkdownLite` próprio em `src/components/agent/agent-message.tsx`
(sem `react-markdown`/`remark-gfm`; `Block` só tem `p`/`ul`), duplicado em
`monitoramento/markdown-snapshot.tsx`. Entregar suporte a TABELA:
- Estender o parser do `MarkdownLite` para tabela GFM (linha header, separador
  `---|---`, linhas), com um tipo `Block = {type:"table", header, rows, align}`.
  Atualizar TODOS os renderers (agent-message + markdown-snapshot) juntos para não
  divergir o drill-down/monitor. Cuidar do `protectValues`/NBSP para não quebrar
  células numéricas.
- Estilo (ui-ux-pro-max, sessão principal): header, zebra, números à direita,
  `overflow-x:auto` no mobile, tipografia consistente com o chat.
- **[R] Fallback de canal:** WhatsApp (F5) não renderiza tabela; emitir versão
  textual alinhada (ou lista) quando o canal for WhatsApp. In-app = tabela.
- Formato padrão de resposta de demanda/faturamento: tabela + parágrafo curto +
  lista `etapa: qtd` + follow-ups (sugerir cortes por empresa/cliente/vendedor;
  "detalhar PV-xxxx"). Regra de prompt em `identity-base.ts`.

## 7. Relatórios da diretoria
`src/lib/reports/queries/*`, `src/components/diretoria`, `src/app/(protected)/
diretoria/*`, `src/app/api/diretoria/*`: mesmos critérios/So mesma fonte de verdade.

## 8. Ondas [R-M11] , paralelizáveis
- **Onda 0:** consolidar/estender helpers (`fiscal/*` + `_itens-venda-grupo`) +
  materialização da classificação + testes (fixtures reais). Base de tudo.
- Depois, em paralelo:
  - **Onda A (não depende de item):** uniformizar faturamento de venda real nas
    métricas + relatórios, com baseline/não-regressão.
  - **Onda B:** `fato_pedido_item` (derivação) → `comercial_demanda_em_aberta`,
    `comercial_pedido_situacao`, `comercial_demanda_por_produto`, `estoque_disponivel`.
- **Onda C:** seriais (rastreabilidade + `estoque_seriais`).
- **Onda D:** UX do Nex (tabela) + relatórios da diretoria (UI).

## 9. Verificação (E2E obrigatório contra o cache real)
- Baseline dos números atuais de cada métrica antes de tocar (anti-regressão Fase 2.5).
- Demanda aberta total e por etapa = SELECT com o motor, conferência manual.
- Faturamento de venda real = NF-e/NFC-e saída autorizada, venda por CFOP, externa
  por join `fato_parceiro`, sem devolução (finalidade 4); conferir bruto/líquido e o
  peso do intragrupo (~41%). Bater com o exemplo real das notas do dia.
- Produto por quantidade, estoque disponível de T600X (saldo menos comprometido menos
  já faturado), seriais parados vs saídos.
- Cada onda: tsc + eslint + jest + rebuild do container afetado + E2E.

## 10. Questões que restam para o review final (v3)
- Confirmar domínio real de `situacao_nfe` (quais valores = autorizada) e de `modelo`.
- Complementar (finalidade 2): confirmar tratamento (não soma como venda nova).
- Materialização: definir em qual builder/etapa do sync as colunas derivadas entram.
- Venda à ordem e bruto/líquido: decisões do Claude aqui, sinalizar à Mariane depois.
