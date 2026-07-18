# Onda 0 , achados contra o banco real (`nexus_odoo_l1`, 2026-07-18)

Medições que governam a implementação. Corte usado: 2026-03-16. Banco local de dev.

## T0.4 , as 3 bases de valor do relatório (bucket ABERTA, corte aplicado)
- **(a) Total do pedido (header, venda, distinct pedido) = R$ 62.701.333** (~62,7 mi ≈ os "61 mi" do relatório do colega no Odoo). 342 pedidos ABERTA.
- **(b) Saldo a atender (venda) = R$ 65.234.158** (LOCAL, ver ⚠️ abaixo).
- **(c) Saldo a atender (custo) = R$ 35.907.574** (LOCAL, ver ⚠️ abaixo).

### ⚠️ O dado de atendimento está DEFASADO no local (decisão de engenharia)
**Todos os 4.636 itens ABERTA têm `quantidade_a_atender` NULL** no banco local , o `job_atendimento` (que preenche o saldo a atender a partir do Odoo) não roda no dev. Consequência: `atendimentoSincronizado()` retorna `status.ok=false` e a lógica cai na **quantidade cheia** (`pedidos.ts:146-149`). Por isso o "a atender custo" local (35,9 mi) ≈ pedido inteiro a custo, e **não** os R$ 21,2 mi que o card mostra em produção (onde o job roda).
- **Implicação para a implementação:** a reconciliação relatório×card **não** pode ser validada pelo número absoluto local. Garantimos por **reúso da MESMA função** (TA.0 `aAtenderDoItem`) nos dois , eles mostram sempre o mesmo número, seja qual for o estado do job. Testes algébricos (`[R2:B-1]`). E2E local prova `relatório == card` (ambos em modo cheia); produção prova = 21,2 mi.

## T0.2 , de-para real dos locais de estoque
Valores a custo por classe (batem com `kpis-diretoria.md`):
- **fisico = R$ 29.852.652** (4 locais com saldo; ÷0,95 = R$ 31,4 mi do card ✓). São 16 locais "Próprio / <empresa>" (Matriz DF, Filial SE/SP/BA, etc.).
- **demonstracao = R$ 1.562.449** (35 locais com saldo ✓). Composição: **Showroom (id 35, "Próprio / Showroom") = nossa vitrine**; **"Terceiros / Demonstração / <cliente>" (128 locais) = em cliente**.
- **fora = R$ 16.318.304** (3 locais com saldo): **"Virtual" (id 3) = R$ 10,2 mi** (locais virtuais do Odoo, corretamente fora); **"Terceiros" (id 2, nó raiz) = R$ 6,07 mi**; resto R$ 215.

### ⚠️ Achados que viram PENDÊNCIA para o colega/dono (não auto-detectáveis)
- **"Em transferência = próprio": NÃO implementável hoje.** O `raw_estoque_local` **não tem** o campo `usage` do Odoo (internal/transit/customer) , só `tipo` A/S (analítica/sintética contábil). Não há nenhum local nomeado "transferência/trânsito". Detectar trânsito exige **ingerir o `usage`** (migration + resync = a onda TC.2b), OU o colega apontar quais locais são trânsito. **Sem isso, não dá para cravar.**
- **"DSTOCK terceiro que é nosso": candidato = nó "Terceiros" (id 2, R$ 6,07 mi)**, mas é ambíguo (nó raiz com saldo direto). **Só o colega sabe** quais locais sob "Terceiros" são mercadoria nossa armazenada vs terceiros de fato. Não cravar. Apresentar o de-para a ele.
- **Não existe "JDSDEMO próprio"** (depósito nosso de demonstração): toda demonstração está em cliente ou no Showroom. O painel "2 blocos" fica: **nossos = Showroom (35)**; **em cliente = Terceiros/Demonstração (128)**.

## T0.5 , baseline dos seriais (para medir delta pós-reclassificação)
- fisico: **2.511** seriais, R$ 27,5 mi · fora: 1.589, R$ 16,0 mi · demonstracao: 104, R$ 1,56 mi.

## T0.1 , "nº do pedido do mérito"
Sem campo com esse nome. Candidatos no `raw_pedido_documento`: `chamado_cliente_id`, `cotacao_id`, `pedido_original_id`. **Nenhum materializado no `fato_pedido`.** Expor = fato+schema+resync (fora do Lote 1). **Coluna pendente , confirmar com o dono qual desses é o "mérito".**

## T0.3 , fonte de "A receber"/"A pagar" (Visão Geral)
Confirmado pela perícia: `page.tsx`→`queryContasAReceber`/`queryContasAPagar` já leem `fato_financeiro_titulo` (não faturamento). **TD.2 é verificação, não código.**

---
## Consequências no plano
- **PR 1 (relatório) segue full autônomo** , não depende dos locais. Reconciliação por reúso de função.
- **PR 2 (estoque) parcial autônomo:** faço inverter card (custo puro 29,8), demo em 2 blocos (Showroom=nosso, Terceiros/Demonstração=cliente), sigla UF, verificação A receber/A pagar. **DSTOCK (TC.3) e transferência (TC.2) viram pendência do colega** (de-para apresentado) , não cravo classificação sem a palavra dele. Some às 2 pendências já existentes (regra de bloqueio D-b, nº do mérito).
