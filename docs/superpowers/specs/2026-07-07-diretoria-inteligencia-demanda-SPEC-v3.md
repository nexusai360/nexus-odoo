# SPEC v3 (FINAL) , Inteligência de Demanda, Faturamento de Venda Real, Estoque Disponível e Seriais

> v3 = v2 + review final (comprovado no cache). É a versão que vai para o PLAN.
> Correções do review final marcadas [v3]. Tudo LOCAL; merge só com autorização.
> Histórico: v1 → v2 (2 reviews) → v3 (review final). Dossiê: `pericia-fluxos-2026-07/`.

## 0. Domínios reais confirmados (fim das questões abertas)
- `fato_nota_fiscal.situacao_nfe`: **`autorizada`** é o literal de nota válida
  (outros: em_digitacao, cancelada, inutilizada, rejeitada, denegada, enviada). O
  core já usa `situacaoNfe:"autorizada"`.
- `modelo`: **55 (NF-e) é a venda**. **65 (NFC-e) inexistente** neste dado. 03
  (serviço/digitação) e 57 (CT-e) ficam fora por decisão. Filtro efetivo: `modelo='55'`.
- `finalidade_nfe`: 1 normal, 4 devolução, 2 complementar (imaterial: 6 notas/R$2,7k
  no mod 55, excluída).

## 1. Objetivo
Corrigir na raiz a classificação de demanda e faturamento e entregar inteligência
nova (demanda detalhada com imersão no pedido, faturamento de venda real, estoque
disponível, seriais), com núcleo ÚNICO reusado por Agente Nex e relatórios da
diretoria. Nada de segunda fonte de verdade.

## 2. Decisões canônicas (07 + reviews)
- **Demanda por produto = QUANTIDADE**, usando SOMENTE o campo `quantidade` dos itens
  ([v3-C2] `quantidade_confirmada` vem 0 em 100% das linhas e `quantidade_planejada`
  não existe; ignorar ambos), filtrando `quantidade > 0` ([v3-M4]).
- Demanda consolidada por grupo E por empresa (padrão consolidado; sugerir cortes).
- Peças entram no faturamento de venda.
- **Venda futura:** a nota de simples faturamento (CFOP 5922/6922) ENTRA no
  faturamento (na emissão); a remessa de entrega futura NÃO conta (evita duplicar).
  No estoque, a mercadoria segue comprometida até a saída física.
- **Venda à ordem (5117/6117/5119/6119):** VENDA_EXTERNA quando o destinatário é
  externo. Revisável com a Mariane.
- **[v3-C1] Faturamento bruto x líquido (CORRIGIDO):** o headline é a **venda bruta
  externa** (saída, autorizada, modelo 55, natureza/CFOP de venda, participante
  externo). O **líquido** subtrai as **devoluções de VENDA**, que são notas de
  **ENTRADA** (`entrada_saida='0'`) com `finalidade_nfe='4'` e CFOP de devolução de
  venda (1202/2202), participante externo. NÃO subtrair as saídas finalidade 4 (essas
  são DEVOLUÇÃO DE COMPRA, CFOP 5202/6202, R$84M, a fornecedor: nada a ver com receita).

## 3. Núcleo de classificação (Onda 0) , reusar o core, sem paralelo
Estender `src/lib/fiscal/{regras,grupo,cnpj,regime}` e
`src/lib/metrics/fiscal/_itens-venda-grupo.ts`. NÃO criar módulo paralelo, NÃO
reimplementar intragrupo.
- `classificaOperacao(operacaoId/participanteId/empresaId, ...)` , camada acima de
  `regras` (CFOP) e `grupo`. Assinatura por IDs; nome só fallback.
- `classificaEtapaDemanda(etapa)` → ABERTA|FECHADA|IGNORAR pelos gatilhos
  (`aprova_pedido`, `finaliza_faturamento`, `finaliza_pedido_confirmando/cancelando`)
  + exceções (Nota emitida e não entregue → ABERTA; nota sem `finaliza_estoque`/sem
  movimento → ABERTA).
