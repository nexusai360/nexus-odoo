# Deploy do nexus-odoo , PROCEDIMENTO CANÔNICO (ler ANTES de qualquer deploy)

> **REGRA DE RAIZ.** Toda vez que for pensar em deploy/subida pra produção, a
> PRIMEIRA coisa a fazer é ler este arquivo inteiro. Ele tem as coordenadas
> corretas: como mergear o PR, como a imagem sobe e como o deploy de fato chega
> na VPS. Não improvisar, não investigar servidor antes de seguir o passo a
> passo daqui. Atualizado 2026-06-12 com a causa raiz definitiva e a rota que
> funciona.

---

## TL;DR , os 2 comandos, nesta ordem

```bash
# 1) Mergear o PR na main (espera CI verde, squash-merge). Dispara o BUILD da imagem.
python3 scripts/ship.py "titulo do PR"        #  (ou: --merge-only <PR#>)

# 2) Quando build-app e build-mcp derem SUCCESS (a imagem nova está no ghcr),
#    fazer o redeploy a partir de uma máquina que ALCANÇA a VPS (a sua, não o runner):
python3 scripts/deploy-portainer.py           #  app + mcp + worker
```

O passo 2 é o que realmente atualiza produção. O job `deploy` do GitHub Actions
**não funciona** (motivo abaixo) e deve ser ignorado , ele falha sozinho sem
afetar nada. Verificação final: `https://agentenex.nexusai360.com/api/health`
deve responder `{"ok":true}` (o `deploy-portainer.py` já confere no fim).

---

## A causa raiz definitiva (provada no log, 2026-06-12)

O pipeline tem 3 jobs: `build-app`, `build-mcp`, `deploy`.

- **`build-app` e `build-mcp` SEMPRE funcionam** (3-4 min cada). A imagem é
  construída e **publicada no ghcr** (`ghcr.io/nexusai360/nexus-odoo:latest` e
  `...-mcp:latest`) normalmente. Isso nunca foi o problema.
- **`deploy` SEMPRE falha** e leva 30-60 min penando. No log
  (`gh run view <id> --log-failed`): `Pull ghcr.io/...: HTTP 000`,
  `Janela de rede fechada (TCP nao conecta)`, repetido por ~12 rodadas até
  `falha de deploy real`.

**Por quê:** a proteção de borda da VPS (Traefik/firewall do provedor) **bloqueia
o IP do runner do GitHub** (faixas de datacenter Azure/GitHub). O runner não
estabelece TCP com o Portainer da VPS. Da **sua máquina** (rede residencial) o
Portainer responde em ms. Logo: o build no GitHub é ótimo; só o passo
runner→VPS é que não passa. Não é quota de Actions, não é falta de token, não é
o Portainer, não é o GitHub. É rede runner→VPS.

> Diagnósticos antigos que estavam ERRADOS (corrigidos aqui): "quota do Actions
> esgotada" (falso , o CI e os builds rodam), "precisa de um PAT read:packages
> que não existe" (falso , a credencial do ghcr **já está salva no Portainer**,
> ver abaixo). Não repetir esses becos.

---

## Por que o redeploy manual via Portainer FUNCIONA (e não precisa de PAT)

A peça que faltava: **o Portainer já tem o registry do ghcr configurado com
autenticação salva** , registry id=1, "GitHub Container Registry", `URL=ghcr.io`,
usuário `jvzanini`, `Authentication=true`. Ou seja, a credencial de pull da
imagem privada **existe dentro do Portainer**. Quando mandamos o serviço
atualizar passando `registryId=1`, o Portainer anexa o `X-Registry-Auth` dessa
credencial e o **próprio host do swarm puxa a imagem nova do ghcr** (host→ghcr,
sem runner e sem o Traefik no meio). Por isso nenhum `GHCR_TOKEN` solto é
necessário , e por isso varrer os projetos atrás de um PAT é perda de tempo
(não existe nenhum preenchido; todos os `.env.production` têm o campo vazio).

`scripts/deploy-portainer.py` faz exatamente isso para `app`, `mcp` e `worker`:
GET da spec → força a imagem `:latest` (sem digest pinado) → `ForceUpdate++` com
`registryId` do ghcr → poll até as tasks convergirem → checa o `/api/health`.

### Credencial do Portainer (de onde o script lê)

`PORTAINER_URL` e `PORTAINER_TOKEN`. O script resolve nesta ordem:
1. variáveis de ambiente `PORTAINER_URL` / `PORTAINER_TOKEN`;
2. `.env.local` do projeto (recomendado deixar ali, não é commitado);
3. fallback: `.env.production` dos projetos irmãos da mesma infra
   (`nexus-blueprint`, `nexus-nfe`, `nexus-crm-krayin`) , todos compartilham o
   mesmo Portainer/VPS, então o `PORTAINER_TOKEN` (`ptr_...`) é o mesmo.

