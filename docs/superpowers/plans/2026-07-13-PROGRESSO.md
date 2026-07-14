# PROGRESSO , Diretoria: estoque, pedidos e pagamentos

**Branch:** `feat/diretoria-estoque-pedidos-pagamentos` (PR **#189**)
**Worktree:** `branches/feat-diretoria-estoque-pedidos-pagamentos`
**Spec:** `docs/superpowers/specs/2026-07-13-diretoria-estoque-pedidos-pagamentos-SPEC-v3.md`
**Plano:** `docs/superpowers/plans/2026-07-13-diretoria-estoque-pedidos-pagamentos-PLAN-v3.md`

---

## 🔴 COMEÇAR POR AQUI , dois bugs abertos, a tela de pagamentos está quebrada

O dono validou na tela e o **C-07 (formas de pagamento) está quebrado**: mostra
**"Não informado , 100%"** e o donut aparece como um **círculo cinza vazio**. São **dois
bugs independentes**, e o segundo só aparece por causa do primeiro.

### BUG 1 (a causa) , o worker roda imagem VELHA e zera as colunas novas a cada ciclo

**Medido (2026-07-14 01:22):**
```sql
SELECT count(*), count(forma_pagamento_nome), count(empresa_id) FROM fato_financeiro_titulo;
--   8108   |   0   |   0        <-- as duas colunas novas, ZERADAS
```
A imagem `nexus-odoo:local` é de **2026-07-13 19:11**; o último commit da branch é de
**21:24**. O container do worker está rodando **o builder antigo**, que não conhece
`forma_pagamento_nome` nem `empresa_id` , e ele **reconstrói o fato a cada ciclo**,
apagando o que o código novo grava.

**Esta é a MESMA armadilha que já mordeu duas vezes nesta branch:**
1. zerou o `quantidade_a_atender` do `fato_pedido_item` (Onda B);
2. mostrou cadastro velho de parceiro e fabricou um "Sem UF" de R$ 670 mil que **não
   existe** (o dono cobrou, e era só o worker desatualizado , ver `RADAR` R-mapa-uf).

**A regra do `CLAUDE.md` §2.1 existe exatamente por isso, e eu falhei em segui-la:**
o `worker` **NÃO tem `build:` próprio**. `docker compose build worker` é **no-op**.
Para atualizar o worker:

```bash
docker compose build app                       # constrói a imagem nexus-odoo:local
docker compose up -d --force-recreate worker
docker image inspect nexus-odoo:local --format '{{.Created}}'   # TEM que ser agora
```

⚠️ **Cuidado:** o build do container `mcp` **derrubou o Docker Desktop inteiro** nesta
sessão (daemon morreu, Postgres caiu, o dono perdeu o login). Se acontecer:
`open -a Docker`, esperar, e `docker compose up -d db redis worker`.

**Como confirmar que o bug morreu** (depois do rebuild + um ciclo do worker):
```sql
SELECT count(*) titulos, count(forma_pagamento_nome) com_forma FROM fato_financeiro_titulo;
-- esperado: 8108 | ~8107  (99,98% , só 1 título sem forma, de R$ 31.157,90)
```

### BUG 2 , o donut não desenha fatia de 100%

`src/components/diretoria/charts/donut-chart.tsx`. Com **uma única fatia**, o arco vai de
`-π/2` até `-π/2 + 2π` , o **mesmo ponto**. O `path` SVG com início e fim coincidentes
**não renderiza nada**: sobra o furo central e o fundo (o "círculo cinza vazio" que o dono
viu). Não é o dado: é o componente.

**Correção:** quando `frac >= 0.999`, desenhar um `<circle>` (anel) em vez de um arco.
Vale para qualquer donut da diretoria com um item só.

### O que JÁ foi corrigido na UI (e o dono ainda não viu funcionando, porque o bug 1 esconde)

- **C-05 (modalidades)**: ✅ **confirmado bom na tela** , virou ranking de cards, os nomes
  longos das operações fiscais aparecem inteiros.
- **C-07**: as pílulas e o seletor rosca/barras **já estão no padrão** da plataforma (o
  mesmo componente de Família/Marca/Local). Isso o dono confirmou na captura.
- **Donut**: hover não pisca mais entre fatias (o `onMouseLeave` saiu de cada fatia e foi
  para o container); legenda com valor abreviado + valor cheio no `title`.
- Aviso de "títulos provisórios" removido da tela.

---

## Estado das ondas (todas commitadas)

| Onda | O quê | Status |
|---|---|---|
| 0 | Classificação de locais (`fato_estoque_local`) | ✅ |
| A | Fatos limpos (`raw_deleted`) | ✅ |
| B | Job diário de atendimento (campo computado do Odoo) | ✅ |
| C | Estoque: queries + painel A-13 (demonstração) | ✅ |
| D | Seriais (`fato_serial_saldo`) + A-06 | ✅ |
| E | Demanda: as 5 queries a custo, do que falta entregar | ✅ |
| F | Necessidade de compra (A-14) + A-12 corrigido | ✅ |
| G | Pagamentos em 3 visões (título financeiro) | ✅ código · 🔴 **quebrado na tela pelo bug 1** |
| H | MCP / Agente Nex alinhado (8 tools) | ✅ |
| I | Auditoria de código (6 achados, corrigidos) | ✅ |

## Números conquistados (medidos contra o cache real)

| Indicador | Antes | Agora |
|---|---:|---:|
| KPI valor em estoque | R$ 50.245.690 | **R$ 31.423.844** |
| Estoque em demonstração | (não existia) | **R$ 1.562.449** (35 clientes) |
| Necessidade de compra | (não existia) | **215 produtos · 1.842 un · R$ 9,7 mi** |
| B-04 / KPI a entregar | R$ 62,6 mi (pedido cheio, a venda) | **R$ 21.207.898** (a atender, a custo) |
| Seriais | 3.828 sem local | **2.511** com depósito e saldo |
| Itens mortos em `fato_pedido_item` | 1.010 | **0** |
| "Não informado" (pagamentos) | R$ 23.079.660 | **R$ 31.157,90** (1 título) , *quando o worker estiver certo* |

## Verificação atual

`npx tsc --noEmit` limpo · `npx eslint` limpo · **4.213 testes passando**.

---

## PRÓXIMA AÇÃO (na ordem)

1. **Rebuildar o worker** (`docker compose build app` + recreate) e confirmar que
   `forma_pagamento_nome` volta a ser preenchida. **Isso sozinho conserta o C-07.**
2. **Corrigir o donut de fatia única** (bug 2).
3. Reabrir a tela e validar com o dono: Estoque, Pedidos e Vendas.
4. Com o "ok" dele: **merge do PR #189** e deploy (o Shepherd sobe sozinho em ~5 min).

## Armadilhas desta branch (não repetir)

- **O worker roda imagem velha se você não rebuildar pelo `app`.** Já custou 3 confusões.
- **Rodar o job de atendimento por script não grava o marcador** de completude , quem grava
  é o handler do worker (`JOB_ATENDIMENTO`).
- **`npx prisma generate` depois de toda migration**, senão o `tsc` não vê as colunas.
- **Scripts locais precisam de `DATABASE_URL` do `.env.local`** (o `tsx` não injeta).
- **O build do `mcp` pode derrubar o Docker Desktop inteiro.**