- **[v3-A2] `isVendaExterna(nota)`** = `entrada_saida='1'` AND `situacao_nfe='autorizada'`
  AND `modelo='55'` AND venda por CFOP/`natureza_operacao_id` (não substring) AND
  **`ehNotaIntragrupo(nota, participantesGrupo)=false`** (CHAMAR o helper existente do
  core, NÃO um join `documento_digits` novo). Intragrupo é ~41% do valor: crítico.

## 4. Modelo de dados
### 4.1 `fato_pedido_item` [derivação interna, sem sync novo]
Builder que LÊ `raw_sped_documento_item` (NÃO chama o Odoo). Regras [v3]:
- **[v3-M1] filtrar** `jsonb_typeof(data->'pedido_id')='array'` (61% das 60047 linhas
  têm `pedido_id=false`; são itens de nota sem pedido). Join `data->'pedido_id'->>0 =
  fato_pedido.odoo_id`.
- **[v3-M4] filtrar `quantidade > 0`**; usar só `quantidade`.
- **[v3-M2] `familia_nome`/`marca_nome` NÃO existem no item raw** → JOIN a
  `fato_produto` por `produto_id` (fato_produto roda antes; ordenar o item depois).
- Colunas: `pedido_id`, `produto_id`, `produto_nome`, `familia_nome`, `marca_nome`
  (via join), `quantidade`, `cfop_id`, `local_reserva_id`, `vr_produtos`, `vr_custo`,
  `atualizado_em`. Índices `pedido_id`, `produto_id` na migration inicial.
- Cobertura ~99% (2291/2316; 100% nas etapas abertas). Declarar os 24 pedidos sem
  linha (15 transf.saída, 6 produção, 2 inventário, 1 compra, 1 venda). 1 doc/pedido
  (sem fan-out) → agregar por `pedido_id` (não por item; `pedido_item_id` só 16%).
### 4.2 Seriais
Derivar de `raw_sped_documento_item_rastreabilidade` (54308) o que já saiu (serial ↔
item de nota); `fato_serial` bruto vem sem `local_nome`/`data_saida`. Parados = em
estoque sem rastreabilidade de saída.
### 4.3 [v3-C3] Materialização via builder de PÓS-PASSO dedicado (decisão cravada)
NÃO materializar dentro de `fato_pedido`/`fato_nota_fiscal` (rodam antes de
`fato_parceiro`/`fato_pedido_historico`/`fato_pedido_item` em `registry.ts`; leriam
dependência não reconstruída no ciclo). Criar builder **`fato_pedido_classificacao`**
(e o equivalente de nota) registrado POR ÚLTIMO, que dá UPDATE nas colunas derivadas
`categoria_operacao`, `bucket_demanda` (fato_pedido) e `is_venda_externa`
(fato_nota_fiscal) após todas as bases. Tools/queries filtram por COLUNA. Helper puro
disponível para ad-hoc.

## 5. Tools de MCP
### Novas
- `comercial_demanda_em_aberta`: total (pedidos, R$), quebra `etapa: qtd`, lista
  (default 20). **Ordenação padrão = tempo parado** = `NOW - max(data_entrada)` da
  passagem na etapa ATUAL (nenhuma linha tem `data_proxima` nula; NÃO usar
  `tempo_etapa_dias`). **[v3-M3] fallback** para 153 pedidos sem histórico:
  `data_aprovacao`/`data_orcamento`. Alternativas: valor, data_criacao, previsão.
- `comercial_demanda_por_produto`: ranking por QUANTIDADE, **só pedidos de etapa
  aberta** (aplicar o motor; [v3-M4] recomputar os números de referência, não usar
  totais de todos os pedidos).
- `comercial_pedido_situacao`: trilha + etapa atual + tempo parado + próxima etapa
  INFERIDA (rotulada probabilística) + gatilho pendente.
- `estoque_disponivel`: saldo (`fato_estoque_saldo`) menos comprometido em demanda
  (fato_pedido_item em pedidos abertos + venda futura), **descontando o já faturado**
  do mesmo pedido (itens de NF emitida) para não superestimar em fracionamento
  parcial. Destacar negativos.