Para fixar no projeto (uma vez), adicionar ao `.env.local` (NÃO commitar):
```
PORTAINER_URL=https://<host-do-portainer>
PORTAINER_TOKEN=ptr_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Passo a passo completo (o que fazer, sempre nesta ordem)

1. **Branch commitada e pushada.** `git push origin <branch>`.
2. **PR sem conflito com a main.** Se `gh pr view <N> --json mergeable` der
   `CONFLICTING`: `git fetch origin main && git merge origin/main`, resolver
   (esta branch costuma ser superconjunto → `git checkout --ours` nos arquivos
   de onda; conferir `build.yml`/`ship.py` pela data do último commit de cada
   lado), `npx tsc --noEmit && npx jest`, commitar o merge, push.
3. **Mergear:** `python3 scripts/ship.py "titulo"`. Ele espera o CI `validate`
   ficar verde e faz o **squash-merge**. (Se o `ship.py` ficar preso na fase de
   deploy, tudo bem , ver passo 5; o merge e o build já aconteceram.)
   - `ship.py` fala com a API do GitHub direto nos IPs clássicos (`140.82.x`)
     porque `api.github.com` às vezes resolve pro IP Azure inalcançável desta
     rede. Por isso **não** recriar o merge com `gh pr merge` na mão.
4. **Esperar o build:** os jobs `build-app` e `build-mcp` do "Build and Push"
   na `main` devem dar `success` (~5 min). Confere com
   `gh run list --workflow="Build and Push" --branch main --limit 1` e
   `gh api /repos/nexusai360/nexus-odoo/actions/runs/<id>/jobs --jq '.jobs[]|.name+" "+(.conclusion//.status)'`.
   Só os dois `build-*` importam; o `deploy` vai dar `failure/cancelled` , **ignore**.
5. **Deploy de verdade:** `python3 scripts/deploy-portainer.py`. Sai com 0 quando
   os serviços convergiram e o `/api/health` respondeu `{"ok":true}`.
6. **Pós-deploy (quando aplicável):**
   - schema mudou → as migrations aditivas aplicam no boot via `migrate deploy`;
   - `toolDigest`/backfills → rodar o backfill em prod (Portainer exec no
     container `app`), ex.: `scripts/backfill-tool-digest.ts`;
   - prompt mudou e `usesCodeDefaults=false` → `sync-agent-prompt`.

---

## Saída definitiva (eliminar o passo manual no futuro)

Tornar o deploy **pull-based na VPS**: um shepherd/watchtower no swarm que
observa o ghcr e se atualiza sozinho usando a credencial que **já está no
Portainer** (registry id=1). Aí o `git push`/merge basta e o passo 5 some.
Enquanto isso não existe, a rota canônica é `ship.py` (merge+build) +
`deploy-portainer.py` (redeploy). O job `deploy` do Actions pode ser
desativado/encurtado para não gastar 30-60 min penando a cada merge.

---

## INCIDENTE 2026-06-12 (deploy das ondas M/O/P) , lição obrigatória

O primeiro deploy via Portainer recriou `app`+`mcp`+`worker` **ao mesmo tempo**.
O pico de memória derrubou o Postgres: o container do `db` tem teto de **1GB**
e vive num nó compartilhado com ~79 containers; a memória anônima estourou 1GB,
o OOM killer atingiu o Postgres e o cluster entrou em **crash recovery**. O
recovery durou ~30min (lento, mas completou sozinho) e tudo voltou , as
migrations M/O/P aplicaram, `pg_is_in_recovery()=f`, RSS real do db = ~93MB
(o resto é page cache reclaimável, normal). Nenhum dado perdido.

Regras que saíram disso (já refletidas no `deploy-portainer.py`):
1. **Rolling, UM serviço por vez** (worker→mcp→app) com pausa, nunca os três
   juntos , mantém o pico de memória baixo. O script já faz isso.
2. **NUNCA reiniciar o `db` durante recovery** , recomeça o replay do zero.
   Esperar; o recovery do Postgres é automático e completa.
3. **Diagnóstico sem conectar:** `pg_controldata` (estado do cluster , mas
   "in production" ali é o último estado ANTES do crash, não prova fim do
   recovery), processos via `/proc/*/cmdline` (se há `checkpointer`/`walwriter`/
   `autovacuum launcher` rodando, o recovery TERMINOU), e `memory.stat` do
   cgroup (anon=RSS real perigoso; file=cache reclaimável, ok). `df` rápido +
   `psql` pendurado = banco ainda em recovery, NÃO disco/IO do nó.
4. **Pendência de infra (recomendar ao usuário):** o limite de 1GB do serviço
   `db` é apertado para um banco de ~1.5GB. Subir para 2GB (service update do
   `db`, fora de horário, recria o container) elimina a margem de OOM em picos.

## Verificação e rollback

- **Health:** `curl -s https://agentenex.nexusai360.com/api/health` → `{"ok":true}`.
- **Imagem/revisão rodando:** listar serviços via Portainer
  (`GET /api/endpoints/1/docker/services`) e olhar `UpdatedAt` + imagem.
- **Rollback:** `POST /api/endpoints/1/docker/services/<id>/update` com
  `Spec.TaskTemplate.ForceUpdate` apontando o digest anterior, ou via UI do
  Portainer (serviço → "Update" → imagem da revisão anterior). O swarm mantém a
  task antiga até a nova passar no healthcheck.
