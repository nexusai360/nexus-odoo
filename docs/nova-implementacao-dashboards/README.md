# Nova implementação , Dashboards analíticos + Conferência de estoque (Matrix Fitness Group)

Documentação de escopo e precificação de uma demanda nova sobre a plataforma existente (dashboard Next.js + cache Postgres/Prisma alimentado pelo worker de sync do Odoo). Levantada na reunião de **2026-07-20**.

## O que é

Seis frentes: **cinco módulos** que vivem na plataforma como dashboards analíticos e **uma aplicação operacional** (Conferência de estoque), que é bem mais complexa que um dashboard (fluxo de trabalho, leitor de código de barras, sessão de inventário).

| # | Frente | Tipo | Prioridade |
|---|--------|------|-----------|
| 1 | Estoque atual | Dashboard | 1ª (máxima) |
| 5 | Conferência de estoque | Aplicação | 2ª |
| 3 | Vendas (+ comparativos + comparação geral) | Dashboard (3 telas) | 3ª |
| 2 | Relatório de estoque (ciclo ativo + relatório fechado) | Dashboard (2 telas) | 4ª |
| 4 | Financeiro por CNPJ | Dashboard | 5ª |
| 6 | Demandas | Dashboard | a refinar |

## Números-chave (precificação)

| | Do zero (plataforma crua) | Realista (com o que existe) |
|---|---|---|
| Horas | ~1.100 h | ~420 h |
| Custo a R$ 60/h | ~R$ 66.000 | ~R$ 25.200 |

Detalhes, faixas e cobrança em `ESTIMATIVA-PRECIFICACAO.md`.

## Estrutura da pasta

```
nova-implementacao-dashboards/
├── README.md                       , este índice
├── ESCOPO-FUNCIONAL.md             , visão de produto: o que cada frente entrega (as 6, inclui Conferência)
├── ESCOPO-TECNICO-DETALHADO.md     , escopo técnico dos 5 dashboards para o dev implementar (~5.185 linhas, v3, com review adversarial aplicada)
├── ESTIMATIVA-PRECIFICACAO.md      , horas, complexidade e custo (2 cenários)
├── _partes/                        , fonte por módulo do escopo técnico (mesmo conteúdo, editável em separado)
└── referencias-telas/              , os 18 protótipos de tela da reunião
```

> **`ESCOPO-TECNICO-DETALHADO.md`** cobre os 5 módulos de dashboard (Estoque, Ciclos, Vendas, Financeiro, Demandas) em nível de requisito, fórmula, consulta e critério de aceite, fundamentado nos campos e funções reais do código. A aplicação de Conferência de estoque tem escopo próprio (a produzir).

## Origem e rastreabilidade

- **Transcrição da reunião:** `docs/transcricoes-reunioes/2026-07-20-reuniao-dashboards-matrix-transcricao-BRUTA.md`
- **Protótipos:** `referencias-telas/` (01 a 18, nomeados por módulo)
- **Fundamentação técnica:** mapeamento do código real (camada de fatos, sync do Odoo, queries e telas existentes), detalhado em `ESTIMATIVA-PRECIFICACAO.md`.
