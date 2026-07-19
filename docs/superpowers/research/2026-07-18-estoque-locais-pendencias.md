# Estoque , locais: o de-para real e o que precisa do colega (2026-07-18)

Na reunião, o colega pediu 3 coisas de estoque que **não são implementáveis com o que o cache
tem hoje**, porque os locais que ele descreveu não existem no cache com a forma esperada. Abaixo
o de-para REAL (medido em `nexus_odoo_l1`) e as perguntas objetivas que destravam cada uma.

## O que o cache tem hoje (classificação de locais, valor a custo)
- **fisico = R$ 29,85 mi** , 16 locais "Próprio / <empresa>" (Matriz DF, Filial SE/SP/BA, etc.). É o valor em estoque nosso.
- **demonstracao = R$ 1,56 mi** , **35 locais, TODOS sob "Terceiros / Demonstração / <cliente>"** (produto em cliente, com nota de demonstração).
- **fora = R$ 16,3 mi** , 3 locais com saldo: **"Virtual" (R$ 10,2 mi)** (locais virtuais do Odoo, corretamente fora), **"Terceiros" (nó raiz, R$ 6,07 mi)** e um resíduo.
- O Showroom (id 35, "Próprio / Showroom") está marcado como demonstração, mas **sem saldo positivo agora**.

## Pendência 1 , "Estoque de demonstração em 2 blocos (nossos × clientes)"
**Bloqueio:** o cache **não tem nenhum depósito nosso de demonstração** ("JDSDEMO"). Toda a
demonstração (R$ 1,56 mi) está **em cliente**. O bloco "nossos depósitos de demo" ficaria vazio.
**Pergunta ao colega:** os "JDSDEMO" (depósitos nossos de demonstração) existem no Odoo? Com que
**nome exato**? (Procuramos por "demo" e só achamos o Showroom e os locais em cliente.) Sem o
nome/critério, não dá para separar "nosso" de "cliente" na demonstração.

## Pendência 2 , "DSTOCK terceiro que é nosso deve entrar no físico"
**Bloqueio:** o candidato é o nó **"Terceiros" (id 2, R$ 6,07 mi)**, hoje em "fora". Mas é um nó
raiz genérico, e não dá para afirmar que todo o saldo dele é mercadoria nossa armazenada em
terceiro (parte pode ser de terceiro de verdade).
**Pergunta ao colega:** **quais locais** exatos sob "Terceiros" são mercadoria da JDS armazenada
(devem virar físico) e quais são de terceiro de verdade (ficam fora)? Idealmente por id/nome.

## Pendência 3 , "Em transferência conta como próprio"
**Bloqueio:** o cache **não guarda o "uso" do local** do Odoo (internal/transit/customer) , só
o tipo contábil A/S. **Não existe nenhum local nomeado "transferência/trânsito".** Não há como
detectar trânsito com o dado atual.
**Opções:** (a) o colega aponta **quais locais** são de trânsito (id/nome) e nós os classificamos
como físico; ou (b) passamos a **ingerir o campo `usage`** do `stock.location` do Odoo (mudança
de schema + resync do worker , uma frente à parte, com o protocolo de schema). Decisão do dono.

---
## Resumo
As 3 pendências de estoque **não são "esqueci de fazer"**: o cache não tem os locais que a reunião
descreveu (JDSDEMO, DSTOCK nomeado, trânsito). Cada uma vira 1 pergunta objetiva de de-para para
o colega, ou (pendência 3) uma decisão de ingerir o `usage` do Odoo. **Nada foi cravado no escuro**
(regra: verdade contra o dado real). Já entregue e validado: card de estoque a custo puro na Visão
Geral, e a sigla da UF no mapa.
