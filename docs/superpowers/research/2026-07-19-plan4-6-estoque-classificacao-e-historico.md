# PLAN 4 (fechar) + PLAN 6 (novo) , Classificação de estoque + Histórico temporal (2026-07-19)

> Norte: transcrição bruta da reunião (`2026-07-19-reuniao-transcricao-BRUTA.md`). Autonomia total
> dada pelo dono (não perguntar; consultar a transcrição). Acesso às 18 empresas do usuário
> `joaozanini` (id 11) LIBERADO pelo dono , os 16 locais antes bloqueados agora são legíveis.

## Valores destravados (Odoo ao vivo, 2026-07-19)

- **EM TRANSFERÊNCIA (id 446): R$ 2,21 mi** → vira **físico/próprio** (regra do dono: transferência
  entre depósitos conta como próprio). Regra já pronta em `classificacao-local.ts`.
- **JDS DEMO (14 locais, ids 216-229 + 414): ~R$ 4,58 mi** → **demonstração** (bloco "nossos").
  Regra JDSDEMO existente já classifica. O 414 NÃO era lixo, estava bloqueado.
- **Intercompany (id 285, "Terceiros / Jds ... Jht SP ..."): R$ 2,34 mi** → decisão: é mercadoria
  ENTRE nossas empresas do grupo (JDS↔JHT). Pela lógica da reunião ("terceiro mas é nosso → próprio")
  tende a **próprio**; validar a natureza antes de cravar (pode ser remessa de armazenagem do grupo).

## FRENTE A , PLAN 4 (fechar): classificação completa de estoque

Estado: a regra `classificarLocal` já cobre EM TRANSFERÊNCIA→físico e JDS DEMO→demonstração. Falta:
1. **Re-sincronizar o estoque** (modelos `estoque.local` + `estoque.saldo.hoje`) agora que o acesso
   está aberto → os 16 locais + saldos entram no cache. Em produção o cron faz sozinho; no dev,
   rodar o sync direcionado + `rebuildFatoEstoqueLocal` + rebuild dos saldos.
2. **Validar E2E**: EM TRANSFERÊNCIA vira `fisico`; os 14 JDS DEMO viram `demonstracao` (bloco
   nossos, hoje vazio); o valor em estoque físico sobe (+R$ 2,21 mi do trânsito); a demonstração
   "nossos" passa a ter ~R$ 4,58 mi.
3. **Intercompany 285**: decidir/classificar (ver acima).
4. **Virtual (produção/montagem, ~R$ 9,7 mi)**: manter FORA do disponível (é kit em montagem, não
   vendável) , coerente com a reunião ("estoque disponível para entrega" é a base da compra).
5. **4 pontas**: KPI de estoque na Diretoria, Relatórios, tool do Nex , todos leem de
   `classificarLocal`/fato de locais (fonte única), então herdam a correção.
6. Conferir o **id 414** no builder (hoje `rawDeleted=true` por acesso negado; após re-sync com
   acesso, deve vir ATIVO , garantir que a reconciliação não o mantenha como deletado).

## FRENTE B , PLAN 6 (novo): histórico temporal de preços e saldos

**Pedido do dono (transcrição/instrução):** guardar, com **data/hora (minuto, segundo)**, os
**preços** e as **quantidades** a **cada ciclo de atualização** (~10 min), para ter **histórico de
movimentação de estoque e histórico de preço** , "quem saiu, quem entrou, quando, de quanto era a
tabela". Consultável no NOSSO cache, sem ir ao Odoo.

**O que já existe:**
- `FatoEstoqueSaldoSnapshot`: foto **DIÁRIA** do saldo (produto/local, quantidade + vr_saldo),
  idempotente por dia. NÃO tem preço de tabela; granularidade só diária.

**O que falta (a construir):**
1. **Histórico de PREÇO** (não existe): a cada ciclo, snapshot de `fato_preco` (tabela, produto,
   valor) com timestamp. Nova tabela `fato_preco_snapshot` (ou `historico_preco`): (capturadoEm,
   tabelaId, produtoId, valor). Só grava quando o valor MUDA (append-only por mudança) para não
   inchar , histórico de variação de preço real.
2. **Histórico de SALDO por ciclo** (hoje só diário): granularidade por ciclo. Duas opções:
   (a) append incremental por MUDANÇA de saldo (delta: quem entrou/saiu, quando) , mais fiel ao
   "quem saiu/entrou"; (b) snapshot por ciclo (pesado: ~3,8k linhas × 144 ciclos/dia). **Recomendado:
   (a) append-only de variação** (registra só o que mudou desde o último ciclo), muito mais enxuto e
   é exatamente "histórico de movimentação".
3. **Fonte de movimentação real:** o Odoo já tem `estoque.extrato` (cada entrada/saída com data,
   local, contrapartida, documento). Avaliar ingerir o extrato como a espinha do "quem entrou/saiu"
   em vez de derivar de diffs (mais preciso). Perícia: volume do extrato e corte.
4. **Consulta:** funções no cache para série de preço de um produto/tabela e movimentação de um
   produto/local no tempo , 4 pontas (Diretoria, Relatórios, Nex).

**Regra durável a respeitar:** a data de início das análises FILTRA a leitura (nunca faxina); o
histórico ACUMULA (append-only), nunca apaga. Corte técnico da ingestão é separado.

## Perícia do dado da Frente B (medido no cache, 2026-07-19)

- **Preços de venda:** ~2.963 linhas (Venda Padrão tab 3 = 2.805; Venda Smart tab 5 = 158). Pequeno,
  muda raramente, tem coluna `atualizado_em`. → **append-por-mudança é o certo** (snapshot completo
  por ciclo daria ~2,9k × 144 ciclos/dia = ~425k linhas/dia, desperdício). Tabela nova
  `fato_preco_snapshot` grava (capturadoEm, tabelaId, produtoId, valor) só quando o valor difere do
  último registrado para aquele (produto,tabela).
- **`estoque.extrato` (movimentação):** 233.554 linhas no raw , é a espinha real do "quem
  entrou/saiu" (data, local, contrapartida, documento). Pesado; avaliar corte/ingestão incremental.
- **`fato_estoque_saldo_snapshot`:** só 8 dias (19/06 a 14/07), granularidade diária. A Frente B
  acrescenta granularidade por ciclo via append-por-mudança de saldo (não snapshot cheio por ciclo).

## Metodologia (por PLAN, inegociável)

Cada frente: perícia do dado (feita, este doc) → spec v1 → 2 reviews adversariais sequenciais → v3
→ plano v1 → 2 reviews → v3 → TDD por onda → perícia da onda → 4 pontas → E2E dado real. Opus nos
subagentes. Sem PR/merge sem liberação do dono.

## Ponto de retomada

1. Frente A: re-sync do estoque no dev + validar classificação dos 16 locais + intercompany 285 +
   KPIs + 4 pontas. (regra já pronta; falta o sync/validação/E2E)
2. Frente B: spec do histórico de preço/saldo (append-only de variação + avaliar ingerir extrato).
