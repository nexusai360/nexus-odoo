# Review Profunda #1 — SPEC v1 da F3 (Dashboard de Relatórios)

> Auditoria adversarial da `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md`.
> Conduzida em 2026-05-16. Evidência: schema Prisma real, código RBAC da F1, e
> inspeção direta do Postgres cache (tabelas `raw_*`).
> Critério (`CLAUDE.md` §6 [4]): achados materiais + tasks que escondem mais de
> uma unidade de trabalho. A spec **não passa** — precisa de v2.

---

## Sumário

| Severidade | Quantidade |
|---|---|
| Crítico | 6 |
| Importante | 9 |
| Menor | 6 |

**Críticos:** C1 enum `AuditAction` não cobre concessão de domínio · C2 `fato_estoque_movimento` não tem sync incremental confiável (write_date ausente) · C3 `fato_produto_parado` mede capital encalhado errado (satura em 179 dias e ignora saldo zero) · C4 `fato_estoque_saldo` enriquecido perde o valor R$ que R2 e R6 exigem · C5 a etapa "Acesso" do modal está subespecificada e o modo `create` não persiste domínios · C6 RBAC por domínio não define o que acontece com `manager`/`viewer` sem nenhum domínio vs. a regra hierárquica da F1.

**Importantes:** I1 `record_count` zerado para snapshots quebra "atualizado há Xs" · I2 entradas≠vendas — o sinal de `quantidade` não separa venda de transferência/inventário · I3 filtros e períodos dos relatórios não estão especificados · I4 fato não populado / estado de erro de leitura não tratado · I5 R6 (`PieChart`) com 9 famílias + 31 marcas viola a regra "≤6 fatias" da própria spec · I6 ordem das tasks e dependência fato→migration→builder→query não declarada · I7 `super_admin`/`admin` "veem tudo" sem linhas — divergência silenciosa quando surgir um 5º domínio · I8 performance das queries sobre `raw_estoque_extrato` (13k linhas, JSONB, sem índice nos campos internos) · I9 seed do `UserDomainAccess` para usuários já existentes não previsto.

---

## CRÍTICOS

### C1 — Enum `AuditAction` não tem ação para concessão de domínio
**Seção:** §4 ("Toda alteração de concessão registra `AuditLog`"), §11 decisão 3.
**Problema:** o enum `AuditAction` no `schema.prisma` (linhas 23–40) é fechado e
não contém nenhum valor tipo `domain_access_granted` / `domain_access_revoked` /
`user_domains_changed`. `AuditLog.action` é tipado por esse enum — não há como
registrar a auditoria que a §4 promete sem **migration que altera o enum**. A
spec trata a auditoria como dado, mas ela exige mudança de schema.
**Correção:** a spec deve declarar explicitamente o(s) novo(s) valor(es) de
`AuditAction` a adicionar (sugestão: um único `user_domains_changed`, com o
diff de domínios em `details Json`), e listar a migration do enum como task.

### C2 — `fato_estoque_movimento` não tem chave de sync incremental confiável
**Seção:** §5 (tabela de fatos, `raw_estoque_extrato`), §3 camada 1.
**Problema:** evidência do cache — em `raw_estoque_extrato` (13.548 linhas)
**apenas 3 linhas** têm `odoo_write_date` preenchido; no JSONB, `write_date` é
`false` em praticamente todos os registros. O builder do fato e o próprio sync
incremental da F2 dependem de `write_date` para saber o que mudou. Sem ele:
(a) o builder de `fato_estoque_movimento` não consegue ser incremental —
precisa de full rebuild a cada ciclo; (b) o próprio sync incremental do modelo
`estoque.extrato` (classificado `incremental` no `sync_state`) está cego —
pode estar perdendo registros novos silenciosamente. A spec assume "padrão da
F2" sem verificar que o padrão se aplica a esta fonte.
**Correção:** a spec deve declarar que o builder de `fato_estoque_movimento`
faz **rebuild completo** (não incremental), disparado após o ciclo do
`estoque.extrato`; e deve **sinalizar à F2** que o modo de sync de
`estoque.extrato` precisa revisão (provável `snapshot`, não `incremental`) —
isso é um gap de ingestão que afeta a confiabilidade de R3/R5/R6.

### C3 — `fato_produto_parado` mede a coisa errada
**Seção:** §5, §8 R4, research §1 R4.
**Problema:** três defeitos confirmados no cache:
1. `dias` satura em **179** (`max(dias)=179`) — a research já anota, mas a spec
   não traduz isso em requisito. "Produtos parados" sem teto explícito promete
   o que o dado não entrega.
