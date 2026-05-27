# Briefing do Subagente Avaliador — FASE PÓS-MUDANÇAS

Mesma rubrica do `SUBAGENT-BRIEFING.md` (LEIA ESSE PRIMEIRO), mas com **uma
verificação adicional**: agora os turnos têm o campo `toolResults` populado
(mapa `{callId: resultadoSerializado}`). Você DEVE conferir **se a resposta
final da IA bate com o resultado que a tool de fato retornou**.

## Campo novo a considerar: `toolResults`

Cada turno do batch agora tem:
```json
{
  "toolCalls": [{"id":"call_X","name":"...","arguments":{...}}],
  "toolResults": {
    "call_X": "{\"estado\":\"ok\",\"dados\":{...},\"atualizadoEm\":\"...\"}"
  },
  "finalMessage": "..."
}
```

`toolResults[call_X]` é o JSON serializado **exato** que a tool devolveu para
a IA. Use esse JSON como **verdade do ponto temporal da resposta**.

## Verificação factual obrigatória

Para cada turno com `toolResults != null`:

1. **Confira números/nomes citados na `finalMessage`** contra o JSON em `toolResults`.
   - Ex.: se a resposta diz "16 unidades" e o `toolResults.dados.saldoTotal` é
     16 → **bate**, OK.
   - Ex.: se a resposta diz "12 unidades" e o `toolResults.dados.saldoTotal` é
     16 → **NÃO bate** → ERRADO + tag `dado_inventado`.
2. **Confira período citado**: se a resposta diz "maio de 2026" e
   `toolCalls[].arguments.periodoDe` é `2025-12-01` → ERRADO + tag `erro_data`.
3. **Confira nome de entidade**: cliente/produto/conta nomeado na resposta
   tem que aparecer no resultado da tool. Se a IA citou nome diferente → tag
   `dado_inventado` ou `entendeu_mal_termo`.

## Status afetado pelo `correcao_factual`

- Se números/nomes **batem** com `toolResults`: pode ser CORRETO.
- Se há **divergência mensurável**: rebaixa para ERRADO com tag adequada.
- Se `toolResults` indica `"estado":"vazio"` ou erro, e a IA respondeu
  honestamente "não encontrei" → ainda pode ser CORRETO ou FORA_DE_ESCOPO.

## Campo extra no resultado

No `batch-XXXX-result.json`, cada turno agora inclui:

```json
{
  "turnoId": "...",
  "status": "...",
  "patterns": [...],
  "razao": "...",
  "sugestao_prompt": "...",
  "correcao_factual": "bate" | "nao_bate" | "nao_aplicavel"
}
```

- `"bate"`: números/nomes da resposta confirmados no `toolResults`.
- `"nao_bate"`: divergência factual encontrada (descreva em `razao`).
- `"nao_aplicavel"`: turno sem `toolResults` (resposta direta sem tool) OU
  resposta sem números/nomes verificáveis (ex.: clarificação).

## Atenção redobrada — placeholder `Xs`

Esta auditoria mede o resultado de mudanças aplicadas. Espera-se que o bug
`placeholder_nao_substituido` **NÃO** apareça mais (foi corrigido server-side
via campo `atualizadoHa`). Se aparecer ainda, registre — significa que o fix
não pegou.

## Retorno final

Mesma linha de antes, mas com novo campo:
```
pos-batch <ID>: <N> turnos · <A> corretos · <B> parciais · <C> errados · <D> fora escopo · top padrão: <pattern> · factual_bate: <X>/<N_com_toolResults>
```
