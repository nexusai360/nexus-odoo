# Runbook: como um fato/modelo novo entra na sincronização automática

> Escrito após o incidente de 2026-05-30 (o `sped.consulta.dfe.item` do O1 não
> sincronizava). A raiz NÃO era o design (que já é automático), e sim a imagem do
> worker não rebuildar. Este runbook deixa o caminho "certinho" para qualquer fato
> futuro (incremental, snapshot ou estático) entrar sozinho no schedule.

## 1. O design JÁ é automático (3 registros, nada além disso)

Para um modelo/fato novo sincronizar no mesmo horário dos outros, basta registrar
nos 3 lugares (é o que as ondas O1/O3 fizeram):

1. **`src/worker/catalog/model-catalog.ts`** , `MODEL_CATALOG`:
   `{ odooModel: "x.y.z", mode: "incremental" | "snapshot" | "estatico" }`.
   O cron do worker itera o catálogo POR MODO e sincroniza automaticamente
   (incremental ~10min, snapshot ~30min, estático segue a completa, reconcile 24h).
   Não há lista paralela: adicionou aqui, entra no ciclo.

2. **`src/worker/fatos/registry.ts`** , `FATO_BUILDERS`:
   `{ nome: "fato_x", cycle: "incremental" | "snapshot", run: rebuildFatoX }`.
   `runBuilders(cycle)` roda todos do ciclo, isolando falha (um erro não derruba os
   outros). Adicionou aqui, o fato reconstrói junto.

3. **`mcp/lib/freshness.ts`** , `FATO_FONTE`:
   `fato_x: { model: "x.y.z", mode: "incremental" }`.
   Liga o fato à fonte para o `withFreshness` ("atualizado há Xs") das tools.

> O painel "Estado da ingestão" (`/configuracao`) é data-driven do `MODEL_CATALOG`
> + `SyncState`: o modelo novo aparece sozinho com status/registros/última sync.

**Conclusão:** nenhum código extra de scheduling é necessário. Seguiu os 3 registros,
o fato sincroniza no mesmo período dos demais , DESDE QUE o worker rode o código novo
(seção 2).

## 2. A imagem do worker PRECISA rebuildar com o código novo (a raiz do incidente)

Em dev local, `app`, `worker` e `mcp` NÃO usam volume mount (CLAUDE.md §2.1).
Importante: o serviço **`worker` reusa a imagem `nexus-odoo:local` construída pelo
serviço `app`** (o `worker` não tem `build:` próprio no `docker-compose.yml`). Logo:

```bash
# Da PASTA PRINCIPAL (na main, atualizada): rebuilda a imagem compartilhada e o worker.
git pull origin main                     # traz o catálogo/builders novos
docker compose build app                 # constroi nexus-odoo:local (NAO "build worker": worker nao tem build)
docker compose up -d --force-recreate worker mcp
```

`docker compose build worker` responde "No services to build" , por isso, antes deste
runbook, rebuilds "do worker" silenciosamente não atualizavam nada e o worker ficava
em código velho (sem o modelo novo no catálogo), e o fato não sincronizava.

## 3. Dois guards de build que impediam o rebuild (corrigidos em definitivo)

O rebuild da imagem estava QUEBRADO (37h sem atualizar), por dois motivos , ambos
corrigidos para nunca mais travar:

1. **Worktrees poluíam o build.** O `next build`/`tsc`/contexto Docker da pasta
   principal varriam `branches/<outras-frentes>/`, e um arquivo com erro de tipo de
   OUTRA branch derrubava o build da imagem. **Correção (permanente):**
   `tsconfig.json` `exclude: [..., "branches"]` + `.dockerignore` com `branches`.
   Cada worktree continua buildando normal (roda do próprio diretório; o padrão
   `branches` é inócuo lá dentro).

2. **`server-only` quebrava o boot do worker.** Módulos do agente (R2-ctx:
   `contextualize.ts`, `get-reform-config.ts`, e ~28 arquivos) fazem
   `import "server-only"`, que o Next provê e o jest mocka, mas o worker (tsx) não
   resolvia (`MODULE_NOT_FOUND`), crashando em loop. **Correção (permanente):**
   `tsconfig.json` `paths: { "server-only": ["./src/lib/__mocks__/server-only.ts"] }`
   (no-op resolvível pelo tsx, mesma estratégia do jest; o `next build` segue verde).

Com os dois guards, a imagem rebuilda limpa e o worker sobe com o código atual ,
então qualquer fato novo registrado (seção 1) entra no schedule sem dor de cabeça.

## 4. Checklist ao criar um fato novo (qualquer categoria)

- [ ] `MODEL_CATALOG` com o `mode` correto (incremental/snapshot/estatico).
- [ ] `FATO_BUILDERS` com o `cycle` e o `run`.
- [ ] `FATO_FONTE` (freshness) ligando fato → modelo.
- [ ] Teste do builder + bump dos testes de contagem (`model-catalog.test`,
      `integration.test` se houver tool).
- [ ] Migration aditiva do fato (raw já costuma existir).
- [ ] Rebuild da imagem pela PASTA PRINCIPAL (`docker compose build app` + recreate
      worker/mcp), conforme seção 2.
- [ ] Conferir no painel "Estado da ingestão" que o modelo aparece ok e que o
      `lastIncrementalAt`/`recordCount` avançam no ciclo seguinte.
