# PLAN 4 , Perícia do dado: dá para ingerir o `usage` do stock.location? (2026-07-19)

> Perícia do dado ANTES de planejar (metodologia). Tudo medido contra o **Odoo Tauga ao vivo**
> (JSON-RPC read-only) e o **cache real** `nexus_odoo_l1`. Conclusão curta: **a premissa da
> doc-mãe (§5/§11) está REFUTADA , o campo `usage` NÃO existe no modelo da Tauga.**

## O que o PLAN 4 pretendia (doc-mãe §5/§11)

Ingerir o `usage` do `stock.location` do Odoo (internal/transit/customer/supplier) para
reclassificar e separar, dos R$ ~16 mi hoje em "fora":
- **DSTOCK-nosso-em-terceiro** (nó "Terceiros", id 2) → deveria virar físico.
- **Trânsito / em transferência** (nó "Virtual", id 3, supostamente `usage='transit'`) → físico.

## Veredito: NÃO dá com o dado que o Odoo expõe hoje. Premissa refutada por 3 achados.

### Achado 1 , o campo `usage` NÃO existe no modelo `estoque.local` da Tauga
`fields_get('estoque.local')` ao vivo: **207 campos, nenhum `usage`**. O único campo com esse
sentido é `tipo`, um `selection` **["A","Analítico"], ["S","Sintético"]** , ou seja, a distinção
de nó agregador vs folha no plano de contas de estoque, **não** a natureza do local
(internal/transit/customer/supplier) do Odoo padrão. A Tauga (SPED/OCA Brasil) reescreveu o
`stock.location` sem o `usage`. **Não há o que ingerir.**

### Achado 2 , não há campo de warehouse/customer/supplier/transit; só `proprietario_*`
Varredura dos 207 campos: nenhum `warehouse_id`, `scrap`, `return`, `customer/supplier location`,
`transit`. Os únicos discriminadores de posse são `proprietario_local_id` e
`proprietario_produto_id` (m2o → `sped.participante`). Eles **funcionam na demonstração-em-cliente**
(lá `proprietario_produto_id` aponta para a JDS/JHT , ids 11/13/19 , provando que o PRODUTO é
nosso mesmo no local do cliente), mas são **`false` (vazios) exatamente nos nós Virtual (id 3) e
Terceiros (id 2)** que concentram os R$ 16,3 mi. Sem posse comprovável para esses saldos.

### Achado 3 , os R$ 16,3 mi estão MONOLÍTICOS nos nós RAIZ sintéticos, sem granularidade
Medido no cache (a custo, foto de agora):
- `Virtual` (id 3, tipo **S**intético, nível 1): **R$ 10,25 mi** pendurados DIRETO no nó raiz.
- `Terceiros` (id 2, tipo **S**intético, nível 1): **R$ 6,07 mi** DIRETO no nó raiz.
- Os sublocais (analíticos) de Virtual/Terceiros têm saldo ~0.

Ou seja, o saldo problemático **não está em sublocais nomeados** ("Em Trânsito", "Produção",
"Perdas", "Cliente X") , está agregado no nó pai. Não há atributo NEM granularidade no cache que
o separe em trânsito vs DSTOCK-nosso vs contrapartida contábil.

## Números de referência (a custo, cache, 2026-07-19)

| Raiz | classificação hoje | Valor | Interpretação |
|---|---|---|---|
| Próprio | físico | R$ 29,85 mi | KPI de estoque físico (correto) |
| Virtual (id 3, S) | fora | R$ 10,25 mi | contrapartida/virtual; sem prova de que é trânsito nosso |
| Terceiros (id 2, S) | fora | R$ 6,07 mi | sem proprietário; sem prova de posse |
| Terceiros / Demonstração | demonstracao | R$ 1,56 mi | posse provada (`proprietario_produto_id`=JDS); já correto |

O `classificarLocal` atual (`src/lib/estoque/classificacao-local.ts`) já faz o certo com o dado
disponível: Próprio+em-mãos+extrato+proprietário → físico; Demonstração/JDSDEMO/showroom →
demonstração; **Virtual e Terceiros-raiz → fora** (conservador: não infla o KPI com valor de posse
não comprovada). Foi o acerto do PR que separou as 3 raízes.

## Opções para o dono (a premissa mudou; decisão necessária antes de qualquer código)

1. **Aceitar o estado atual (recomendado a curto prazo):** Virtual e Terceiros-raiz seguem em
   "fora". É honesto e conservador. Só documentar na UI/KPI que existem R$ 16,3 mi fora do físico
   sem atributo que prove posse (o Odoo não expõe). **Custo: ~zero.**
2. **Estruturar no Odoo (operação, não nosso código):** a operação da Matrix passa a marcar os
   locais com proprietário correto (ou mover o saldo de trânsito para sublocais nomeados). Aí o
   nosso builder reclassifica sozinho (a via `proprietario_produto_id`=nossa empresa já está
   provada na demonstração). **Custo: mudança no ERP pela operação; nós só ajustamos a regra.**
3. **Inferir trânsito por `stock.move` (escopo maior, investigar):** derivar "em trânsito" dos
   movimentos em aberto (saiu do físico, não chegou ao destino). É outra fonte de dado (não o
   `usage`), exige ingerir/analisar movimentos , vira um PLAN próprio, maior. Confiabilidade a
   comprovar.

## Recomendação da perícia

**Não implementar "ingerir usage" (não existe).** Levar ao dono os 3 achados e a decisão de
escopo. Se ele quiser separar os R$ 16,3 mi, o caminho realista é a **opção 2** (a operação
estrutura no Odoo e nós reclassificamos via `proprietario_produto_id`, reusando o que já funciona
na demonstração) ou a **opção 3** (investigação de `stock.move`, PLAN próprio). A opção 1 mantém o
KPI correto e honesto enquanto isso.

## Comandos usados (reproduzível)

- Ao vivo no Odoo: `fields_get('estoque.local')` (207 campos), `search_read` de `id/usage/
  nome_completo` (nenhum `usage`; só `tipo` A/S).
- Cache: saldo × custo por raiz e por nó (Virtual/Terceiros no nó raiz sintético; proprietário do
  raw `raw_estoque_local.data->>'proprietario_local_id'` / `proprietario_produto_id`).
