# Deploy , CAMINHO DAS PEDRAS (ler ANTES de qualquer deploy)

> **REGRA DE RAIZ.** Ao pensar em deploy, a PRIMEIRA coisa é ler este arquivo.
> Ele tem o fluxo certo, por que cada peça existe, e como montar tudo do zero
> num projeto novo. Não improvisar, não investigar servidor antes de seguir os
> passos daqui. Atualizado 2026-06-14 (auto-deploy via Shepherd no ar).

---

## 1. TL;DR , como você faz deploy AGORA (nexus-odoo)

**Você só dá merge na `main`. A produção se atualiza sozinha em até ~5 min.**

```bash
# da worktree, com a branch commitada:
python3 scripts/ship.py "titulo do PR"     # mergeia na main (espera CI, squash)
# ... pronto. O GitHub builda a imagem e o Shepherd (na VPS) atualiza prod sozinho.
```

Não precisa rodar mais nada. Para acompanhar: ver a seção 6 (verificação).

> Se quiser **forçar o deploy na hora** (sem esperar os ~5 min do Shepherd) ou o
> Shepherd estiver fora do ar, use o deploy manual da seção 4.

> **Saúde do banco (2026-07-09).** Antes e depois de um deploy que mexe em
> schema, rode `python3 scripts/db-health.py --prod` (read-only, sai com código 1
> se houver pendência). As regras de migration, e o porquê de **nunca editar uma
> migration já aplicada**, estão em `docs/runbooks/db-migrations.md`.

### 1.1 PASSO OBRIGATÓRIO quando o deploy leva MUDANÇA DE SCHEMA (REGRA DE RAIZ, 2026-06-18)

