# PROGRESSO , Diretoria: estoque, pedidos e pagamentos

**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Plano:** `docs/superpowers/plans/2026-07-13-diretoria-estoque-pedidos-pagamentos-PLAN-v3.md`
**Spec:** `docs/superpowers/specs/2026-07-13-diretoria-estoque-pedidos-pagamentos-SPEC-v3.md`

---

## Estado (2026-07-13, fim do dia)

| Onda | O quê | Status |
|---|---|---|
| **0** | Classificação de locais (fundação) | ✅ **feito** , gate passou |
| **A** | Fatos limpos (`raw_deleted`) | ✅ **feito** , gate passou |
| **B** | Ingestão do atendimento (job diário) | ✅ **feito** , gate passou |
| **C** | Estoque , **queries** | ✅ feito · **UI (A-13) pendente** |
| **D** | Seriais | ⬜ pendente |
| **E** | Demanda , **5 queries** | ✅ feito · **UI (rótulos B-04/B-01) pendente** |
| **F** | Necessidade de compra + A-12 | ⬜ pendente |
| **G** | Pagamentos (3 visões) | ⬜ pendente |
| **H** | MCP / Agente Nex | ⬜ pendente |
| **I** | E2E + docs + PR + deploy | ⬜ pendente |

## Números já conquistados (medidos contra o cache real)

| Indicador | Antes | Agora |
|---|---:|---:|
| KPI valor em estoque | R$ 50.245.690 | **R$ 31.423.844** |
| Estoque em demonstração | (não existia) | **R$ 1.562.449** (35 locais) |
| Itens mortos em `fato_pedido_item` | 1.010 | **0** |
| Unidades a atender (pedidos abertos) | 10.721 (cheia) | **5.624** (48% já entregue) |
| KPI a entregar / B-04 | R$ 62,6 mi (venda, cheio) | **R$ 21.207.730** (custo, a atender) |
| Pedidos entregues com etapa parada | invisíveis | **56**, listados com R$ 0,00 |

Locais físicos (os 4 depósitos reais): Jds Matriz DF R$ 13,8 mi · Jds Filial SE R$ 9,4 mi ·
Jds Filial SP R$ 6,4 mi · Jib DF R$ 105 mil.

## Commits

```
f3fdae4a  feat(estoque): classificacao de locais (Onda 0)
d0d043bd  fix(fatos): 1.010 itens que o Odoo ja tinha apagado (Onda A)
57eeccfe  feat(pedidos): trazer do Odoo o quanto falta entregar (Onda B + auditoria TA.2)
71f37fd5  feat(diretoria): estoque so do que e nosso, demanda so do que falta (Ondas C/E queries)
faf65dff  test(diretoria): mocks conhecem os fatos novos
```

## PRÓXIMA AÇÃO (retomar exatamente aqui)

**Onda D , Seriais.** O A-06 hoje lista 3.828 seriais **sem local nenhum** (o builder só
preenche o local de quem já saiu). A fonte certa já está no cache e ninguém usa:
`raw_estoque_saldo_rastreabilidade_hoje` (serial + local + saldo).

1. **TD.1** schema `FatoSerialSaldo` (o modelo está escrito no PLAN v3 §Onda D) + migration
   + `agente schema-changed`.
2. **TD.2** builder `src/worker/fatos/fato-serial-saldo.ts` , lê a rastreabilidade com
   `rawDeleted: false`, só `saldo > 0` e `lote_serie_id` preenchido; join com
   `fato_estoque_local` (classificação) e `fato_produto` (custo). Registrar no
   `registry.ts` como `snapshot`, **depois** do `fato_estoque_local`.
3. **TD.3/TD.4** `querySeriais` sobre a fonte nova + A-06 com as colunas
   **Serial · Produto · Local · Saldo**.
4. **TD.5** `queryIndicadoresAvancadosEstoque` (`estoque.ts:557`) troca
   `prisma.fatoSerial` por `prisma.fatoSerialSaldo` , senão a plataforma fica com dois
   números de seriais.
   **Gate:** ~2.511 seriais físicos (1.235 Matriz DF + 749 Filial SE + 527 Filial SP).
   O **Jib DF tem saldo mas zero seriais** , é correto, nem todo produto é serializado.

Depois: **F** (necessidade de compra), **G** (pagamentos, 3 visões), **H** (MCP), **I**
(E2E + docs + PR).

## Armadilhas já conhecidas (não repetir)

- **Rodar o job de atendimento por script não grava o marcador de completude.** Foi o que
  aconteceu na validação: o B-04 mostrou o valor cheio (R$ 34,4 mi) até o marcador entrar
  em `fato_build_state`. É o fallback funcionando , mas em produção quem grava é o handler
  do worker (`JOB_ATENDIMENTO`).
- **`npx prisma generate` depois de toda migration**, senão o `tsc` não enxerga as colunas.
- **Migration travada por registro fantasma:** o banco de dev tinha
  `20260702170000_readmodel_fato_compra_serial` marcada como falha, sem existir no repo.
  Foi removida da `_prisma_migrations` (só metadados). Se reaparecer em outra worktree, é
  o mesmo caso.
- **Rodar scripts com `DATABASE_URL` do `.env.local`** (o `tsx` não injeta sozinho).
- **O worker não tem `build:` próprio:** rebuildar via `docker compose build app`.