- `estoque_seriais`: parados vs saídos (rastreabilidade).
### Ajustar , na MÉTRICA, com baseline anti-regressão
Editar `src/lib/metrics/fiscal/*` (não wrappers): `faturamento-por-operacao`,
`-por-regime`, `-por-cfop`, `-por-empresa`, `-por-vendedor`, `-recebido`,
`-autorizado`; conferir canônicos (`receita-consolidada`, `serie-mensal`,
`-por-cliente/marca/uf-canon`, `matriz-intercompany`, `ponte-faturamento`,
`impacto-cancelamentos`) para NÃO regredir a Fase 2.5. Espelhar em
`src/lib/reports/queries/*` (relatórios da diretoria). [v3-M6] gate "aprovado" pode
usar `fato_pedido.data_aprovacao` direto (96,6% preenchido; 43 sem → não-aprovado ou
fallback histórico), reduzindo acoplamento.

## 6. Agente Nex , tabela (estender o MarkdownLite)
Renderer é `MarkdownLite` próprio em `src/components/agent/agent-message.tsx` (sem
react-markdown; `Block` só `p`/`ul`), duplicado em `monitoramento/markdown-snapshot.tsx`.
Entregar tabela GFM: novo `Block={type:"table",header,rows,align}`, parser do
separador `---|---`, atualizando OS DOIS renderers juntos; cuidar do `protectValues`/
NBSP nas células numéricas. Estilo ui-ux-pro-max (header, zebra, números à direita,
`overflow-x:auto` no mobile), sessão principal. Fallback textual no WhatsApp (F5).
Formato padrão de resposta de demanda/faturamento: tabela + parágrafo curto + lista
`etapa: qtd` + follow-ups (cortes por empresa/cliente/vendedor; "detalhar PV-xxxx").
Regra de prompt em `identity-base.ts`.

## 7. Relatórios da diretoria
`src/lib/reports/queries/*`, `src/components/diretoria`,
`src/app/(protected)/diretoria/*`, `src/app/api/diretoria/*`: mesma fonte de verdade.

## 8. Ondas (paralelizáveis)
- **Onda 0:** helpers (estender core) + builder de classificação pós-passo
  (materialização) + testes (fixtures reais). Base de tudo.
- Paralelo: **Onda A** (uniformizar faturamento venda-real nas métricas + relatórios,
  com baseline/não-regressão) e **Onda B** (`fato_pedido_item` derivado →
  `comercial_demanda_em_aberta`, `comercial_pedido_situacao`,
  `comercial_demanda_por_produto`, `estoque_disponivel`).
- **Onda C:** seriais. **Onda D:** tabela no Nex + relatórios diretoria (UI).

## 9. Verificação (E2E obrigatório contra o cache real)
- Baseline dos números atuais antes de tocar (anti-regressão Fase 2.5).
- Demanda aberta (total, por etapa, tempo parado) = SELECT com o motor.
- Faturamento bruto de venda externa e líquido (menos devoluções de VENDA = entrada
  fin.4 CFOP 1202/2202); conferir o peso do intragrupo (~41%). Bater com exemplo real.
- Produto por quantidade (etapas abertas, quantidade>0); estoque disponível de T600X
  (saldo menos comprometido menos já faturado); seriais parados vs saídos.
- Cada onda: tsc + eslint + jest + rebuild do container afetado + E2E.

## 10. Riscos residuais / a validar na execução
- Confirmar CFOP exato de devolução de venda no dado (1202/2202) antes de calcular
  líquido; se raro (36 notas/R$1,8M), o líquido ≈ bruto (registrar).
- Ordenar builders: `fato_produto` e `fato_pedido_item` antes do pós-passo de
  classificação; validar o ciclo incremental completo após adicionar os builders.
- Rebuild: itens/classificação afetam `app` e `mcp` (derivação interna, o `worker`
  não muda de fonte, mas o builder roda no processo do worker; validar o mapa).
