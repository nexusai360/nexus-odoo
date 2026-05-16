# F2 — Ingestão — Review profunda do plano (etapas [4] e [6])

> Auditoria adversarial do `docs/superpowers/plans/2026-05-16-ingestao.md`.
> Duas passagens críticas conforme `CLAUDE.md` §6. Achados aplicados no Plan v2.

## Etapa [2] — Design UI/UX (feito antes das reviews)

A tela `/configuracao` foi desenhada com `ui-ux-pro-max` ancorada no padrão já
existente da seção `/usuarios` (F1) — não se inventa design system novo, reusa
o da F1. Contrato de design (alimenta o Bloco 6 do plano):

- `PageShell variant="narrow"` + `PageHeader` (ícone `Settings`, título
  "Configuração"), `motion.div` fade-in — idêntico a `/usuarios`.
- `Tabs` com duas abas (mesmo componente de `UsersTabs`): **Sincronização**
  (formulário de intervalos) e **Estado** (tabela dos 79 modelos).
- Formulário: `Input` + `Label` visíveis (não placeholder-only), helper text,
  `Button` com estado de loading, `toast` (sonner) de sucesso/erro.
- Tabela de estado: componente `Table` da F1, padrão da `AuditsTable`. Colunas
  Modelo / Modo / Status / Registros / Última sync. Status como `Badge`
  semântico: ok=verde, erro=vermelho, sem_acesso=cinza, rodando=violet.
  Números tabulares na coluna Registros. Datas em `pt-BR`.
- RBAC: page server component redireciona não-`super_admin` para `/dashboard`.
- Dark mode: só tokens semânticos existentes (`text-muted-foreground` etc.).

## Review #1 — lacunas, ordem, premissas

**A1 (crítico) — Worker não reagenda ao mudar a config.** O Plan v1 lia os
intervalos só no boot (`agendar()` roda uma vez). Mudar o intervalo na tela
`/configuracao` não teria efeito até reiniciar o worker — **viola o spec**
§5.3/§11.6 ("editáveis em runtime, sem redeploy"). O texto de ajuda da UROADM
ainda dizia "entram no próximo reinício do worker", contradizendo o spec.
→ **Correção:** adicionar um job-scheduler `config-check` (a cada 1 min) que
relê `SyncConfig` e reaplica os intervalos via `upsertJobScheduler` (idempotente).
Ajustar o texto de ajuda da tela.

**A2 (crítico) — API BullMQ errada.** O Plan v1 usava `queue.add(name, {}, {repeat})`.
BullMQ 5.73 usa **Job Schedulers**: `queue.upsertJobScheduler(id, {every}, {name})`.
→ **Correção:** Task 15 reescrita com `upsertJobScheduler`.

**A3 (crítico) — Prisma client do worker sem adapter.** O Plan v1 fazia
`new PrismaClient()` cru. O projeto usa Prisma v7 com `PrismaPg`
(`src/lib/prisma.ts`) — sem o adapter o client não conecta.
→ **Correção:** criar `src/worker/prisma.ts` espelhando `src/lib/prisma.ts`
(adapter `PrismaPg` + `DATABASE_URL`).

**A4 (médio) — Env do worker em dev.** Não há `dotenv`; `tsx src/worker/index.ts`
não carrega `.env.local`. Em produção o container `worker` recebe as `ODOO_*`
via `docker-compose` (verificado), mas o smoke test local falharia.
→ **Correção:** smoke test e script `worker` usam `tsx --env-file=.env.local`.

**A5 (menor) — Task 3 com rascunho inválido.** A Task 3 mostrava uma versão
errada de `searchReadPaged` (chamada `executeKw` espúria) seguida de "use a
versão limpa". Plano não pode conter código errado.
→ **Correção:** manter só a versão limpa.

## Review #2 — granularidade, integração, testabilidade

**B1 (médio) — Task 19 era invocação de skill, não tarefa.** Com a etapa [2]
já feita, "invocar `ui-ux-pro-max`" não é um passo de execução.
→ **Correção:** Bloco 6 reescrito com o contrato de design acima embutido;
Task 19 vira implementação concreta com os componentes da F1.

**B2 (menor) — `reconcile` roda em modelos snapshot.** `processReconcileCycle`
itera todo o catálogo, inclusive `snapshot`/`estatico` que são full-refresh.
Reconcile neles é redundante mas inofensivo (idempotente). Aceito; documentado.

**B3 (menor) — backfill linha a linha.** `syncIncremental` faz `upsert` 1 a 1;
no backfill de `estoque.extrato.rastreabilidade` (23k) é lento porém correto e
roda no worker, fora do caminho do usuário. YAGNI: sem batching agora.

**Granularidade:** Task 6 reúne 79 tabelas + 2 modelos + migration, mas é
geração mecânica por script — unidade única aceitável. Demais tasks são
bite-sized. Testabilidade: cada unidade tem teste isolado. Sem mais achados
materiais — critério de saída atingido após aplicar A1–A5 e B1.

## Resultado

Plan v2 incorpora A1–A5 e B1. As reviews não encontram mais achado material e
nenhuma task esconde mais de uma unidade de trabalho.
