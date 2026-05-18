# Review Profunda #2 — SPEC v2 da F3 (Dashboard de Relatórios)

> Auditoria adversarial — última review antes de a spec virar plano.
> Conduzida em 2026-05-16. Documento revisado:
> `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (SPEC v2).
> Review #1: `docs/superpowers/reviews/2026-05-16-dashboard-spec-review-1.md`.
> Evidência: schema Prisma real, RBAC da F1 (`permissions.ts`, `roles.ts`,
> `nav.ts`, `user-form-dialog.tsx`, `actions/users.ts`), research de estoque, e
> inspeção direta do Postgres cache (`raw_*`, JSONB) — números verificados
> linha a linha.
> Critério (`CLAUDE.md` §6 [4–6]): a v2 só passa se todo Crítico/Importante da #1
> estiver resolvido **de verdade**, não há achado material novo, e a spec está
> decomposta o suficiente para o `writing-plans` escrever steps concretos sem
> adivinhar.

---

## Sumário

| Severidade | Quantidade |
|---|---|
| Crítico | 4 |
| Importante | 7 |
| Menor | 5 |

**Críticos:** N1 campos relacionais do Odoo são arrays `[id, nome]` no JSONB — nenhum fato da §5 declara como extrai id/nome · N2 `fato_produto_parado` declara join "por par produto×local" que está errado e frágil — existe chave direta `saldo_hoje_id` · N3 `natureza` de `fato_estoque_movimento` (§5.2) não é derivável de forma confiável dos dados reais; a regra "prefixo de origem + local_inverso_id" é subespecificada e ambígua · N4 join produto→família/marca falha silenciosamente para 32 linhas de saldo sem produto cadastrado e 240–254 produtos sem família/marca — a §5.1 não trata os nulos.

**Importantes:** N5 `tipo String?` do extrato carrega código cru (`00`/`04`/`07`), não texto legível, e a spec não diz · N6 a regra de freshness (§7/§11) ainda depende de `record_count` num ponto e a I1 ficou meio resolvida · N7 a §5.4 reusa `SyncState.lastSnapshotAt` como sinal de "fato preparado", mas isso mede o sync do raw, não o build do fato — há janela de inconsistência · N8 R6 mistura dois fatos/dois gráficos numa entrada de catálogo única, mas o catálogo declarativo de §3 modela "um relatório = um template" · N9 a transação de `createUser` + domínios (§4.4) cruza dois clientes Prisma/pools distintos sem a spec reconhecer · N10 a etapa "Acesso" depende do `role` selecionado em tempo real, mas a spec não diz o que acontece ao trocar o role no meio do fluxo · N11 R2/R6 precisam decidir o filtro `saldo>0`/`vrSaldo>0` e a spec não fecha — 1.925 de 3.218 linhas têm valor zero.

---

## Verificação da Review #1 — item a item

| # | Achado #1 | Status na v2 | Observação |
|---|---|---|---|
| **C1** | `AuditAction` sem ação de concessão de domínio | ✅ Resolvido | §4.3 adiciona `user_domains_changed`, declara migration do enum como task, `details Json` carrega o diff. Confirmado contra `schema.prisma` (enum nas linhas 23–40 realmente não tem o valor). |
| **C2** | `fato_estoque_movimento` sem chave de sync confiável | ✅ Resolvido | §2, §5.2 e decisão 8 declaram `estoque.extrato` → `snapshot` + rebuild completo do builder. Verificado: 13.545/13.548 linhas têm `write_date=false` — o diagnóstico está certo. **Mas ver N7** (o sinal de "fato preparado" herdado disso ficou frouxo). |
| **C3** | `fato_produto_parado` mede errado | ⚠️ Parcial | Filtro `saldo>0` e teto "+90 dias" resolvidos e batem com o dado (`max(dias)=179`; 51 linhas `>90`, só 19 com `saldo>0`). **Mas o join para `vrSaldo` está especificado errado — ver N2.** Achado novo. |
| **C4** | `fato_estoque_saldo` sem valor R$ | ✅ Resolvido | §5.1 acrescenta `vrSaldo`, `familiaId/Nome`, `marcaId/Nome`, índices, remove "PROVISÓRIO". Confirmado: `FatoEstoqueSaldo` (linhas 1097–1111) não tem `vrSaldo` hoje. **Mas o join família/marca tem nulos não tratados — ver N4.** |
| **C5** | Etapa "Acesso" subespecificada / `create` não persiste | ✅ Resolvido | §4.4 detalha Step `1\|2\|3`, visibilidade por role, persistência transacional no `create`, default zero domínios com aviso. Confirmado: `user-form-dialog.tsx` realmente tem `type Step = 1 \| 2`. **Ressalvas N9 e N10.** |
| **C6** | RBAC por domínio não concilia com hierarquia da F1 | ✅ Resolvido | §4.1 reconcilia os dois eixos via `canEditUser` + "manager só concede o que tem". Coerente com `permissions.ts` real. |
| **I1** | `record_count` zerado quebra "atualizado há Xs" | ⚠️ Parcial | §7 e decisão 11 trocam para `last_snapshot_at`/`last_incremental_at`. **Mas a §3 camada 2 e a §5.4 ainda têm referências a estado que não fecham — ver N6.** |
| **I2** | Entrada≠venda; movimento físico vs. venda | ⚠️ Parcial | §8 nota diz "R3/R5 = movimento físico total"; `fato_estoque_movimento` carrega `natureza`. **Mas a derivação de `natureza` está subespecificada e não é confiável — ver N3.** Achado material novo. |
| **I3** | Filtros/períodos não especificados | ✅ Resolvido | §8 ganhou coluna "Filtros"; defaults declarados (R3 "últimos 3 meses"). Catálogo declara `filtros` (§3 camada 4). |
| **I4** | Fato vazio / erro de leitura não tratado | ⚠️ Parcial | §5.4 e §6.1 definem 3 estados. **Mas o mecanismo de detecção (reusar `lastSnapshotAt`) é frágil — ver N7.** |
| **I5** | R6 PieChart viola "≤6 fatias" | ✅ Resolvido | §8 R6 = `PieChart` família (top-5 + Outros) + `BarChart` marca. **Mas vira dois gráficos numa entrada de catálogo só — ver N8.** |
| **I6** | Ordem/dependências das tasks | ✅ Resolvido | §3 declara a topologia obrigatória `migration → generate → builder → query → componente → catálogo → RBAC`. |
| **I7** | "veem tudo sem linhas" — divergência futura | ✅ Resolvido | §4.1 registra como decisão consciente; etapa "Acesso" oculta para admin. |
| **I8** | Performance queries sobre JSONB sem índice | ✅ Resolvido | §3 camada 1 reafirma "nenhuma query lê raw"; §5 exige índices declarados por fato. |
| **I9** | Seed/backfill de `UserDomainAccess` | ✅ Resolvido | §4.3 backfill concede `estoque` a `manager`/`viewer` existentes. |
| **M1** | Nav "Relatórios": visibilidade | ✅ Resolvido | §7 explicita "sem `section`, sem `visibleTo`". Coerente com `nav.ts`. |
| **M2** | `ReportDomain` enum vs constante | ✅ Resolvido | §4 fixa enum Prisma. |
| **M3** | Recharts não registrada como decisão | ✅ Resolvido | Decisão 9. |
| **M4** | `DataTable` "estende audits-table" | ✅ Resolvido | §6 fixa "componente novo genérico". |
| **M5** | Numeração R1–R6 diverge da research | ✅ Resolvido | §8 tem de-para (R5 spec = R6 research; R6 spec = R8 research). |
| **M6** | Saldo negativo não mencionado | ❌ Não tratado | A v2 não menciona as 138 linhas de saldo negativo (confirmado no cache). Era Menor na #1 e segue como Menor — ver M-novo M5. |

**Conclusão da verificação:** 13 dos 21 achados da #1 estão resolvidos de
verdade. 7 ficaram **parciais** (C3, I1, I2, I4 + os derivados) e 1 não foi
tratado (M6). Os parciais geram os Críticos/Importantes novos abaixo.

---

## CRÍTICOS

### N1 — Os campos relacionais do Odoo são arrays `[id, nome]`; nenhum fato da §5 diz como extrai
**Seção:** §5.1, §5.2, §5.3 inteiras.
**Problema:** a §5 lista colunas como `produtoId/Nome`, `localId/Nome`,
`familiaId/familiaNome`, `localInversoId` como se os dados de origem tivessem
campos `produto_id` (int) e `produto_nome` (string) separados. **Não têm.** No
JSONB real todo campo many2one do Odoo é um array de dois elementos
`[id, "rótulo"]`:
- `raw_estoque_extrato.data->'produto_id'` = `[14410, "[81231] 141001 - BARRA CROMADA 40CM STANDARD"]`
- `raw_estoque_extrato.data->'local_inverso_id'` = `[5, "Vendas » Terceiros"]`
- `raw_sped_produto.data->'familia_id'` = `[4004, "ASTEC"]`
- `raw_estoque_saldo_hoje.data->'produto_id'` = `[14410, "[81231] 141001 - ..."]`
Cada `*Id Int` da §5 sai de `(data->'campo'->>0)::int` e cada `*Nome String`
de `data->'campo'->>1`. Quando o campo é nulo no Odoo o valor é o **booleano
`false`** (`data->'familia_id' = 'false'::jsonb`), não `null` — confirmado:
240 produtos têm `familia_id = false`. O builder precisa tratar `false` antes
de indexar `[0]`/`[1]`.
**Por que é Crítico:** sem isso declarado, o `writing-plans` não consegue
escrever o step de extração do builder — ele vai assumir colunas planas e o
builder vai quebrar em runtime no primeiro registro. Afeta os 3 fatos.
**Correção:** §5 deve declarar, como regra geral dos builders: "campos
relacionais do Odoo chegam como `[id, rótulo]` ou `false`; o builder extrai
`->>0`/`->>1` e normaliza `false → null`". E cada coluna `*Id`/`*Nome` deve
nomear o campo-fonte exato (`produto_id[0]`, `produto_id[1]`, etc.).

### N2 — `fato_produto_parado` declara join "por par produto×local" — está errado; há chave direta
**Seção:** §5.3.
**Problema:** a §5.3 diz que o `vrSaldo` vem de "join com `raw_estoque_saldo_hoje`
(por par produto×local)". Verificação no cache: `raw_estoque_saldo_hoje_duracao_dias`
carrega `data->'saldo_hoje_id'` = `[103175, "estoque.saldo.hoje,103175"]`,
**uma FK explícita e direta** para `raw_estoque_saldo_hoje.data->'id'`. Mais:
o próprio `data->'id'` da linha de duração **é igual** ao `id` do saldo de hoje
(verificado: `duracao.id == saldo_hoje.id` na amostra). A cobertura é 100% —
3.218/3.218 linhas de duração têm `saldo_hoje_id` válido em `saldo_hoje`.
O join por "par produto×local" é não só desnecessário como **frágil**: um par
produto×local não é único (o mesmo produto pode ter mais de uma linha no mesmo
local — saldo por lote/variante) e pode produzir duplicação ou match errado.
A spec adotou a recomendação mais fraca da research em vez de inspecionar a
chave real.
**Por que é Crítico:** o plano vai escrever o builder com a chave errada. O
join por par pode silenciosamente inflar `R4` ou trazer `vrSaldo` de outra
linha. É exatamente o tipo de defeito que a §3 ("fato pré-computado correto")
existe para evitar.
**Correção:** §5.3 deve trocar para "join por `saldo_hoje_id` (FK direta;
`raw_estoque_saldo_hoje_duracao_dias.data->'saldo_hoje_id'[0]` → `raw_estoque_saldo_hoje.data->'id'`)".

### N3 — `natureza` de `fato_estoque_movimento` não é derivável de forma confiável; regra subespecificada
**Seção:** §5.2 ("`natureza String`... derivada do prefixo de `origem` e de `local_inverso_id` — ver I2").
**Problema:** a §5.2 promete classificar cada movimento em
`venda/transferencia/inventario/producao/outro` "derivada do prefixo de
`origem` e de `local_inverso_id`", mas não dá a regra — só aponta para a I2,
que também não a fecha. Os dados reais mostram que a derivação por prefixo é
ambígua:
- prefixo `NF-` tem **5.946 linhas** — é o maior grupo, e cobre **tanto entrada
  quanto saída** (ex.: `NF-e nº 13.132` com `quantidade=+2` é entrada por
  transferência; uma NF de venda é saída). Prefixo `NF-` não mapeia para uma
  natureza única.
- `INV` (2.968) → inventário; `OP-` (2.032) → produção; `PV-` (1.784) → venda;
  `TRA` (567) → transferência; `ROM` (250) → ?; `fal` (1) → ?.
- A research diz que o proxy **confiável** de venda é `local_inverso_id = 5`
  (`Vendas » Terceiros`, 2.420 linhas) — que **não bate** com a contagem de
  `PV-` (1.784). Os dois critérios divergem em ~640 linhas. A spec não diz qual
  vence quando conflitam.
- `local_inverso_id` tem `[7, "Ajuste de inventário » Virtual"]` (2.968) — bate
  com `INV`; mas há também `[6, "Compras » Terceiros"]` (1.383) que a regra de
  natureza não menciona (compra é uma 6ª natureza? cai em "outro"?).
**Por que é Crítico:** `natureza` é coluna do fato e índice declarado (§5.2). O
`writing-plans` não tem como escrever o step do builder — "classificar
natureza" é exatamente o placeholder que o `CLAUDE.md` §6 proíbe. Pior: se a
regra ficar errada, o lote-2 (relatório de venda) vai filtrar `natureza='venda'`
sobre uma base mal classificada.
**Correção:** §5.2 precisa de uma **tabela de decisão completa e ordenada**:
para cada combinação relevante de (`local_inverso_id`, prefixo de `origem`,
`tipo`, sinal de `quantidade`), qual `natureza`. Definir a precedência quando
critérios conflitam (sugestão: `local_inverso_id` manda, `origem` desempata).
Cobrir explicitamente `local_inverso_id=6` (compra) e os prefixos `ROM`/`fal`.
Se a classificação confiável não for possível agora, a alternativa honesta é
**não prometer `natureza` na F3** — carregar só `localInversoId`, `origemPrefixo`
e `tipo` como colunas cruas e deixar a classificação para o lote-2, quando
houver um relatório que a use. Decidir e escrever; do jeito atual o plano trava.

### N4 — Join produto→família/marca falha silenciosamente; nulos não tratados
**Seção:** §5.1.
**Problema:** §5.1 enriquece `fato_estoque_saldo` com `familiaId/Nome` e
`marcaId/Nome` "via join com `raw_sped_produto`". Verificação no cache:
- **32 de 3.218** linhas de `raw_estoque_saldo_hoje` têm `produto_id` que **não
  existe** em `raw_sped_produto` (3.186 fazem match). Para essas 32, o join não
  acha o produto → família/marca ficam nulas sem aviso.
- Dos produtos que existem, **240 têm `familia_id = false`** e **254 têm
  `marca_id = false`**. R6 ("concentração por família/marca") vai ter uma fatia
  "sem família" / "sem marca" não-trivial — e a §5.1/§8 R6 não dizem como
  exibi-la (rótulo "Não classificado"? excluir?).
- A §5.1 também não diz se `familiaNome` vem do array `familia_id[1]` (que já
  traz o rótulo, ex.: `"ASTEC"`) ou de um join extra com `raw_sped_produto_familia`.
  Como `familia_id` já é `[id, nome]`, o join extra é desnecessário — mas a spec
  não decide (ver N1).
**Por que é Crítico:** R6 é um dos 6 relatórios do lote e depende inteiramente
desse join. Sem a regra de tratamento de nulos, o builder e o relatório R6
ficam ambíguos, e o `PieChart` pode quebrar com uma fatia `null`.
**Correção:** §5.1 deve declarar: (a) `familiaNome`/`marcaNome` saem de
`familia_id[1]`/`marca_id[1]` (sem join extra); (b) quando o produto não está
em `raw_sped_produto` ou `familia_id`/`marca_id` é `false`, o fato grava `null`
e o relatório R6 agrupa esses casos sob "Não classificado"; (c) §8 R6 deve
mencionar essa categoria.

---

## IMPORTANTES

### N5 — `tipo` do extrato carrega código cru, não texto; a §5.2 não diz
**Seção:** §5.2 (`tipo String?`).
**Problema:** `raw_estoque_extrato.data->'tipo'` é um código de 2 dígitos:
`00` (12.263), `04` (1.283), `07` (2). Não é texto legível. A §5.2 declara
`tipo String?` sem dizer o que a coluna carrega nem o que os códigos
significam. Se algum relatório exibir `tipo`, vai mostrar `"00"` ao usuário.
**Correção:** §5.2 deve dizer que `tipo` carrega o código cru e — se for usado
em UI ou em `natureza` (ver N3) — precisa de um de-para código→rótulo. Se
nenhum relatório do lote 1 usa `tipo`, considerar não carregá-lo agora.

### N6 — Freshness: a I1 ficou meio resolvida; ainda há ponto que depende de `record_count`
**Seção:** §7, §3 camada 2, decisão 11.
**Problema:** §7 e a decisão 11 corrigem o indicador para
`last_snapshot_at`/`last_incremental_at`. Bom. Mas falta fechar dois pontos:
(a) qual dos dois timestamps cada relatório usa — `fato_estoque_movimento` vem
de modelo agora `snapshot` (usa `lastSnapshotAt`), `fato_estoque_saldo` idem,
mas a spec não amarra "relatório X → modelo-fonte Y → timestamp Z";
(b) o indicador mede a sync do **raw**, não o build do **fato** — se o raw
sincronizou às 14h mas o builder do fato falhou, o usuário vê "atualizado 14h"
sobre dado velho. Ver N7, que é a raiz.
**Correção:** §7 deve declarar o mapeamento relatório→modelo-fonte→campo de
timestamp explicitamente (é uma propriedade do catálogo, §3 camada 4), e
reconciliar com N7.

### N7 — `SyncState.lastSnapshotAt` como sinal de "fato preparado" mede a coisa errada
**Seção:** §5.4.
**Problema:** §5.4 resolve I4 reusando `SyncState.lastSnapshotAt` do
modelo-fonte como sinal: "se o modelo-fonte nunca sincronizou → fato ainda
sendo preparado". Mas isso mede o **sync do raw**, não o **build do fato**.
Cenário real: deploy da F3, o `estoque.extrato` já vinha sincronizando desde a
F2 (`lastSnapshotAt` preenchido) — mas o **builder novo `fato_estoque_movimento`
ainda não rodou**. Pela regra da §5.4, a query veria `lastSnapshotAt`
preenchido e classificaria como "sem dado no período" quando o estado real é
"fato ainda não construído". A §5.4 escolheu reusar um sinal existente em vez de
criar o correto, e o sinal não cobre o caso que I4 pediu para cobrir.
**Correção:** o sinal correto é um timestamp de **último build do fato** — uma
coluna `ultimoBuildAt` em cada tabela de fato, ou uma tabela `FatoBuildState`
análoga ao `SyncState`. A §5.4 deve adotar isso. É barato (uma coluna por fato)
e é a única forma de distinguir os dois estados de forma confiável.

### N8 — R6 são dois gráficos numa entrada de catálogo, mas o catálogo modela "um relatório = um template"
**Seção:** §3 camada 4, §8 R6.
**Problema:** §3 define a entrada de catálogo com um campo `template` (singular)
e o §6 lista 5 templates. §8 R6 é `PieChart` (família) **+** `BarChart` (marca)
— dois templates na mesma página. A estrutura declarativa de §3 não comporta
isso: ou `template` vira uma lista, ou R6 não cabe no modelo. Idem R4
(`KPICard` + `DataTable`). A spec declarou o modelo declarativo e os relatórios
multi-template sem reconciliar os dois.
**Correção:** §3 camada 4 deve declarar que uma entrada de catálogo pode ter
**uma ou mais "seções"**, cada seção com seu próprio `template` + `fato` +
`config`. A página `/relatorios/[id]` renderiza as seções em sequência. Isso
cobre R4 e R6 e mantém o modelo declarativo coerente para a F6.

### N9 — Transação `createUser` + domínios cruza dois mecanismos de acesso a banco
**Seção:** §4.4 ("persistidos na mesma transação que cria o usuário").
**Problema:** §4.4 exige que, no modo `create`, os domínios sejam persistidos
"na mesma transação" que `createUser`. O projeto usa Prisma v7 com
`@prisma/adapter-pg` e há também um `pg-pool.ts`. Uma transação Prisma real
(`prisma.$transaction`) abrange ambos os `create` (`user.create` +
`userDomainAccess.createMany`) — viável — mas a spec não diz que `createUser`
em `src/lib/actions/users.ts` precisa ser **refatorado** para envolver as duas
escritas num `$transaction`, nem que o `AuditLog` de `user_created` também
entra nela. Hoje `createUser` (linha 73) faz uma escrita só. "Mesma transação"
é um requisito de implementação não-trivial apresentado como detalhe.
**Correção:** §4.4 / §9 devem declarar como mudança concreta: "`createUser`
passa a abrir `prisma.$transaction` envolvendo `user.create` +
`userDomainAccess.createMany` (+ o `AuditLog`)". Listar como task de refactor.

### N10 — Etapa "Acesso" depende do `role` selecionado; troca de role no meio do fluxo não especificada
**Seção:** §4.4.
**Problema:** §4.4 diz que a etapa "Acesso" só aparece para `manager`/`viewer`
e que para `super_admin`/`admin` é pulada. Mas o role é escolhido na etapa 1
(Identidade) e o usuário pode **voltar e trocá-lo**. Cenários não cobertos:
(a) selecionou `manager`, marcou domínios, voltou e mudou para `admin` — os
domínios marcados são descartados? mantidos ocultos? (b) o stepper tem 3 itens
fixos ou o item "Acesso" some/aparece dinamicamente conforme o role? Um stepper
que muda de tamanho no meio do fluxo é frágil de UX e de estado. A §4.4 trata o
caso estático mas não o dinâmico.
**Correção:** §4.4 deve definir: o `stepperItems` é computado a partir do role
atual; ao mudar o role para um privilegiado, os domínios selecionados são
zerados; ao voltar para `manager`/`viewer`, a etapa reaparece vazia. Ou,
alternativa mais simples, manter os 3 passos sempre visíveis e desabilitar o
passo "Acesso" para roles privilegiados. Decidir.

### N11 — R2/R6 e o filtro de saldo/valor zero não fechado
**Seção:** §5.1, §8 R2/R6.
**Problema:** verificado no cache: das 3.218 linhas de `raw_estoque_saldo_hoje`,
só **1.293 têm `vr_saldo > 0`** e **1.317 têm `saldo > 0`** — ou seja ~1.925
linhas são saldo/valor zero. A §5.1 manda "carregar `vrSaldo` mesmo quando 0".
Correto para o fato. Mas R2 ("valor por armazém") e R6 ("concentração") vão
**agregar** esse fato — e se incluírem as ~1.925 linhas zeradas, não muda a
soma (zero não soma) mas infla contagens e a fatia "Não classificado". A spec
não diz se as queries de R2/R6 filtram `vrSaldo>0`. Em R4 a spec fechou
(`saldo>0`); em R2/R6 deixou aberto.
**Correção:** §8 deve declarar, por relatório, o filtro de agregação: R2/R6
filtram `vrSaldo>0` (ou `saldo>0`) na query de leitura. Decisão simétrica à de
R4.

---

## MENORES

### M1 — `disponivel`/`reservado`/`programado` em `fato_estoque_saldo`: a #1 sugeriu, a v2 não decidiu
A Review #1 C4 sugeriu avaliar incluir `disponivel/reservado/programado` em
`FatoEstoqueSaldo` para não re-migrar quando R9 chegar. A v2 §5.1 não menciona.
Os campos existem em `raw_estoque_saldo_hoje` (confirmado). Como R9 é lote 2 e
re-migrar é barato no projeto, é aceitável adiar — mas a spec deveria registrar
"decidido não incluir agora" em vez de silenciar.

### M2 — `odooId` vs `odooSaldoId`: convenção de nomes dos fatos não uniforme
`FatoEstoqueSaldo` atual usa `odooSaldoId`. §5.2 propõe `odooId` para
`fato_estoque_movimento`. §5.3 não nomeia a chave única de `fato_produto_parado`.
A spec deveria padronizar (sugestão: `odooId` em todos) e §5.3 deve declarar
sua chave única (provável `saldoHojeId`, já que duração é 1:1 com saldo).

### M3 — `fato_produto_parado` sem `unidade`; R4 (`DataTable`) pode precisar
§5.3 lista `produtoNome`, `localNome`, `saldo`, `dias`, `vrSaldo` — sem
`unidade`. R1 e a tabela mestre exibem `unidade`; R4 também é `DataTable` de
saldo e ficaria inconsistente sem ela. Decidir se entra.

### M4 — Saldo histórico e janela de R3: o aviso é por mês sem volume, mas o default pode cair fora
§8 R3 default "últimos 3 meses" + aviso se cair em meses sem volume. Hoje
(2026-05-16) "últimos 3 meses" = mar–mai/2026, todos com volume — ok. Mas a
regra é temporal: em jul/2026 o default ainda pega meses cheios; só é problema
no passado. Menor, mas a spec poderia dizer que o aviso compara o intervalo com
a janela útil conhecida (fev/2026 em diante) em vez de "meses sem volume"
genérico.

### M5 — Saldo negativo (M6 da Review #1) segue sem tratamento
138 linhas de `raw_estoque_saldo_hoje` têm `saldo < 0` (confirmado). R1
(`DataTable`) vai exibi-las. Não é erro, mas a spec deveria notar que saldos
negativos aparecem em R1 e que o `DataTable` os formata normalmente (com sinal,
`tabular-nums`). R11 da research cobre o tema como relatório próprio — fora do
lote, ok. Era M6 na #1 e não foi endereçado.

---

## Veredito

A v2 endereçou bem a maioria da Review #1 — os 6 Críticos da #1 estão formalmente
resolvidos, e 13 dos 21 achados estão fechados de verdade. Mas a verificação
contra os dados reais do cache revelou **4 Críticos novos**, todos no coração da
spec (a §5 dos fatos): a forma `[id, nome]` dos campos relacionais não está
declarada (N1), o join de `fato_produto_parado` está especificado errado (N2), a
`natureza` de `fato_estoque_movimento` não é derivável como a spec promete (N3),
e o join família/marca ignora nulos materiais (N4). Esses quatro impedem o
`writing-plans` de escrever steps concretos de builder — são exatamente os
placeholders ("derivar", "classificar", "join por par") que o `CLAUDE.md` §6
proíbe no plano. Os Importantes N7 (sinal de "fato preparado" mede o raw, não o
fato), N8 (catálogo declarativo não comporta relatórios multi-template) e N9
(transação cross-write) também deixariam o plano ambíguo.

**A spec NÃO está pronta para v3→plano.** Precisa de **mais uma rodada**: uma v3
que (a) declare a regra geral de extração `[id, nome]`/`false` dos JSONB; (b)
corrija o join de `fato_produto_parado` para a FK `saldo_hoje_id`; (c) feche a
classificação de `natureza` com tabela de decisão completa **ou** a remova do
escopo da F3; (d) trate os nulos de família/marca; (e) ajuste §5.4 para um
timestamp de build de fato real; (f) estenda o modelo de catálogo de §3 para
seções multi-template; (g) declare a refatoração transacional de `createUser`.
Os Importantes restantes e os Menores podem ser absorvidos na mesma v3. Dado
que os achados são concentrados e bem delimitados, a v3 deve ser uma revisão
cirúrgica da §5 e da §3, não uma reescrita — mas é uma rodada necessária antes
do plano.
