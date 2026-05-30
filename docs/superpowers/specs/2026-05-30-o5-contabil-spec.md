# SPEC, Onda O5: Contábil (reconciliação honesta , gated em dado + contador)

> **Versão:** v1 (2026-05-30). Esforço proporcional (CLAUDE.md §6/§11). Onda de
> documentação/verificação, como o O2, porque o dado transacional não existe.
> **Onda:** O5 (última) do roadmap. **Branch:** `feat/router-ativacao-r2`.

## 1. Achado de dado (decisivo, baldes.json + schema dos 652)

A visão do roadmap para O5 era "lançamento, plano de contas, balancete, DRE
simplificada". O plano de contas EXISTE e já é coberto; **todo o resto não tem
dado**. Os 29 `contabil.*`:

| Modelo | Balde A? | Situação |
|---|---:|---|
| `contabil.conta.referencial` | 2216 | dimensão (de-para de conta referencial SPED) |
| `contabil.conta` | 934 | plano de contas , **já coberto pela F4** |
| `contabil.lancamento` | **0** | Lançamento Contábil , vazio |
| `contabil.lancamento.item` | **0** | partida do lançamento , vazio |
| `contabil.demonstracao` / `.encerramento` / `.depreciacao` / `.historico` / `.operacao` ... | **0** | balancete/DRE/encerramento , todos vazios |

**A Matrix NÃO lança contabilidade neste Odoo.** Só o plano de contas está
populado (934 + 2216 referencial). Não há partida dobrada, balancete nem DRE
contábil , o movimento contábil simplesmente não existe na base.

A F4 já entrega: `FatoContaContabil` (de `contabil.conta`) + tools
`contabil_plano_de_contas` e `contabil_estrutura_conta`. Logo "plano de contas" e
"estrutura de conta" já são respondidos hoje.

## 2. Decisão (sem trabalho fake)

Construir balancete/DRE/lançamento contábil sobre tabelas com **0 registros** seria
fabricar capacidade sem dado , o trabalho fake que o método proíbe. Por isso o
roadmap (§4 O5) já dizia que O5 "exige input do contador da Matrix antes de codar":
agora vê-se que, **antes do contador, falta o próprio dado** (a contabilidade
precisa ser lançada/movimentada no Odoo).

**O5 não cria fato/tool/migration.** Entrega:
1. Este achado documentado (plano de contas coberto; movimento contábil inexistente).
2. Confirmação de que `contabil_plano_de_contas`/`contabil_estrutura_conta` (F4)
   respondem o que há de contábil hoje.
3. **Gate duplo de onda futura:** (a) a Matrix passar a lançar contabilidade no
   Odoo (popular `contabil.lancamento*`/`contabil.demonstracao*`), E (b) input do
   contador da Matrix definindo balancete/DRE. Só então uma onda futura constrói
   `FatoContabilLancamento` + tools de balancete/DRE com dado real.

## 3. Candidato menor (opcional, não core)

`contabil.conta.referencial` (2216, de-para de conta referencial SPED) é o único
Balde A não-coberto, mas é dimensão de mapeamento (conta gerencial → conta
referencial do SPED Contábil), de baixo valor de pergunta isolada. Fica para a onda
futura junto do movimento, se o contador indicar utilidade.

## 4. Decisões
D1. O5 = reconciliação honesta; contábil transacional inexistente neste Odoo.
D2. Plano de contas já coberto (F4); nada a refazer.
D3. Balancete/DRE/lançamento gated em DADO (Matrix lançar contabilidade) + CONTADOR.