> **ATUALIZADO 2026-07-09: o padrão agora é MIGRATION FORMAL, sempre.** Toda
> mudança de schema nasce como arquivo em `prisma/migrations/`; o entrypoint do
> `app` roda `prisma migrate deploy` no boot e aplica sozinho em prod. Nada de
> `prisma db execute` ou DDL solto , foi essa prática que sujou o banco de dev
> (11 checksums divergentes, tentativas falhas, drift). Ver
> `docs/runbooks/db-migrations.md`. O texto abaixo fica como registro do
> incidente e vale para o legado que ainda não virou migration.
>
> **O `prisma migrate deploy` do entrypoint NÃO aplica mudanças que foram feitas
> via `prisma db execute`. Ele só roda arquivos em `prisma/migrations/`.** Se uma
> mudança aditiva foi só por `db execute` (não virou arquivo de migração), o banco
> de PROD NÃO a recebe no deploy , o código sobe esperando coluna/enum que não
> existe em prod e quebra em runtime (ex.: "Erro ao listar usuários" porque faltava
> `users.last_activity_at`). Isso já derrubou a tela de Usuários em prod
> (incidente 2026-06-18, PR #129).
>
> **Portanto: se a sua entrega mexeu em `prisma/schema.prisma` (coluna nova, enum
> novo, etc.) e você aplicou no dev via `prisma db execute`, você TEM que aplicar
> o MESMO SQL aditivo no banco de PROD, junto do deploy.** Passos:
>
> 1. **Antes/depois do merge**, aplique o SQL aditivo idempotente (`IF NOT EXISTS`)
>    no banco de prod, via Portainer exec no container `nexus-odoo_db`. Modelo
>    pronto e reusável: `scripts/_prod-db-migrate-audit.py` (manda o SQL por
>    heredoc; psql em autocommit roda cada statement em sua transação, o que é
>    necessário p/ `ALTER TYPE ... ADD VALUE`). Adapte o SQL e rode:
>    ```bash
>    python3 scripts/_prod-db-migrate-audit.py   # ou um script equivalente p/ a sua mudança
>    ```
> 2. **Confirme em prod** que a mudança entrou (read-only):
>    ```bash
>    python3 scripts/_prod-db-query.py "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_activity_at'"
>    python3 scripts/_prod-db-query.py "SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='AuditAction'"
>    ```
> 3. Só então valide a feature em prod. Regra de ouro: **schema mudou no dev ⇒ o
>    mesmo SQL aditivo no banco de prod, sempre, no mesmo deploy.** Sempre aditivo
>    e idempotente (`ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`); nunca
>    DROP/rename direto em prod sem plano de compatibilidade.

---

## 2. Como funciona (a arquitetura, em 1 minuto)

```
git push / merge na main
        │
        ▼
GitHub Actions  ──build──►  ghcr.io/nexusai360/nexus-odoo:latest   (+ ...-mcp:latest)
 (jobs build-app, build-mcp = os ÚNICOS que importam)
        │
        ▼  (a imagem nova fica no registry)
Shepherd (roda DENTRO da VPS, a cada 5 min)
        │  vê que a :latest mudou → docker service update (1 serviço por vez, rollback se falhar)
        ▼
Produção atualizada (app, mcp, worker)
```

Três peças, cada uma com um porquê:
- **GitHub Actions** só **constrói e publica** a imagem no ghcr. Isso sempre
  funcionou (`build-app`/`build-mcp` = success em ~4 min).
- **O job `deploy` do Actions está MORTO de propósito.** Ele tentava mandar a
  VPS atualizar a partir do runner do GitHub, e **a borda da VPS bloqueia o IP
  do runner** (HTTP 000, TCP não conecta). Ignore esse job , ele falha sozinho
  sem afetar nada. (Não é quota, não é token. É rede runner→VPS.)
- **Shepherd** (`containrrr/shepherd`) roda **dentro da VPS**, então o firewall
  não atrapalha. Ele observa o ghcr e atualiza os serviços quando a imagem muda.

---

## 3. O auto-deploy (Shepherd) , como está montado

Serviço `shepherd-nexus-odoo` no Swarm (criado 2026-06-14). Config:
- **Imagem:** `containrrr/shepherd:latest`.
- **`FILTER_SERVICES=label=com.nexus.autodeploy=true`** , ele SÓ toca os
  serviços que têm esse label. Hoje: `nexus-odoo_app`, `nexus-odoo_mcp`,
  `nexus-odoo_worker`. **NUNCA** toca o `db`, o `redis`, nem os ~76 containers
  de outros projetos no mesmo Swarm. (Marcar um serviço = `Spec.Labels` com
  `com.nexus.autodeploy=true`; é metadata, não recria o container.)
- **`WITH_REGISTRY_AUTH=true`** + mount de `/root/.docker/config.json` (ro) , usa
  a credencial do ghcr que **já existe no nó** (o nó tem `docker login ghcr.io`
  feito; confirmado em `/root/.docker/config.json`). **Nenhum PAT é necessário.**
- **`SLEEP_TIME=5m`** , checa a cada 5 min. Se a imagem não mudou: "No updates"
  (no-op, zero churn , verificado). Se mudou: atualiza **um serviço por vez**
  (synchronous), o que evita o pico de memória que derrubou o banco no passado.
- **`ROLLBACK_ON_FAILURE=true`** , se o serviço novo não subir, volta ao anterior.
- **`IMAGE_AUTOCLEAN_LIMIT=3`** , limpa imagens antigas.

---

## 4. Deploy MANUAL (fallback , forçar na hora ou Shepherd fora)

`scripts/deploy-portainer.py` faz o mesmo que o Shepherd, sob demanda, da sua
máquina (que alcança a VPS). Útil para não esperar os 5 min, ou se o Shepherd
cair.

```bash
python3 scripts/deploy-portainer.py            # worker, mcp, app (ROLLING, 1 por vez)
python3 scripts/deploy-portainer.py mcp app    # subconjunto
```

- Faz **rolling** (um serviço por vez com pausa) , NUNCA os 3 juntos (isso
  estourou o 1GB do container do banco e causou OOM/crash recovery , lição
  2026-06-12). Re-busca a versão fresca por serviço (evita "update out of
  sequence") e confere `/api/health` no fim.
- Credencial do Portainer: o script lê `PORTAINER_URL`/`PORTAINER_TOKEN` de
  `env` > `.env.local` do projeto > `.env.production` dos projetos irmãos
  (`nexus-blueprint`/`nexus-nfe`/`nexus-crm-krayin`, mesmo Portainer/VPS).

Pré-requisito comum aos dois: a imagem nova já no ghcr (jobs `build-app`/
`build-mcp` = success). Confere com:
```bash
gh run list --workflow="Build and Push" --branch main --limit 1
gh api /repos/<org>/<repo>/actions/runs/<id>/jobs --jq '.jobs[]|.name+" "+(.conclusion//.status)'
```

---

## 4.1 MUDANÇA DE CONFIGURAÇÃO (env, memória, CPU) , REGRA DE RAIZ (2026-07-13)

**O compose da stack no Portainer é a FONTE DA VERDADE da configuração.** Mas
atenção ao que o deploy faz de verdade:

- O **Shepherd** e o `deploy-portainer.py` fazem *service update* pela API do
  Docker: trocam a **imagem** e forçam o rolling. O Shepherd **não** reaplica
  `environment` nem `resources`.
- Por isso o compose pode ficar dizendo uma coisa e o serviço vivo rodando outra,
  **em silêncio**. Foi exatamente o que aconteceu: o compose declarava heap 4096 e
  4608M de memória no worker, e o serviço vivo rodava com heap **1024** e 1536M , o
  worker morria de `JavaScript heap out of memory` e nada se atualizava
  (2026-07-12).

**Como mudar configuração, na ordem:**

```bash
# 1. Ver se já existe drift entre o compose e os serviços vivos (faz backup da stack)
python3 scripts/_prod-stack-drift.py

# 2. Baixar o compose, editar (fica em .prod-backups/, que tem SEGREDOS e está no .gitignore)
python3 scripts/_prod-stack-put.py --baixar .prod-backups/compose-novo.yml

# 3. Aplicar nos serviços VIVOS, rolling, um por vez (o deploy agora reconcilia
#    env/resources do compose junto com a imagem)
python3 scripts/deploy-portainer.py worker      # ou app / mcp

# 4. Publicar o compose (o PUT dispara um `docker stack deploy`; como os serviços já
#    estão alinhados, ele é no-op de spec e não recria nada). O script se recusa a
#    publicar se ainda houver divergência.
python3 scripts/_prod-stack-put.py --arquivo .prod-backups/compose-novo.yml --aplicar

# 5. Conferir
python3 scripts/_prod-stack-drift.py     # tem que dar 0 divergências
```

**Por que não `docker stack deploy` direto:** ele atualiza os serviços em paralelo.
Em 2026-06-12 recriar `app`+`mcp`+`worker` juntos estourou a memória do nó e o OOM
killer atingiu o Postgres (crash recovery em produção). O rolling um-a-um do
`deploy-portainer.py` é o que mantém o pico baixo.

> ### ⚠️ EM COMPOSE, OMITIR É APAGAR (lição de 2026-07-13)
>
> O `docker stack deploy` (que o PUT do passo 4 dispara) **remove do serviço tudo que
> o compose não declara**. Na primeira publicação, o compose não trazia
> `deploy.labels` nem `deploy.update_config`, e o deploy apagou:
> - **`com.nexus.autodeploy=true`** de `app`/`mcp`/`worker` , o Shepherd só atualiza
>   serviço com esse label, então **o auto-deploy morreu em silêncio**;
> - **`UpdateConfig`/`RollbackConfig`** , o update virou `stop-first` e o app deu 502.
>
> Os dois estão declarados no compose agora. **Nunca publique um compose sem antes ver
> o aviso de "seria APAGADO" do `_prod-stack-put.py`**, e sempre tenha o backup da
> stack (`_prod-stack-drift.py` grava em `.prod-backups/`). Foi o backup que permitiu
> descobrir o que havia sumido.

**Memória do worker (medida, não chutada):** teto do container **3072M** com heap V8
de **2048M**. O pico real de um ciclo completo (sync + rebuild dos fatos) medido em
produção é de ~0,5 GB (`scripts/_prod-worker-mem.py`). O 4608M anterior veio de
chute. Os limites do Swarm são **teto**, não reserva: não tiram RAM dos outros
serviços.

---

## 5. GUIA , montar deploy automatizado num PROJETO NOVO (do zero)

Receita reutilizável para qualquer projeto que rode em Docker Swarm na mesma
VPS (Portainer), publicando imagens no ghcr. Siga na ordem e não terá os
problemas de CI/firewall/token.

**Pré-requisitos (uma vez por VPS):**
1. O nó do Swarm precisa estar logado no ghcr: `docker login ghcr.io -u <user>`
   com um PAT `read:packages`. Isso cria `/root/.docker/config.json` , é dele
   que o Shepherd tira a credencial. (Na nossa VPS já está feito.)
2. O Portainer já tem o registry ghcr salvo (para o deploy manual de fallback).

**No projeto novo:**
1. **CI/CD no GitHub Actions:** um workflow que, no push para `main`, builda a
   imagem e publica em `ghcr.io/<org>/<projeto>:latest`. (Autentica no ghcr com
   o `GITHUB_TOKEN`, que tem `packages: write` por padrão.) **NÃO** tente fazer
   o job de deploy chamar a VPS , o runner do GitHub é bloqueado pela borda
   dela; o deploy é responsabilidade do Shepherd. Pode até remover/encurtar o
   job de deploy.
2. **Suba a stack no Swarm** (via Portainer) com a imagem `:latest`.
3. **Marque os serviços que devem se auto-atualizar** com o label
   `com.nexus.autodeploy=true` (só os de aplicação , NUNCA banco/redis, que têm
   tag fixa e não devem ser recriados à toa).
4. **Crie UM Shepherd por projeto** (ou reuse um Shepherd global filtrando por
   label) , o do projeto observa só os serviços marcados. Config idêntica à da
   seção 3 (ajuste o `Name`). Use **sempre**: `FILTER_SERVICES=label=...`,
   `WITH_REGISTRY_AUTH=true` + mount do `config.json`, `SLEEP_TIME=5m`,
   `ROLLBACK_ON_FAILURE=true`, e mount do `docker.sock` (ro), no manager.
5. **Teste com `RUN_ONCE_AND_EXIT=true` + `VERBOSE=true` ANTES de deixar
   contínuo.** Veja nos logs: (a) "Send registry authentication details" =
   autenticou; (b) ele toca SÓ os serviços marcados; (c) rode 2x , a 2ª deve
   dar "No updates" (no-op). Só então crie o contínuo (sem `RUN_ONCE`).

**Armadilhas que esse guia evita (não repita os becos):**
- "Quota do Actions esgotada" / "precisa de PAT" , **falso**. O CI e o build
  rodam; a credencial do ghcr já está no nó/Portainer.
- Deploy pelo runner do GitHub , **não funciona** (firewall da VPS).
- Recriar todos os serviços juntos , **estoura memória** (rolling sempre).
- Shepherd sem `FILTER_SERVICES` , **atualizaria TODOS os serviços do Swarm**,
  inclusive de outros projetos e bancos. Sempre filtrar por label.

> Quer reusar este doc num projeto novo? Copie esta seção 5 para o runbook dele.

---

## 6. Verificação e rollback

- **Health:** `curl https://<host>/api/health` → `{"ok":true}`.
- **Shepherd vivo:** no Portainer, serviço `shepherd-nexus-odoo` com 1 réplica
  running. Logs mostram "No updates" (parado) ou "was updated" (subiu versão).
- **Versão rodando:** serviços `app`/`mcp`/`worker` com `UpdatedAt` recente após
  um push.
- **Rollback:** o Shepherd já volta sozinho se a versão nova não subir
  (`ROLLBACK_ON_FAILURE`). Manual: pela UI do Portainer (serviço → Update →
  imagem da revisão anterior). NUNCA reiniciar o `db` durante um crash recovery
  (recomeça o replay; espere, é automático).

---

## 7. Histórico das causas-raiz (para não repetir investigação)

- **HTTP 000 no job deploy do Actions (2026-06-12):** a borda da VPS bloqueia
  IPs de datacenter (runner do GitHub). Build sempre funciona; só o passo
  runner→VPS não. Resolvido movendo o deploy para DENTRO da VPS (Shepherd) e,
  como fallback, `deploy-portainer.py` (roda da sua máquina, que alcança a VPS).
- **OOM/crash recovery do banco (2026-06-12):** recriar app+mcp+worker juntos
  estourou o teto de 1GB do container do `db` (VPS compartilhada, ~79
  containers). Resolvido: rolling 1-a-1 (Shepherd e o script já fazem). O 1GB do
  `db` é folgado em operação normal (~90MB reais; resto é cache); NÃO precisa
  aumentar.
- **"update out of sequence" no deploy manual (2026-06-14):** o script usava a
  versão velha do serviço. Resolvido: re-GET da versão fresca por serviço +
  retry.
- **Credencial do ghcr:** não há PAT em arquivo nenhum, e não precisa , o nó tem
  `/root/.docker/config.json` com o login do ghcr, e o Portainer tem o registry
  id=1. O Shepherd usa o do nó; o deploy manual usa o do Portainer.

### Recriar o Shepherd (se precisar)

Spec do serviço Swarm (via `POST /endpoints/1/docker/services/create` na API do
Portainer, com o `PORTAINER_TOKEN`): imagem `containrrr/shepherd:latest`; env
`SLEEP_TIME=5m WITH_REGISTRY_AUTH=true FILTER_SERVICES=label=com.nexus.autodeploy=true
ROLLBACK_ON_FAILURE=true IMAGE_AUTOCLEAN_LIMIT=3 VERBOSE=true TZ=America/Sao_Paulo`;
mounts `/var/run/docker.sock:ro` e `/root/.docker/config.json:ro`; constraint
`node.role==manager`; restart `any`; 1 réplica.
