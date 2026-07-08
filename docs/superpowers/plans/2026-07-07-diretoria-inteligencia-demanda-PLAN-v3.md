# PLAN v3 (FINAL, executável) , Inteligência de Demanda, Faturamento de Venda Real, Estoque Disponível e Seriais

> Processo correto: PLAN v1 → verificação #1 (aplicada) → PLAN v2 → verificação #2
> (aplicada aqui) → v3. O CORPO do plano é o `PLAN-v2.md` (ondas 0/A/B/C/D + fechamento);
> esta v3 aplica as correções finais da verificação #2 abaixo, que **prevalecem** sobre a
> v2 em caso de conflito. Nenhuma mudança arquitetural, só precisão. Verificação #2
> confirmou OK: CFOP devolução 1202/2202 (~R$1,78M) x saídas fin.4 R$84,9M (devolução de
> compra, excluída); join etapa 67/67; item→produto 98,9%; dois codepaths com
> `reports/queries/paridade.test.ts` já existente; cycle incremental do pós-passo correto.

## Correções finais aplicadas (v3, prevalecem)

**[H1] Nomes reais dos campos em `raw_sped_documento_item` (evita coluna 100% NULL).**
`vr_custo` NÃO existe → usar **`vr_custo_estoque`**. `local_reserva_id` NÃO existe →
usar **`local_reserva_livre_id`**. (Existem também `local_origem_id`, `local_destino_id`,
`estoque_reservado`.) Corrige SPEC v3 §4.1 e PLAN TB.2. Verificação de TB.2: checar
cobertura não-nula dessas duas colunas após o build.

**[H2] Fechamento do catálogo (F.1) , enumerar TODAS as assertivas que quebram** ao
somar +5 tools (3 comercial + `estoque_disponivel` + `estoque_seriais`):
- `toHaveLength(114)` em L266/L303/L311/L634 → **119**; `toHaveLength(123)` L289 → **128**.
- `COMERCIAL_IDS` 21 → **24** (+ texto do teste); `ESTOQUE_IDS` 11 → **13**.
- Estoque nos papéis: L322 e L659 `32 → 34`; L333 e L678 `17 → 19`; comentário L358
  "21 tools de comercial" → **24**. (Se `estoque_disponivel`/`estoque_seriais` forem
  gated FORA do domínio estoque de viewer/manager, NÃO mexer nos 4 e cravar o motivo;
  default hoje = estoque visível ao viewer → caminho +2.)
- Regenerar `src/lib/mcp-catalog-snapshot.json` (`npm run gen:mcp-catalog`; consumido por
  tool-digest de produção, painel MCP e golden-gate) e versionar. Corrigir comentário
  defasado (~L289 "121"→"128").

**[H3] `fato_pedido_item` (TB.2) = `cycle:"incremental"`** (dependência `fato_produto` e
consumidor `fato_pedido_classificacao` são incrementais; se ficar snapshot, item defasa).

**[M1] Texto da ordem do registry (corrigir a redação, a instrução operativa está certa):**
`fato_pedido` (pos 7), `fato_nota_fiscal` (pos 9) rodam ANTES de `fato_produto` (~pos 19);
a cauda real é `fato_serial/fato_compra/fato_crm_pipeline/fato_auditoria_regra`. Redação
correta: "**anexar `fato_pedido_item` e depois `fato_pedido_classificacao` ao FIM de
`FATO_BUILDERS` (após `fato_auditoria_regra`); todas as deps (produto, pedido, nota,
histórico) já vêm antes**."

**[M2] T0.7 UPDATE set-based (SQL em lote, não loop por linha em JS).** fato_nota_fiscal
=12.566, fato_pedido=2.317; UPDATE set-based com join a `raw_pedido_etapa` (gatilhos) e
aos participantes/naturezas é <1s. Verificação: medir o ciclo incremental completo (<2s).

**[M3] `quantidade_planejada` EXISTE (439 linhas não-zero)** , corrigir a justificativa da
SPEC v3 §2 (que dizia "não existe"). Decisão mantida: usar só **`quantidade`** (planejada
é planejamento, não a quantidade pedida); `quantidade_confirmada`=0 em 100% (correto).
Validar 1 caso das 439 na execução.

**[M4] Devolução de venda soma POR ITEM com `cfop_id ∈ {1202,2202}`** (não a nota
inteira), + participante externo. Dentro dessas 36 notas há itens "(sem cfop)" (R$152k) e
1 item 2102 (R$89k) que NÃO devem entrar. Ajusta T0.5.

**[M5] `protectValues` diverge entre renderers:** `markdown-snapshot.tsx` aplica
`protectValues`; `agent-message.tsx` NÃO (nem importa). TD.1/TD.2: decidir e declarar se
as células da tabela aplicam `protectValues` em cada renderer (ou unificar), sem quebrar
números.

**[M6] Streaming da tabela:** o corpo é typewriter token-a-token durante o stream; o swap
para `MarkdownLite` só ocorre em `!streaming`. Logo a tabela renderiza só pós-stream
(pipes crus aparecem durante o stream e "estalam" no fim, igual às listas hoje). Declarar
isso em TD e a verificação de TD.2 confere que os pipes crus não quebram o parser no swap.

## Pronto para execução
Corpo = PLAN-v2.md com estes deltas. Iniciar pela Onda 0 (T0.0 baseline → T0.7 builder de
classificação). Tudo LOCAL, TDD onde há lógica, E2E contra o cache real, rebuild por onda,
merge só com "sim" do usuário.
