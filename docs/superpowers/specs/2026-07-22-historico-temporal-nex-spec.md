# SPEC , Histórico temporal no Agente Nex (evolução de estoque/preço/pedido)

> Versão: **v2** (ciclo spec: v1 → review 1 → **v2** → review 2 → v3).
> Data: 2026-07-22. Branch: `feat/entregas-parciais-base-calculo`.
> Mapa de campos e inventário do que já existe: ver o doc irmão
> `docs/superpowers/specs/2026-07-22-historico-pedidos-agente-nex.md` (não duplicar aqui).
> Esta spec define O QUE construir e os critérios de aceite. O plano define COMO.
>
> **Mudanças da v1→v2 (review adversarial #1, com evidência no código):**
> C1 freshness da Onda A usa fato-BASE (`fato_preco`/`fato_estoque_saldo`), não `*_historico`
> (que nunca escreve `FatoBuildState` → "preparando" eterno). A1 semântica de faixa de preço
> (`quantidadeMinima`) resolvida. A2 CBS/IBS entram no núcleo de disparo (rampa é objetivo).
> M1 `evento` é `'mudanca' | 'baixa'` (não `base/alteracao`). M2 fonte da Onda B é sobretudo
> `raw_pedido_documento.data` (jsonb), `fato_pedido` só dá etapa/vrProdutos/dataPrevista. M3 saldo
> a atender é agregação item→pedido + guarda contra `jobOk=false`. M4 teto de baixa próprio para
> `pedido_valor`. M5 atualizar contagens em `mcp/__tests__/integration.test.ts`. M6 NÃO criar tool
> de aging (já existem 2). B1-B3 contratos posicionais/janela concreta.

---

## 1. Problema e objetivo

O Agente Nex hoje responde só sobre o **agora**. Duas lacunas:

1. **Histórico já gravado e não exposto.** `fato_preco_historico` (12.008 linhas) e
   `fato_estoque_saldo_historico` (4.989 linhas) têm série temporal madura (append-por-mudança,
   `vigente`), e a camada de leitura `src/lib/estoque/serie-historico.ts` (`serieDePreco`,
   `serieDeSaldo`, `movimentacao`) está **pronta e ociosa** (só consumida por testes E2E). Nenhuma
   tool MCP a expõe. É valor parado.
2. **Valores do pedido não têm histórico.** Margem, desconto, impostos (inclusive CBS/IBS),
   comissão, valor produto e saldo a atender são gravados por `upsert` (sobrescreve). Impossível
   perguntar "como evoluiu a margem/carteira/rampa CBS-IBS ao longo do tempo".

**Objetivo:** dar ao Nex a dimensão temporal, em ondas, do menor risco ao maior:
- **Onda A** , expor o histórico que já existe (preço e saldo), zero ingestão nova.
- **Onda B** , historizar os valores do pedido reusando o padrão append-por-mudança.
- **Onda C** , tools temporais do pedido/carteira no Nex sobre o novo fato.

## 2. Não-objetivos (escopo fora)

- **Não recalcular margem.** `al_margem` vem pronta do Odoo (Lucro Real). Historizar é
  snapshotar o valor do Odoo, nunca recomputar. Idem qualquer imposto.
- **Não historizar as ~35 colunas do pedido.** Só o núcleo que muda e importa (ver §5.2).
- **Não tocar UI.** Esta frente é dado + tools MCP. A tabela B-09 não muda.
- **Não amarrar captura ao corte de LEITURA de tela** (`sync.corte_dados`). O builder NÃO aplica
  filtro de data próprio: lê `fato_pedido` como está, que já nasce recortado pela ingestão
  (`src/worker/sync/corte.ts`, `OVERRIDE_INGESTAO` põe `pedido.documento` no corte fixo). Acoplar
  ao corte de leitura marcaria histórico como "baixa" (erro do PR #168, proibido repetir).
- **Nada em produção sem o dono.** Sem merge, sem deploy, sem migration em prod. Onda B roda
  migration só em dev local, sob o protocolo de schema entre worktrees (`agente schema-changed`).
- **Não expor `movimentacao`** nesta frente (Onda A é preço + saldo). Fica para depois.
- **Não criar tool de aging de etapa nova** , já existem `comercial_pedido_historico_etapas` e
  `comercial_pedido_travados_por_etapa`. Onda C só audita/estende as existentes (§6).

## 3. Onda A , Expor histórico existente (preço e saldo)

### 3.1 Entregáveis
Duas tools MCP novas, no domínio **estoque**, embrulhando a camada órfã (padrão do `ToolEntry`
canônico `mcp/tools/comercial/pedido-historico-etapas.ts`):

- **`estoque_evolucao_preco`** , série de preço de um produto numa tabela ao longo do tempo.
  Fonte: `serieDePreco(prisma, produtoId, tabelaId, quantidadeMinima|undefined, deIso, ateIso)`.
- **`estoque_evolucao_saldo`** , série de saldo (quantidade + valor) de um produto (opcional por
  local) ao longo do tempo. Fonte: `serieDeSaldo(prisma, produtoId, localId|undefined, deIso, ateIso)`.

### 3.2 Requisitos de cada tool
- **Input Zod** com `describe` em cada campo (contrato para o agente):
  - `evolucao_preco`: `produtoId:int`, `tabelaId:int` (**obrigatório** , a série de preço é por
    tabela), `quantidadeMinima?:number`, `de?:string(ISO date)`, `ate?:string(ISO date)`.
  - `evolucao_saldo`: `produtoId:int`, `localId?:int`, `de?:string`, `ate?:string`.
- **A1 , faixa de preço (`quantidadeMinima`):** a chave real de série é
  `tabela:produto:quantidadeMinima` (cada faixa de quantidade é uma série independente). Regra:
  - `quantidadeMinima` informada → **uma** série (aquela faixa).
  - `quantidadeMinima` omitida → a tool resolve as faixas distintas de `(produtoId, tabelaId)` em
    `fato_preco_historico` e devolve **uma série por faixa** (array `series[]` com o campo
    `quantidadeMinima` em cada), NUNCA uma série achatada intercalando faixas. Se houver só uma
    faixa, devolve uma série só. `aviso` explica.
- **B3 , janela concreta:** se `de`/`ate` omitidos, a tool materializa uma janela padrão
  **concreta** (últimos 90 dias até hoje, decidir instante no plano) ANTES de chamar a query.
  Nunca repassar `undefined` a `serie-historico.ts` (viraria `Invalid Date`). A `serie-historico`
  já grampeia `de` ao corte de leitura , a tool não reimplementa clamp.
- **B1 , chamada posicional:** `serieDePreco` recebe `quantidadeMinima` como 4º argumento
  posicional; quando ausente, passar `undefined` explicitamente (o `?` do Zod é omissão do input,
  não do argumento posicional).
- **Output** no envelope canônico (`estado: preparando | ok | vazio`, `atualizadoEm`,
  `atualizadoHa`, `fonteStatus`) + `dados` com `inicial` (carry-forward), `pontos[]` (ou
  `series[]`), `lacunas[]`, e os campos de resposta do padrão (`_RESPOSTA`, `_DESTAQUE`,
  `_agregado`, `aviso`, `ordenadoPor`).
- **C1 , freshness (CRÍTICO):** usar o fato-**BASE** que o registry constrói e que grava
  `FatoBuildState`, não o `*_historico` (que nunca grava build state → `preparando` eterno):
  - `estoque_evolucao_preco`: `withFreshness(ctx.prisma, ["fato_preco"], ...)`.
  - `estoque_evolucao_saldo`: `withFreshness(ctx.prisma, ["fato_estoque_saldo"], ...)`.
  Esses dois já estão mapeados em `FATO_FONTE` (`mcp/lib/freshness.ts`). **Não** adicionar
  `*_historico` ao mapa , é o conserto errado e não resolve o build state.
- **Registro completo (5 pontos):** `mcp/tools/estoque/index.ts` (agregação),
  `mcp/catalog/tool-triggers.data.ts` (gatilhos NL), `mcp/lib/responder.ts` (formatador),
  `mcp/lib/freshness.ts` (só se preciso), **e `mcp/__tests__/integration.test.ts` (atualizar as
  contagens absolutas de tools , total e do domínio estoque; adicionar 2 quebra as asserções)**.
- **`aviso` obrigatório** explicando `inicial` (valor vigente ANTES da janela, pode ser anterior ao
  corte, é estado e não fato analisado) e `lacunas` ("não mudou" ≠ "não observamos"; lacunas =
  rodadas recusadas + ausências inferidas).

### 3.3 Critérios de aceite (Onda A)
- `tsc` + `eslint` verdes; testes unit da tool (schema/shape/faixa) verdes.
- **E2E contra dado real:** subir/rodar contra o cache real, escolher um produto com variação em
  `fato_preco_historico` e outro em `fato_estoque_saldo_historico`, chamar as tools e conferir que
  a série bate com o banco (mesmos pontos, ordem, carry-forward, lacunas), **e que o estado é `ok`
  (não `preparando`)** , validação direta do conserto C1. Registrar produto/tabela/faixa usados.
- **Perícia obrigatória** (auto-perícia inclusive): confrontar código com a spec, caçar contrato
  quebrado entre a tool e a query órfã (assinatura posicional, faixa, janela), confirmar envelope
  no padrão e registro nos 5 pontos.
- Auditar de passagem `comercial_pedido_historico_etapas` / `_travados_por_etapa`: confirmar que
  cobrem aging de etapa sem lacuna; se faltar, anotar (corrigir só se trivial).

## 4. Onda B , Historizar valores do pedido (`fato_pedido_valor_historico`)

### 4.1 Nova tabela (append-por-mudança)
Model Prisma `FatoPedidoValorHistorico` (`@@map("fato_pedido_valor_historico")`), espelhando
`FatoPrecoHistorico`/`FatoEstoqueSaldoHistorico`:
- **Chave lógica de série:** `pedidoId` (odoo_id do `pedido.documento`).
- **Metadados do padrão:** `rodadaId uuid`, `capturadoEm timestamptz`, `evento text`
  (**`'mudanca' | 'baixa'`** , são os únicos eventos de LINHA do padrão; `base/ok/recusada` é
  `status` de RODADA em `fato_captura_rodada`, não vai nesta coluna), `vigente bool`.
- **Colunas de valor (núcleo , §5.2):** `etapaId/etapaNome`, `vrProdutos`, `vrOperacaoTributacao`,
  `vrDesconto`, `vrCustoComercial`, `vrComissao`, `alMargem`, `vrLiquido`, impostos
  (`vrIcmsProprio`, `vrDifal`, `vrFcp`, `vrPisProprio`, `vrCofinsProprio`, `vrIrpj`, `vrCsll`,
  `vrCbs`, `vrIbs`), `saldoAtenderCusto`, `saldoAtenderVenda`, `dataPrevista`.
- **Migration SQL cru** com índice **ÚNICO PARCIAL** `... ("pedido_id") WHERE "vigente"`
  (não modelável no Prisma 7; comentar no schema; NUNCA remover em `migrate dev` de outra
  worktree) + índices `(pedidoId, capturadoEm)`, `(capturadoEm)`, `(rodadaId)`.

### 4.2 Novo builder `src/worker/fatos/captura-pedido-valor.ts`
- Reusa `captura-serie.ts` (`emLotes`, `LOTE_INSERT/UPDATE`, `recusadasSeguidas`,
  `temBaseAnterior`), `calcularDelta`/`LinhaSerie` e `decidirRodada`, como
  `capturarSaldo`/`capturarPreco`. `SERIE = "pedido_valor"`.
- **M2 , fonte real do dado (a maioria é jsonb do raw):** `fato_pedido` fornece **só**
  `etapaId/etapaNome`, `vrProdutos` e `dataPrevista`. Todo o resto do núcleo
  (`vrOperacaoTributacao`, `vrDesconto`, `vrCustoComercial`, `vrComissao`, `alMargem`, `vrLiquido`,
  e todos os impostos incl. CBS/IBS) vem de `raw_pedido_documento.data` (jsonb), lido pelos
  **mesmos extratores da tela** (`extrairRentabilidade`, `extrairDesconto` em
  `src/lib/diretoria/queries/entregas-parciais.ts`) , reuso, sem recomputar nada. O builder é
  essencialmente um leitor de jsonb do raw + join leve com `fato_pedido`. O plano dimensiona isto
  como unidade de trabalho própria (não é "só um builder").
- **M3 , saldo a atender (agregação item→pedido, com guarda de timing):** `saldoAtenderVenda`/
  `saldoAtenderCusto` são **soma dos itens** do pedido (`aAtenderDoItem` em
  `src/lib/diretoria/atendimento-item.ts`, com `custoDe` e `jobOk`). Isto é uma unidade de trabalho
  própria (ler `fato_pedido_item`, mapa de custo, agregar por pedido). **Guarda de timing:**
  `aAtenderDoItem` cai na quantidade CHEIA quando `jobOk=false`; capturar nesse estado gravaria um
  par de linhas de "mudança" que é artefato do job de atendimento, não evento de negócio. Regra: se
  `jobOk=false`, a rodada de captura de `pedido_valor` **é pulada** (registra rodada com status
  próprio "adiada", não grava linhas). Só captura com `jobOk=true`. NUNCA usar o fallback cheio na
  série.
- **Delta por núcleo:** grava uma linha nova quando qualquer campo do NÚCLEO muda (§5.2);
  snapshota o resto junto (barato, evita ruído). `evento='baixa'` (valores NULL) quando o pedido
  sai do escopo de `fato_pedido`.
- **M4 , guarda de sanidade recalibrada:** o teto `TETO_BAIXAS=50` foi calibrado para estoque/preço
  (baixa real ~1 chave). Pedidos concluídos/faturados podem sair em lote do escopo, passando de 50
  baixas legítimas → recusa indevida. O builder usa um **teto próprio para a série `pedido_valor`**,
  calibrado pela taxa real de baixa medida no E2E (§4.4). Não reusar 50 cegamente.
- **Escopo/corte:** não aplicar filtro de data no builder; herdar o escopo já recortado de
  `fato_pedido` (idêntico a `capturarPreco`/`capturarSaldo`, que leem o fato inteiro).

### 4.3 Agendamento
Plugar `capturarPedidoValor` no ciclo **incremental** (`processIncrementalCycle` em
`src/worker/sync/processors.ts`, junto de `capturarPreco`), gate `origem === "cron"` +
`fato_pedido.ok`, em `try/catch` isolado. Cadência: como append-por-mudança grava 0 quando nada
muda, rodar no incremental é barato; o ruído (não o volume) é controlado pela guarda de `jobOk`
(M3). Rebuild do worker via `docker compose build app` (o worker NÃO tem build próprio;
`build worker` é no-op).

### 4.4 Critérios de aceite (Onda B)
- Migration aplica em dev; índice único parcial existe (conferir no banco com `\d`); Prisma client
  regenerado. `agente schema-changed` executado (protocolo de schema entre worktrees).
- Teste **TDD** do builder: base (1ª rodada grava todos, `vigente`), rodada sem mudança (0
  gravadas), mudança de núcleo (só o alterado grava, `vigente` migra), baixa (pedido some →
  `evento='baixa'` NULL), `jobOk=false` (rodada adiada, 0 linhas), guarda de sanidade recalibrada
  (baixas > teto próprio → recusada).
- **E2E contra dado real:** rodar `capturarPedidoValor` uma vez; conferir linhasObservadas ≈ nº de
  pedidos no escopo, base grava 1 vigente por pedido, 2ª rodada sem mudança = 0 gravadas. **Medir a
  taxa real de baixa** para calibrar o teto (M4) e o volume/tempo antes de confirmar a cadência.
- **Perícia obrigatória** (auto-perícia): invariantes , exatamente 1 vigente por pedido; nunca
  recomputa margem/imposto; não usa corte de leitura; não captura com `jobOk=false`; índice parcial
  preservado.

## 5. Detalhes de dado

### 5.1 De onde vem cada valor
Ver a tabela campo-a-campo no doc irmão (§2). Resumo confirmado no código: `fato_pedido` só tem
`vrProdutos`/`vrNf` de valor (+ etapa/dataPrevista); todo o resto do núcleo vem de
`raw_pedido_documento.data` (jsonb) via os extratores da tela; saldo a atender é por ITEM
(`aAtenderDoItem`) agregado ao pedido (§4.2 M3).

### 5.2 Núcleo que dispara "mudança"
Gatilho de nova linha (qualquer um muda ⇒ grava): `etapaId`, `saldoAtenderVenda`, `alMargem`,
`vrDesconto`, **`vrCbs`, `vrIbs`** (A2 , individuais, pois a rampa CBS/IBS da Onda C precisa da
granularidade; a SOMA de impostos pode ficar igual com CBS subindo e outro caindo, congelando a
série se só a soma for gatilho). O resto das colunas é snapshotado junto quando o núcleo muda.
Comparação de delta é por **string decimal** (padrão `calcularDelta`); cada campo na sua escala
real. `alMargem` é gravado como vem do Odoo (não normalizar %/fração , só copiar).

## 6. Onda C , Tools temporais do pedido/carteira no Nex

Domínio **comercial**, envelope canônico, `atualizado há Xs`. Tools NOVAS:
1. **`comercial_evolucao_pedido`** , "como o pedido X mudou ao longo do tempo?" (série de etapa,
   saldo, margem, desconto, impostos). Fonte: `fato_pedido_valor_historico`.
2. **`comercial_evolucao_carteira`** , evolução do saldo a entregar/faturar por mês. Fonte:
   agregação de `fato_pedido_valor_historico`.
3. **`comercial_rampa_cbs_ibs`** , evolução de CBS/IBS mês a mês (transição da reforma). Fonte:
   agregação de `fato_pedido_valor_historico` (depende de `vrCbs`/`vrIbs` estarem no núcleo , §5.2).

**M6 , aging de etapa NÃO gera tool nova:** já existem `comercial_pedido_historico_etapas` e
`comercial_pedido_travados_por_etapa`. A Onda C apenas AUDITA/estende essas duas se faltar cobertura
(a §3.3 já inicia essa auditoria). Criar uma terceira seria regressão (CLAUDE.md).

Cada tool NOVA: input Zod com `describe`, gatilhos NL, formatador, freshness (usar o fato-base
`fato_pedido`, mesmo raciocínio C1), teste unit + **E2E contra dado real**, atualizar contagens em
`integration.test.ts`, e entrada em `docs/kpis-diretoria.md` (fonte de cada métrica histórica).

## 7. Riscos e invariantes (checklist de perícia)
- **INV-1:** exatamente 1 `vigente=true` por `pedidoId` (garantido pelo índice único parcial).
- **INV-2:** nenhuma tool/builder recomputa margem ou imposto , só copia o valor do Odoo.
- **INV-3:** o builder NÃO aplica filtro de data; herda o recorte de `fato_pedido` (nunca usa
  `sync.corte_dados` de leitura).
- **INV-4:** índice único parcial `WHERE vigente` sobrevive a `migrate dev` (SQL cru).
- **INV-5:** série de leitura respeita o corte de leitura + carry-forward (já em serie-historico.ts).
- **INV-6:** worker atualizado exige `docker compose build app` (não `build worker`).
- **INV-7 (C1):** freshness das tools de série usa fato-BASE (que grava `FatoBuildState`), nunca
  `*_historico` , senão `preparando` eterno.
- **INV-8 (M3):** captura de `pedido_valor` só roda com `jobOk=true` (senão saldo a atender é o
  fallback cheio e polui a série).
- **INV-9 (M1):** `evento` de linha ∈ `{'mudanca','baixa'}`; consumidores da Onda C filtram por
  esses valores, não por `base/alteracao`.
- **Risco (M4):** taxa de baixa de pedidos pode passar do teto de estoque , medir e recalibrar.
- **Risco (M5):** contagens absolutas em `integration.test.ts` quebram ao adicionar tools , parte
  do registro.
- **Risco:** `raw_pedido_documento_historico` é fonte de ETAPA (não de valor) , o novo fato é
  ortogonal, sem sobreposição (confirmado no plano).

## 8. Ordem de entrega
Onda A (independente, alto ROI) → Onda B (migration + builder de raw+agregação, NÃO trivial) →
Onda C (depende de B). Cada onda: implementação (TDD) → perícia → testes/E2E contra dado real →
commit atômico (`GIT_AGENTE_BYPASS=1`). Sem merge/deploy sem o dono.
