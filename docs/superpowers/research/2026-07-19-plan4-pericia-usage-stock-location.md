# PLAN 4 , Perícia do dado: "Em transferência" e locais fora do físico (2026-07-19, REVISADO)

> **REVISÃO 2 (contra o Odoo Tauga ao vivo, com a transcrição bruta da reunião em mãos).** A
> conclusão da 1ª versão ("não dá, o campo `usage` não existe") estava INCOMPLETA e me levou a
> travar cedo. Investigando a fundo (a pedido do dono), a verdadeira causa apareceu. Fonte da fala
> do dono: `2026-07-19-reuniao-transcricao-BRUTA.md`.

## O que o dono pediu (transcrição literal)

> "Tem algum outro nome que não está aí? [...] tem próprio, tem terceiros, tem algum outro nome
> que não existe ali? **Em transferência.** [...] Esse em transferência indica que ele está em
> trânsito para algum lugar. [...] eu estou transferindo de São Paulo para Sergipe. A mercadoria é
> nossa, só que ela está em trânsito. [...] está em transferência, entra como estoque próprio."

Ou seja: existe um local/categoria "Em transferência" (mercadoria nossa em trânsito entre nossos
depósitos) e ela deve **contar como estoque próprio/físico**.

## ACHADO CENTRAL (corrige a versão anterior): o local existe, mas está BLOQUEADO por permissão

1. **O local "EM TRANSFERÊNCIA" existe no Odoo: `estoque.local` id 446.** É a contrapartida
   (`local_inverso_id`) dos movimentos de transferência entre depósitos próprios (documentos
   "TRANSF-0555/26", "TRANSF-0543/26"..., origem/destino = Próprio / Jds Matriz DF, Filial SE,
   Filial SP). Confirmado no `estoque.extrato`.
2. **O usuário de integração do Nexus (João Vitor Zanini, id 11) NÃO tem acesso de leitura a esse
   local.** O Odoo barra com:
   > "doesn't have 'read' access to: Locais de Estoque, EM TRANSFERÊNCIA (estoque.local: 446).
   > Blame the following rules: **Local de estoque - Empresas permitidas - acesso limitado**"
3. Por isso o local 446 **não aparece** na nossa listagem (vemos 398 locais; o 446 é filtrado pela
   record rule) e **o saldo em trânsito não é sincronizado** , cai fora da conta na plataforma.

**Não é bug do nosso código nem falta de lógica de classificação.** É uma **regra de segurança no
Odoo** que esconde o local do nosso usuário. A mercadoria em transferência fica invisível para o
sync porque o Odoo não a entrega ao usuário de integração.

## Por que a 1ª perícia errou

Foquei em "o campo `usage` do stock.location não existe na Tauga" (verdade: 207 campos, só `tipo`
A/S) e concluí que não dava para separar trânsito. Mas a Tauga NÃO usa `usage` para isso , ela usa
um **local dedicado "EM TRANSFERÊNCIA" (id 446)**, exatamente como o dono disse ("acha pelo nome").
Eu não o via por causa da permissão, e interpretei a ausência como "não existe". Erro de método:
tomei "não consigo ler" por "não existe".

## Ação para destravar (é no Odoo, pela Matrix/admin, não no nosso código)

1. **Liberar o acesso** do usuário de integração (id 11) ao local "EM TRANSFERÊNCIA" (id 446):
   adicioná-lo às "Empresas permitidas" do local, ou ajustar a record rule "Local de estoque -
   Empresas permitidas - acesso limitado".
2. **Revisar se há OUTROS locais bloqueados** pela mesma regra , pode haver mais estoque nosso
   invisível (o próprio "armazenado em terceiro que é nosso" que a reunião cita pode estar num
   local restrito também). Vale a Matrix listar todos os locais que o usuário de integração deveria
   enxergar.

## Depois que o acesso for liberado (nosso lado, trivial)

1. O sync passa a ler o local 446 e o `estoque.saldo.hoje` dele (mercadoria em trânsito).
2. `classificarLocal` (`src/lib/estoque/classificacao-local.ts`) ganha o caso: local "EM
   TRANSFERÊNCIA" (por id/nome) → classificação **físico/próprio** (regra do dono: "entra como
   estoque próprio"). Mesma mecânica que já classifica Próprio e Demonstração pelo nome.
3. Reprocessar o fato de locais e revalidar os KPIs de estoque (o valor em trânsito passa a somar
   no físico disponível).

## O que ainda não dá para medir (e por quê)

O **valor** em transferência hoje não é mensurável pelo nosso usuário , o `estoque.saldo.hoje` do
local 446 é filtrado pela mesma regra. Assim que o acesso for liberado, meço o valor real em
trânsito e classifico. Enquanto não for, fica honestamente fora do físico (como hoje).

## Nota sobre os outros valores "fora" (investigados de passagem)

- Nó "Virtual" (id 3, ~R$ 9,7 mi): movimentos de **Ordens de Produção** (kits em montagem). É
  estoque em processo, não disponível , correto ficar fora do "disponível para entrega".
- Nó "Terceiros" (id 2, ~R$ 5-8 mi): inclui devoluções de compra e locais de cliente. Parte pode
  ser o "nosso armazenado em terceiro" que a reunião cita , depende de haver um local dedicado
  (possivelmente também restrito por permissão). A revisar junto com o item de ação 2.
