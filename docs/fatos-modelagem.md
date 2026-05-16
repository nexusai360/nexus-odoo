# Modelagem de `fatos_*` — registro e checklist

> Documento vivo. Criado na F2. As specs de F3 e F4 devem referenciá-lo.

## Estado atual

A F2 entregou a camada `raw` (79 tabelas JSONB, espelho do Odoo) e **um único
fato provisório**: `fato_estoque_saldo`, derivado de `raw_estoque_saldo_hoje`.

`fato_estoque_saldo` é **provisório** — serviu para validar o ciclo
Odoo → raw → fato ponta a ponta. Suas colunas podem mudar quando a F3 definir
os relatórios de estoque.

## Por que a modelagem definitiva foi adiada

As camadas `fatos_*` só podem ser modeladas com precisão quando se sabe
**quais relatórios** a F3 mostra e **quais perguntas** o MCP da F4 responde.
Modelar antes disso seria adivinhação. Decisão tomada no brainstorm da F2
(2026-05-16), com o usuário.

## Checklist — NÃO ESQUECER

- [ ] **F3 (Dashboard):** cada relatório define o(s) `fato_*` que consome.
      Modelar como tabela tipada (padrão de §5.4 do spec da F2), derivada da
      camada `raw`. Revisar/substituir `fato_estoque_saldo` se necessário.
- [ ] **F4 (MCP):** cada tool semântica define o(s) `fato_*` que consulta.
      Mesmo padrão tipado. Nenhuma tool lê `raw` direto sem um fato modelado.
- [ ] **RBAC:** enforcement "só concede o que você tem" (herdado do STATUS da
      F1) vale para o acesso aos relatórios/fatos.

## Padrão de um `fato_*`

Tabela Prisma tipada (colunas reais, não JSONB), derivada por um builder que
lê a camada `raw`. O builder roda no worker, disparado após o ciclo de sync
dos modelos-fonte. Ver `src/worker/fatos/fato-estoque-saldo.ts` como exemplo.
