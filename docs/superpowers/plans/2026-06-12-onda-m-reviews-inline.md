# Reviews adversariais do PLAN Onda M , consolidado (inline)

> O workflow de reviews (wf_359c7e6c-da1) stallou apos 2,5h/518k tokens; a
> auditoria foi refeita INLINE com verificacao dirigida contra o codigo real.

## Achados aplicados ao PLAN v3

1. **MAJOR , T5.2 padrao errado:** o plano referenciava "job BullMQ no worker
   padrao agent-topic-tagging". O padrao REAL e `src/lib/agent/intelligence/
   enqueue.ts` + `topic-extractor.ts` (fila do lado do app). Corrigido.
2. **MAJOR , T1.3 lugar da persistencia:** nao e "no run-agent"; e DENTRO de
   `persistAssistantMessageWithTools` (conversation.ts:307) , ponto unico, o
   caller nao muda. Corrigido.
3. **CONFIRMADO (risco baixo):** unico call site de `loadHistory` e
   run-agent.ts:724 (playground passa por ele); export de conversa usa query
   propria (take:200, conversation.ts:418) e nao e afetado. O teste de shape
   multi-provider permanece.
4. **CONFIRMADO:** ValidationContext = {question, llmResponse, toolResults}
   (auto-validator.ts:66) , `fontesMemoria` e aditivo (T6.1 plugavel).
5. **CONFIRMADO:** reformulateQuestion (contextualize.ts:53) e plugavel p/
   focoAtual (T3.4).
6. **MINOR , T2.1:** o corte por TURNOS opera pos-query; a query usa take
   generoso (maxTurnos*6, cap 80) para nao varrer a conversa inteira.
7. **Ordem de deploy OK:** migrations aditivas nullable; migration antes do
   codigo e segura; backfill depois do ship.