2. Das 51 linhas com `dias>90`, apenas **19 têm `saldo>0`**. As outras 32 são
   produto×local com saldo zerado — não são "capital encalhado", são linhas
   mortas. A spec diz `fato_produto_parado` = `raw_estoque_saldo_hoje_duracao_dias`
   "(+ saldo)" sem definir o filtro. Sem `saldo > 0` o relatório R4 ("que capital
   está encalhado") infla o número em ~2,7×.
3. R4 quer "valor imobilizado" — `raw_estoque_saldo_hoje_duracao_dias` **não tem
   `vr_saldo`** (confirmado no sample: só `dias`, `saldo`, `saldo_anterior`,
   `data_anterior`). O valor R$ exige join com `raw_estoque_saldo_hoje` pelo par
   produto×local — a spec menciona "(+ saldo)" mas não diz que o join é por
   produto+local nem que a chave de join não é trivial (ver C4).
**Correção:** §5 deve definir `fato_produto_parado` com: filtro `saldo > 0`,
coluna `dias` com nota de saturação em 179 (e o relatório R4 exibindo a faixa
"+90 dias" como teto, sem prometer "+6 meses"), e o join explícito com
`raw_estoque_saldo_hoje` para trazer `vr_saldo`.

### C4 — `fato_estoque_saldo` enriquecido continua sem o valor R$ que R2/R6 precisam
**Seção:** §5 (linha `fato_estoque_saldo` "enriquecer com família/marca"), §8
R2 e R6.
**Problema:** o `FatoEstoqueSaldo` atual (schema linhas 1097–1111) tem
`quantidade`, `produtoNome`, `localNome`, `unidade` — **não tem valor R$**. A
research é explícita: "a tabela tipada não tem valor R$", "usar
`raw_estoque_saldo_hoje`, não `fato_estoque_saldo`". R2 ("valor de estoque por
armazém") e R6 ("concentração... mix") dependem de `vr_saldo`. A §5 diz só
"enriquecer com família/marca" — **esqueceu o campo mais importante**: `vr_saldo`.
Sem ele, R2 e R6 não têm fonte, ou são forçados a ler `raw` direto (violando o
princípio "nenhum relatório lê raw sem fato" do `fatos-modelagem.md`).
Detalhe adicional: no cache, `vr_saldo` só tem valor em 1.293 das 3.218 linhas
(os outros são saldo zero) — o fato precisa carregar `vr_saldo` mesmo quando 0,
e a query de R2/R6 precisa decidir se filtra `saldo>0`.
**Correção:** §5 deve listar os campos a acrescentar a `FatoEstoqueSaldo`
explicitamente: `vrSaldo Decimal`, `familiaId/familiaNome`, `marcaId/marcaNome`,
e também `disponivel`/`reservado`/`programado` se um relatório futuro próximo
(R9) os usar — decidir agora para não re-migrar. E remover o marcador
"PROVISÓRIO" do comentário do modelo (linhas 1094–1096), já que a F3 o promove
a definitivo.

### C5 — Etapa "Acesso" do modal: subespecificada e quebra o modo `create`
**Seção:** §4 ("UI de concessão"), §3 decisão, §9.
**Problema:** o `user-form-dialog.tsx` real tem **2 etapas** (`type Step = 1 | 2`,
`Identidade` → `Confirmação`), não 3. A spec diz "volta a etapa Acesso" como se
existisse — não existe no código atual; é construção nova. Além disso:
1. O modo `create` mostra a senha temporária e fecha (`CreatedPanel`). A
   concessão de domínio precisaria ser persistida **junto** com o `createUser` —
   mas `createUser` (em `src/lib/actions/users.ts`) não recebe domínios. A spec
   não diz se a concessão acontece no mesmo submit ou numa edição posterior.
2. A spec não define o estado inicial: usuário novo nasce com **zero** domínios?
   Com todos? Se zero, todo `viewer`/`manager` recém-criado vê um dashboard
   vazio até alguém editar — comportamento que precisa ser decisão explícita.
3. Não define se a etapa "Acesso" aparece para `super_admin`/`admin` (que "veem
   tudo" — a etapa seria inútil/confusa para esses papéis).
**Correção:** §4 deve especificar: (a) a etapa "Acesso" só aparece quando o
`role` selecionado é `manager`/`viewer`; (b) no `create`, os domínios entram no
payload de `createUser` e são persistidos na mesma transação; (c) o default de
um usuário novo (recomendado: zero domínios, com aviso visível na confirmação
"este usuário ainda não verá nenhum relatório"); (d) `Step` vira `1|2|3` e o
`stepperItems` ganha o item — listar isso como mudança concreta de arquivo.

### C6 — RBAC por domínio não se concilia com a hierarquia da F1
**Seção:** §4 inteira, §11 decisão 2.
**Problema:** a F1 tem dois eixos de permissão que a spec mistura sem resolver:
- **Hierarquia** (`PLATFORM_ROLE_HIERARCHY`): quem gerencia quem.
- **Domínio** (novo): o que cada um vê.
A spec diz "`super_admin`/`admin` veem todos os domínios". Mas e **quem pode
conceder domínio**? Um `admin` pode conceder o domínio `financeiro` a um
`manager` mesmo sem ter, ele próprio, qualquer noção de "ter" o domínio (admin
vê tudo). E um `manager` que gerencia usuários — pode conceder domínios? Pode
conceder um domínio que ele mesmo não tem? O princípio do `fatos-modelagem.md`
("só concede o que você tem") **conflita** com "admin vê tudo sem linhas":
admin não tem linhas, logo "não tem" nada, logo não poderia conceder nada.
A spec não fecha isso.
**Correção:** §4 deve declarar a regra de concessão explicitamente. Proposta:
quem pode editar o usuário-alvo (regra hierárquica da F1, `canEditUser`) pode
conceder/revogar domínios; `super_admin`/`admin` podem conceder qualquer
domínio; `manager` (se gerenciar usuários) só pode conceder domínios que ele
próprio possui. Isso reconcilia os dois eixos e mantém o "só concede o que
tem" para os papéis não-privilegiados.

---

## IMPORTANTES

### I1 — `record_count` zerado quebra "atualizado há Xs" dos snapshots
**Seção:** §3 (fatos derivados), implícito em todo relatório.
**Problema:** no `sync_state`, os modelos snapshot que alimentam os fatos —
`estoque.saldo.hoje`, `estoque.saldo.hoje.duracao.dias` — têm `record_count = 0`
apesar de terem 3.218 linhas cada. A research §1.2 já sinaliza o bug. A spec da
F3 promete que toda tela mostra "atualizado há Xs" (decisão canônica do
`CLAUDE.md` §5.2) — mas a fonte de freshness está corrompida para justamente os
modelos de estoque.
**Correção:** a spec deve registrar a dependência: ou a F3 corrige o
`record_count` da F2, ou o indicador de freshness dos relatórios usa
`last_snapshot_at`/`last_incremental_at` (que estão corretos) em vez de
`record_count`. Decidir e escrever.

### I2 — "Entradas vs. saídas" e "o que vendeu" confundem movimento físico com venda
**Seção:** §8 R3 ("entradas vs. saídas"), R5/R6 ("o que mais saiu").
**Problema:** no `raw_estoque_extrato` o sinal de `quantidade` separa entrada de
saída (6.001 / 6.030 / 1.517 com qtd zero — atenção: **11% das linhas têm
quantidade 0**, precisam ser excluídas das contagens). Mas uma "saída" inclui
transferência entre armazéns, devolução, ajuste de inventário — não só venda. Os
prefixos de `origem` confirmam a mistura: `NF-` (5.946), `INV` inventário
(2.968), `OP-` (2.032), `PV-` venda (1.784), `TRA` transferência (567). A
research recomenda usar `local_inverso_id = 5` (Vendas » Terceiros) como proxy
de venda — só 2.420 das 13.548 linhas. A spec §8 R3/R5/R6 não diz qual
definição usa: "saída física total" ou "saída por venda". São números
radicalmente diferentes e mudam o builder do fato.
**Correção:** §5/§8 devem definir por relatório: R3 ("pulso da movimentação")
provavelmente quer movimento físico total; R6 ("o que vendeu") quer o filtro de
venda (`local_inverso_id=5` e/ou `origem` `PV-`). O fato `fato_estoque_movimento`
deve carregar `tipo`, `local_inverso_id` e a classificação de natureza
(venda/transferência/inventário) como colunas, para cada relatório filtrar — não
deixar essa lógica na query nem na UI.

### I3 — Filtros e períodos dos relatórios não estão especificados
**Seção:** §7 ("controles de filtro/período no topo"), §8.
**Problema:** §7 menciona "controles de filtro/período" genericamente. A
research detalha filtros por relatório (produto, família, armazém, período) mas
a spec não os captura. Cada relatório tem necessidade distinta: R1 filtra
produto/armazém/família; R3/R5/R6 precisam de seletor de período (e R3 tem janela
útil só fev–mai/2026 — antes disso o volume é residual: out/25 tem 2 linhas,
nov/25 tem 39). Sem especificar os filtros, "página de relatório" é um épico
vago.
**Correção:** §8 deve ganhar uma coluna "Filtros" por relatório, e a spec deve
definir o default de período (sugestão: últimos 3 meses, ou fev–mai/2026 fixo
para R3 com aviso) e o componente de filtro como parte da infraestrutura
declarativa (cada entrada do catálogo declara seus filtros).

### I4 — Fato vazio / erro de leitura não tratado
**Seção:** §3, §6 (empty-state), §10.
**Problema:** §6 cobre empty-state "quando não há dado" no template visual. Mas
não cobre o caso estrutural: o **fato ainda não foi populado** (builder nunca
rodou, ou rodou com erro). Cenário real: deploy da F3, builder de
`fato_estoque_movimento` agendado mas ainda não executado → a tabela existe
vazia. "Sem dado" (empty-state normal) e "fato ainda não construído" são
estados diferentes e o usuário precisa ver mensagens diferentes ("nenhum
movimento no período" vs. "relatório ainda sendo preparado").
**Correção:** a spec deve distinguir os dois estados e definir como a query de
leitura sinaliza "fato não populado" (ex.: checar `sync_state` do modelo-fonte,
ou um timestamp de último build do fato). Considerar adicionar um registro de
estado de build de fato.

### I5 — R6 (`PieChart`) viola a regra "≤6 fatias" da própria spec
**Seção:** §6 (PieChart "≤6 fatias, senão sugere barra"), §8 R6.
**Problema:** R6 é "concentração por **família e marca**" em `PieChart`. O cache
tem **9 famílias** e **31 marcas**. A própria §6 diz que PieChart acima de 6
fatias deve virar barra. R6 com 9 famílias já estoura; com 31 marcas, é
inutilizável como pizza. Além disso "família **e** marca" num único PieChart é
ambíguo — pizza mostra uma dimensão só.
**Correção:** §8 R6 deve ou (a) virar dois gráficos — pizza/donut por família
(9, ainda acima de 6 — aplicar agrupamento "Outros") + barras por marca; ou
(b) PieChart de família com top-5 + "Outros", e marca em BarChart. Resolver a
ambiguidade "família e marca" antes do plano.

### I6 — Ordem e dependências das tasks não declaradas
**Seção:** §9, §10.
**Problema:** §9 lista arquivos mas a spec não declara a ordem obrigatória:
migration Prisma (fatos + `UserDomainAccess` + enum) → `prisma generate` →
builder do worker → query de leitura → componente → catálogo. Um relatório só é
testável de ponta a ponta depois do fato populado. A spec não decompõe isso —
"6 fatos/relatórios" como blocos é épico. Para o plano sair limpo (`CLAUDE.md`
§6 [4] decomposição máxima), cada relatório precisa virar uma cadeia de
sub-tasks ordenadas, e os 3 fatos precisam ser tasks separadas das 6 telas.
**Correção:** a spec não precisa virar plano, mas deve declarar a topologia de
dependências (fato → migration → builder → query → componente → catálogo →
RBAC) para o plano poder decompor sem ambiguidade.

### I7 — "veem tudo sem linhas" cria divergência futura silenciosa
**Seção:** §4 ("`super_admin`/`admin` veem todos os domínios... não precisam de
linhas").
**Problema:** modelar "admin vê tudo" como ausência de linhas funciona hoje,
mas quando um 5º domínio for adicionado, admin passa a vê-lo automaticamente
sem decisão explícita — pode ser certo ou errado, mas é implícito. E impede
auditar "o que o admin podia ver na data X". Também complica a UI: a etapa
"Acesso" para um admin não teria o que mostrar.
**Correção:** aceitável manter, mas a spec deve registrar a decisão como
consciente e suas consequências (novo domínio = admin ganha acesso automático;
etapa "Acesso" oculta para admin/super_admin — ver C5). Documentar, não deixar
implícito.

### I8 — Performance: queries de relatório sobre JSONB sem índice
**Seção:** §3 (query de leitura), §10.
**Problema:** R3/R5/R6 leem `fato_estoque_movimento` derivado de
`raw_estoque_extrato` (13.548 linhas). Se o builder agrega bem, o fato fica
pequeno e rápido. Mas se alguma query de leitura cair em `raw_*` direto (risco
real dado C4), filtrar/agregar por campos **dentro do JSONB** não usa índice —
os únicos índices nas `raw_*` são `odoo_write_date` e `raw_deleted`. A spec não
diz nada sobre índices nas tabelas de fato novas.
**Correção:** a spec deve exigir que os fatos `fato_estoque_movimento` e
`fato_produto_parado` declarem seus índices (mês, produtoId, localId, familiaId
conforme os filtros de I3) e reafirmar que **nenhuma query de leitura toca
`raw_*`** — toda agregação é pré-computada no builder.

### I9 — Seed/backfill de `UserDomainAccess` para usuários existentes não previsto
**Seção:** §4, §9, §11 decisão 3.
**Problema:** quando a F3 entrar em produção, já existem usuários (no mínimo o
owner + os criados na F1). A nova tabela `UserDomainAccess` nasce vazia. Os
`super_admin`/`admin` continuam vendo tudo (sem linhas — ok). Mas qualquer
`manager`/`viewer` já existente passa a ter **zero domínios** = dashboard de
relatórios vazio, sem aviso. A spec não trata a migração de dados.
**Correção:** a spec deve definir a estratégia de backfill: ou um seed que
concede a todos os `manager`/`viewer` existentes o domínio `estoque` (o único
do lote 1), ou aceitar conscientemente que ninguém vê nada até concessão manual
— e nesse caso a release precisa de um passo operacional documentado.

---

## MENORES

### M1 — Item de nav "Relatórios": padrão de visibilidade
**Seção:** §7, §9. O `NAV_ITEMS` real tem `visibleTo` e `section`. A spec diz
"visível a todo usuário autenticado". Um item sem `section` cai no grupo
default (junto de "Dashboard"). OK, mas a spec deve dizer explicitamente: sem
`section`, sem `visibleTo`. Detalhe trivial mas evita ambiguidade no plano.

### M2 — `ReportDomain`: enum Prisma vs. constante TS
**Seção:** §4 ("Novo enum/constante `ReportDomain`"). A spec deixa em aberto.
Se `UserDomainAccess.domain` for tipado, deveria ser enum Prisma (consistente
com `PlatformRole`, `AuditAction`). Decidir: enum Prisma. A indecisão "enum/
constante" não deveria sobreviver para o plano.

### M3 — Recharts: nova dependência não registrada como decisão
**Seção:** §6, §11. Recharts é dependência nova de produção (bundle size,
licença, compat com Next 16 / React 19). A §11 não a lista como decisão. Menor,
mas merece uma linha no resumo de decisões.

### M4 — `DataTable` "estende o padrão `audits-table`"
**Seção:** §6. "Estende" é vago. `audits-table` é específico de auditoria;
generalizá-lo para um `DataTable` reutilizável é refactor, não extensão. A spec
deve dizer se cria componente novo genérico ou extrai do `audits-table`.

### M5 — Numeração R1–R6 diverge da research
**Seção:** §8 nota de rodapé. A spec renumerou: o "R6" da spec (família/marca)
é o "R8" da research; o "R5" da spec (top movimentados) é o "R6" da research. A
nota explica, mas qualquer rastreamento cruzado spec↔research vai confundir.
Sugestão: tabela de-para explícita na spec.

### M6 — Saldo negativo no estoque não é mencionado
**Seção:** §8 R1. O cache tem **138 linhas com saldo negativo** em
`raw_estoque_saldo_hoje`. R1 ("saldo por produto e armazém") vai exibi-los. Não
é erro, mas a spec poderia notar que saldos negativos aparecem e como o
`DataTable` os trata (R11 da research cobre o tema como relatório próprio —
fora do lote 1, ok).

---

## Veredito

A spec **não passa** na Review #1. Há **6 achados Críticos** que invalidam
premissas centrais (fontes de dados dos fatos, auditoria, integração RBAC) e
**9 Importantes** que deixariam o plano ambíguo. Os fatos da §5 — o coração da
F3 — estão subespecificados: `fato_estoque_movimento` não tem chave de sync
(C2), `fato_produto_parado` mede errado (C3), `fato_estoque_saldo` esquece o
campo R$ que metade dos relatórios precisa (C4). A spec deve ir para v2
endereçando todos os Críticos e Importantes, com atenção especial a: definição
exata de colunas/filtros/joins de cada fato, reconciliação dos dois eixos de
RBAC, e a etapa "Acesso" do modal como construção nova (não "retorno").
