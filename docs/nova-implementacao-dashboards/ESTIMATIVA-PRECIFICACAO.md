# Estimativa e precificação , Nova implementação de dashboards (Matrix Fitness Group)

> Documento irmão: `ESCOPO-FUNCIONAL.md` (o que cada frente entrega e com quais tabelas fala).
> **Revisão 2 (2026-07-20):** horas recalibradas para baixo (ver "Nota de revisão" no fim) e valor/hora fixado em **R$ 60**.

Duas leituras da mesma obra:

- **Cenário A , Do zero (plataforma crua).** Mede o esforço como se nada existisse: construir plataforma, cache, motor de sincronização do Odoo, camada de fatos, relatórios e telas. É o **valor de reposição** do que está sendo entregue (mostra ao cliente o tamanho real da obra).
- **Cenário B , Realista (com o que já existe).** Aproveita plataforma, cache, sync, snapshot histórico, comparação vs. período anterior e telas já prontas. É o **custo efetivo** desta demanda.

| | Cenário A (do zero) | Cenário B (realista) | Economia do reuso |
|---|---|---|---|
| **Horas (âncora)** | ~1.100 h | ~420 h | ~62% (680 h) |
| **Faixa** | 900 h , 1.450 h | 320 h , 560 h | |
| **Custo a R$ 60/h** | ~R$ 66.000 | ~R$ 25.200 | ~R$ 40.800 |

---

## Fundamentação técnica (por que estes números)

O mapeamento do código mostrou infraestrutura madura, e é isso que separa os dois cenários:

- **126 `raw_*`, 50 `fato_*`, 2 `dim_*`.** Quase todos os domínios (estoque, comercial/pedido, financeiro, contábil, fiscal, cadastros) já têm camada de fatos.
- **Motor de sync genérico dirigido por catálogo** (`model-catalog.ts`, ~128 modelos Odoo). Puxar campo/tabela nova é barato; o custo real é criar **fato + query + tela**.
- **Já prontos:** snapshot histórico diário de estoque (`fato_estoque_saldo_snapshot`), comparação vs. período anterior (`janela-anterior.ts`), corte de dados (`corte-dados.ts`), atributos marca/família/tipo em `fato_produto`, e as telas de vendas, estoque, pedidos/demanda e visão-geral. Queries pesadas já escritas: `diretoria/queries/estoque.ts` (1.243 linhas), `comercial.ts` (932), `diretoria/queries/vendas.ts` (511), `financeiro.ts` (463).
- **Não existe (construir do zero nos dois cenários):** tela de **conferência de estoque/serial** (só há o dado `fato_serial`), **dashboard financeiro** dedicado, **tela de ciclo** e o atributo **"linha"** do produto.

Tradução: no **Cenário A**, a fundação (plataforma + cache + sync + fatos + histórico) pesa ~420 h que **não se paga de novo** no B. No **B**, os módulos que evoluem tela existente (estoque, vendas, demandas) custam pouco; os realmente novos (ciclos, conferência, financeiro) custam quase igual nos dois.

Escala de complexidade: **Baixa · Média · Média-alta · Alta · Muito alta**.

---

## Cenário A , Do zero (plataforma crua)

### A.0 Fundação da plataforma

| Item | Complexidade | Horas |
|---|---|---|
| Infra + app base (Next.js) + auth/RBAC + design system + deploy | Alta | 120 |
| Cache Postgres + motor de sync Odoo (só o necessário) + ingestão dos modelos | Muito alta | 160 |
| Camada de fatos dos domínios usados + snapshot diário + comparação vs. período anterior | Muito alta | 140 |
| **Subtotal fundação** | | **420** |

### A.1 Base específica da demanda

| Item | Complexidade | Horas |
|---|---|---|
| Atributo "linha" do produto (raw + fato + pipeline) | Média | 14 |
| Motor de ciclos configurável | Alta | 38 |
| Importadores manuais (previsão, meta, plano de contas, UF, grupos de CNPJ) | Média-alta | 32 |
| Parametrização de status por produto (un/%) | Média | 16 |
| Snapshot de fechamento de ciclo | Média | 14 |
| **Subtotal base** | | **114** |

### A.2 Módulos (construídos do zero)

| Módulo | Complexidade | Horas |
|---|---|---|
| 1 · Estoque atual | Média-alta | 55 |
| 2 · Relatório de estoque (ciclo ativo + fechado) | Muito alta | 75 |
| 3 · Vendas (painel + comparativos + comparação geral) | Muito alta | 95 |
| 4 · Financeiro por CNPJ | Alta | 55 |
| 5 · Conferência de estoque (aplicação) | Muito alta | 85 |
| 6 · Demandas | Alta | 60 |
| **Subtotal módulos** | | **425** |

### A.3 Transversais

| Item | Horas |
|---|---|
| QA + reconciliação contra dado real + E2E | 85 |
| Gestão + reuniões de parametrização + homologação | 70 |
| **Subtotal** | **155** |

