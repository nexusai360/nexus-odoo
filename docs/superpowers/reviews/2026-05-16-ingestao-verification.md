# F2 — Ingestão — Verificação (etapa [8])

> Evidência da etapa [8] do workflow (`CLAUDE.md` §6). Branch `feat/ingestao`.

## Suíte estática — tudo verde

- `npx tsc --noEmit` — sem erros.
- `npm run lint` — sem erros.
- `npx jest` — **39 testes, 14 suites, todos passam**.
- `npx next build` — build ok; rota `/configuracao` presente.

## Smoke test ao vivo contra a Tauga

Worker rodado contra o Odoo Tauga real (JSON-RPC), DB/Redis em Docker.

- Worker sobe, autentica na Tauga e agenda os ciclos (`incremental 3min,
  snapshot 1440min, reconcile 1440min`).
- **Ciclo snapshot concluído** em 90s — os modelos `*.hoje` + estáticos.
- **`fato_estoque_saldo` reconstruído: 3218 linhas** a partir de
  `raw_estoque_saldo_hoje` (3218 registros) — ciclo Odoo → raw → fato
  comprovado ponta a ponta com dado real.
- Ciclo incremental rodando (interrompido no smoke por tempo): 18 modelos já
  com dado, **76.950 registros** no cache (`sped.documento.pagamento` 36.142,
  `sped.documento.volume` 18.650 etc.).
- `SyncState` ao fim do smoke: 53 `ok`, 15 `rodando` (interrompidos pelo
  encerramento — não é falha), 7 `sem_acesso`, 4 `erro`.
- **Isolamento de falha confirmado:** modelos com erro não derrubaram o ciclo;
  `AccessError` corretamente classificado como `sem_acesso`.

## Achados — 4 modelos com erro (lado Odoo, não-bug da F2)

Os 4 `erro` são problemas da instância Tauga, não defeitos do código F2 — o
worker os isolou corretamente. Registrado para a F3/F4:

1. **`res.partner`, `sped.participante`, `sped.endereco`** — `Compute method
   failed to assign res.partner(...).same_company_registry_partner_id`. Um
   campo computado da customização da Tauga quebra quando o `search_read`
   pede todos os campos. **`res.partner` é modelo central** — F3/F4 vão
   precisar dele. **Follow-up recomendado:** passar uma lista explícita de
   `fields` no `search_read` desses modelos para não disparar o compute
   quebrado (o `searchReadPaged` já aceita `opts.fields`; falta o catálogo
   carregar o whitelist por modelo). Fora do escopo do plano da F2 — anotado.
2. **`pedido.documento.historico.tempo`** — o próprio Odoo falha ao consultar
   o modelo (`coluna ... id não existe` no Postgres da Tauga). Modelo
   inconsultável na origem; permanece `erro` e é pulado.

## Conclusão

A máquina de ingestão da F2 está funcional e verificada: schema, sync engine,
worker, fato provisório e tela de Configuração. A suíte estática está verde e
o pipeline foi exercido contra a Tauga real. Os 4 erros são limitações da
fonte de dados, tratados com isolamento de falha; o follow-up de `fields`
whitelist para `res.partner` deve ser endereçado antes da F3 consumir contatos.
