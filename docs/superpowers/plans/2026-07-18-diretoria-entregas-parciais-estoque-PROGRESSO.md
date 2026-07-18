# PROGRESSO , Diretoria Entregas Parciais + Estoque (Lote 1)

> Ponto de retomada do modo autônomo. Atualizar a cada bloco/commit.
> Plano de execução: `2026-07-18-diretoria-entregas-parciais-estoque-PLAN-v3.md`.
> Branch/worktree: `feat/diretoria-entregas-estoque` (`branches/feat-diretoria-entregas-estoque`).

## Autorização do dono (2026-07-18)
- Modo autônomo até o FIM. Não pedir mais nada.
- **NÃO abrir PR nem merge** até TUDO terminado (ele decide o merge).
- Implementar Lote 1: PR 1 (Relatório Entregas Parciais) + PR 2 (Estoque real/demo + mapa).

## ⚠️ LEMBRETE PARA O DONO (cobrar no fecho)
- **Regra de bloqueio (D-b)**: implementada na versão SIMPLES (só nota fiscal emitida vencida; carteira não conta), numa flag isolada `REGRA_BLOQUEIO`. O dono vai verificar na operação e passar o veredito final. LEMBRAR.
- **"Nº do pedido do mérito"**: sem campo no cache; T0.1 investiga. Se não achar, coluna pendente , avisar o dono.

## Estado das ondas
- [x] Perícia (4 frentes) + Plano v1→2 reviews→v3 (commits 3591fa5a, a0e39c60)
- [x] **ONDA 0 , investigação** (achados em `research/2026-07-18-onda0-achados.md`). Chave: dado de atendimento defasado no local (qaa NULL) → reconciliação por reúso de função; DSTOCK/transferência viram pendência do colega (não auto-detectáveis).
- [ ] **ONDA A , backend relatório (TA.0..TA.4)** ← EM ANDAMENTO
- [ ] ONDA B , UI relatório (TB.1..TB.7)
- [ ] ONDA C , estoque real/demo (TC.1..TC.7)
- [ ] ONDA D , mapa UF + verificação financeira (TD.1..TD.3)
- [ ] ONDA E , verificação e fechamento (TE.1..TE.4)

## Log
- 2026-07-18: plano fechado, decisões do dono registradas (D-a grampeado+toggle, D-b simples/pendente, D-c custo puro). Iniciando Onda 0.

## Próxima ação concreta
Onda 0: escrever e rodar script de investigação (tsx + prisma) contra `nexus_odoo_l1` para T0.1 (nº mérito no raw referenciado), T0.2 (de-para dos locais + usage no raw + cravar JDSDEMO/DSTOCK/transferência/showroom), T0.3 (fonte A receber/A pagar), T0.4 (3 bases de valor no escopo do card), T0.5 (baseline seriais A-06/idade).