### Total Cenário A

**420 + 114 + 425 + 155 = 1.114 h ≈ 1.100 h**
Faixa: **900 h** (otimista) · **1.100 h** (âncora) · **1.450 h** (conservador).

---

## Cenário B , Realista (com o que já existe)

Fundação (A.0) = **reusada, 0 h de construção**. Entram só a base específica, os módulos (a maioria como evolução de tela existente) e os transversais.

### B.1 Base específica da demanda

| Item | Reuso | Complexidade | Horas |
|---|---|---|---|
| Atributo "linha" do produto | marca/família/tipo já existem | Média | 10 |
| Motor de ciclos configurável | novo | Alta | 30 |
| Importadores manuais | novo | Média-alta | 26 |
| Parametrização de status por produto | novo | Média | 10 |
| Snapshot de fechamento de ciclo | reusa snapshot diário existente | Média | 10 |
| **Subtotal base** | | | **86** |

### B.2 Módulos

| Módulo | Origem | Complexidade | Horas |
|---|---|---|---|
| 1 · Estoque atual | evolui `diretoria/estoque` (query 1.243 linhas pronta) | Média-alta | 28 |
| 2 · Relatório de estoque (ciclos) | 2 telas novas (não existe ciclo) | Muito alta | 52 |
| 3 · Vendas (3 telas) | evolui `diretoria/vendas` + 2 telas novas | Alta | 50 |
| 4 · Financeiro por CNPJ | tela nova (query existe) | Média-alta | 32 |
| 5 · Conferência de estoque | app nova (dado `fato_serial` existe) | Muito alta | 64 |
| 6 · Demandas | evolui `diretoria/pedidos` | Média-alta | 28 |
| **Subtotal módulos** | | | **254** |

### B.3 Transversais

| Item | Horas |
|---|---|
| QA + reconciliação contra dado real + E2E | 45 |
| Gestão + reuniões de parametrização + homologação | 32 |
| **Subtotal** | **77** |

### Total Cenário B

**86 + 254 + 77 = 417 h ≈ 420 h**
Faixa: **320 h** (otimista) · **420 h** (âncora) · **560 h** (conservador).

---

## Tabela de custo (valor/hora = R$ 60)

| | Horas | Custo a R$ 60/h |
|---|---|---|
| **Cenário A , do zero (âncora)** | 1.100 h | **R$ 66.000** |
| Cenário A , faixa | 900 , 1.450 h | R$ 54.000 , R$ 87.000 |
| **Cenário B , realista (âncora)** | 420 h | **R$ 25.200** |
| Cenário B , faixa | 320 , 560 h | R$ 19.200 , R$ 33.600 |

---

## Recomendação de cobrança

- **Número para o cliente enxergar o tamanho da obra:** Cenário A (~R$ 66 mil), o que ele gastaria sem a plataforma que já existe.
- **Número a praticar de fato:** Cenário B, **~R$ 25 mil** (âncora 420 h), com teto de ~R$ 34 mil se a conciliação puxar para a faixa conservadora. O reuso da fundação é sua vantagem: entrega valor de ~R$ 66 mil por ~R$ 25 mil de custo.
- **Formato:** cobrar por fase/pacote com faixa de horas (não preço fixo fechado), por causa da conciliação de dados. Tratar **Conferência (5)** e **Demandas (6)** como escopo ainda aberto.
- **Ordem de entrega (prioridade do cliente):** 1) Estoque atual, 2) Conferência, 3) Vendas (+ comparativos + geral), 4) Ciclos, 5) Financeiro. Demandas por último.

---

## Nota de revisão (o que foi cortado da 1ª versão)

A primeira estimativa (630 h realista / 1.400 h do zero) estava inflada. Cortes aplicados:
- **Módulos que evoluem tela existente** (Estoque, Vendas, Demandas) reduzidos: são adição de cards/filtros/ângulos sobre query e tela prontas, não construção nova.
- **QA e gestão** reduzidos a um overhead proporcional realista.
- **Fundação do zero** enxugada para o estritamente necessário aos 6 frentes (não o motor completo de ~128 modelos).
- Frentes realmente novas (ciclos, conferência, financeiro) foram apenas levemente ajustadas, pois seu custo não depende do reuso.

Resultado: **420 h realista** e **1.100 h do zero**.

---

## Premissas da estimativa

Horas são de **desenvolvimento** (não incluem hospedagem, licenças, nem o cadastro do lado do cliente). Assume-se: o cliente cadastra no Odoo os dados de origem (linha, meta mensal, previsão de ciclo, plano de contas, UF nas despesas, nome do vendedor); histórico incompleto tratado "daqui para frente"; acesso só via API JSON-RPC. Fora de escopo: WMS/endereçamento, taxa de conversão (Mercos), margem líquida, composição de receita, integração Mercos→Odoo. Números arredondados; precificação final fechada por fase.
